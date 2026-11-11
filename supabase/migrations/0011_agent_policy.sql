-- Migration 0011: spending mandate and agent policy audit trail
-- Phase 4 is policy-only: no model is involved. The money side is still owned
-- by SQL and by the human on PayPal. An agent order is always created as
-- source = 'agent' and can only ever reach the 'needs_approval' verdict; the
-- human approves the payment, so the model never completes a purchase.
--
-- Writes to spend_mandates and agent_actions happen exclusively through server
-- routes using the service role. Clients can only SELECT their own rows.

-- 1. Where did a PayPal order come from? Existing rows stay 'user'.
alter table public.paypal_orders
  add column if not exists source text not null default 'user';
alter table public.paypal_orders drop constraint if exists paypal_orders_source_check;
alter table public.paypal_orders add constraint paypal_orders_source_check
  check (source in ('user','agent'));

-- Supports the weekly agent-spend aggregate without scanning user history.
create index if not exists idx_pp_orders_agent_spend
  on public.paypal_orders(user_id, created_at)
  where source = 'agent';

-- 2. The user's spending mandate. Caps are deliberately hard-coded here as a
-- second line of defence: even a compromised server route cannot store a
-- weekly or per-pack limit above 50 USD.
create table if not exists public.spend_mandates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  max_weekly_usd numeric(10,2) not null default 0
    check (max_weekly_usd >= 0 and max_weekly_usd <= 50),
  max_pack_usd numeric(10,2) not null default 0
    check (max_pack_usd >= 0 and max_pack_usd <= 50),
  allowed_package_ids text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists spend_mandates_updated on public.spend_mandates;
create trigger spend_mandates_updated before update on public.spend_mandates
  for each row execute function public.set_updated_at();

alter table public.spend_mandates enable row level security;
drop policy if exists "spend_mandates_select_own" on public.spend_mandates;
create policy "spend_mandates_select_own" on public.spend_mandates
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy: every write goes through
-- PUT /api/agent/mandate with the service role and the session user id.

-- 3. Audit trail for every policy decision. args stores the stripped/normalized
-- arguments, never raw model output. result is filled by later phases; this
-- migration only defines the shape and the read policy.
create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  policy_verdict text not null
    check (policy_verdict in ('allowed','blocked','needs_approval')),
  policy_reason text,
  result jsonb,
  amount_usd numeric(10,2),
  paypal_order_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_actions_user_created
  on public.agent_actions(user_id, created_at desc);

alter table public.agent_actions enable row level security;
drop policy if exists "agent_actions_select_own" on public.agent_actions;
create policy "agent_actions_select_own" on public.agent_actions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy: the server route writes with the service role.

-- 4. Weekly agent spend. "Non-failed" means every order that may still have
-- moved money: created, approved, captured or refunded. A refunded order still
-- counts for the week in which it was created; only failed orders are ignored.
-- SECURITY DEFINER so the server can aggregate across the user's orders without
-- exposing other users' rows; execution is revoked from every client role.
create or replace function public.agent_spend_7d(p_user_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(o.amount_value), 0)
  from public.paypal_orders o
  where o.user_id = p_user_id
    and o.source = 'agent'
    and o.status <> 'failed'
    and o.created_at >= now() - interval '7 days';
$$;

revoke all on function public.agent_spend_7d(uuid) from public, anon, authenticated;
