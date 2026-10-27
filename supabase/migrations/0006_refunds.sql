-- Migration 0006: unused-credit refunds with PayPal partial refunds
-- "AI proposes, code disposes": deterministic code computes eligibility and the
-- maximum refundable amount; the AI agent only produces a decision and message.
-- No PayPal call is ever made before reserve_purchase_refund succeeds.

-- refunded counters on orders
alter table public.paypal_orders
  add column if not exists refunded_credits int not null default 0;
alter table public.paypal_orders
  add column if not exists refunded_amount numeric(10,2) not null default 0;

-- ledger type: extend check to allow 'purchase_refund'
alter table public.credit_transactions drop constraint if exists credit_transactions_type_check;
alter table public.credit_transactions add constraint credit_transactions_type_check
  check (type in ('purchase','reservation','consumption','refund','adjustment','purchase_refund'));

-- refund requests
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  paypal_order_id text not null,
  credits int not null check (credits > 0),
  amount numeric(10,2) not null,
  currency text not null default 'USD',
  reason text not null,
  ai_decision jsonb,
  status text not null check (status in ('pending','approved','denied','refunded','failed')),
  paypal_refund_id text unique,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_refund_requests_user on public.refund_requests(user_id, created_at desc);
create index if not exists idx_refund_requests_created on public.refund_requests(created_at);
drop trigger if exists refund_requests_updated on public.refund_requests;
create trigger refund_requests_updated before update on public.refund_requests
  for each row execute function public.set_updated_at();

alter table public.refund_requests enable row level security;
drop policy if exists "refund_requests_select_own" on public.refund_requests;
create policy "refund_requests_select_own" on public.refund_requests
  for select using (auth.uid() = user_id);
-- no insert/update/delete policies: writes happen via service role only.

-- Reserve a purchase refund: deduct credits, increment order counters, write ledger.
-- Verifies: order belongs to user, status captured, captured within 14 days,
-- credits fit in refundable remainder, credits fit in current balance.
-- Returns the amount to refund (credits * unit price, rounded to cents).
create or replace function public.reserve_purchase_refund(
  p_user_id uuid,
  p_paypal_order_id text,
  p_credits int,
  p_idempotency text
)
returns table(amount numeric(10,2), balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.paypal_orders%rowtype;
  v_bal int;
  v_reserved int;
  v_unit numeric(12,4);
  v_amount numeric(10,2);
  v_existing numeric(10,2);
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;

  -- idempotency: replay returns the original result with no changes
  select (t.metadata->>'refund_amount')::numeric(10,2) into v_existing
    from public.credit_transactions t
    where t.idempotency_key = p_idempotency and t.type = 'purchase_refund';
  if v_existing is not null then
    select credit_balance into v_bal from public.profiles where id = p_user_id;
    return query select v_existing, coalesce(v_bal, 0);
    return;
  end if;

  select * into o from public.paypal_orders
    where paypal_order_id = p_paypal_order_id and user_id = p_user_id
    for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if o.status <> 'captured' then
    raise exception 'order_not_captured' using errcode = 'P0001';
  end if;
  if o.created_at < now() - interval '14 days' then
    raise exception 'refund_window_expired' using errcode = 'P0001';
  end if;
  if p_credits > o.credits_to_grant - o.refunded_credits then
    raise exception 'refund_exceeds_remaining' using errcode = 'P0001';
  end if;

  select credit_balance into v_bal
    from public.profiles where id = p_user_id for update;
  if v_bal is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if v_bal < p_credits then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  v_unit := o.amount_value / o.credits_to_grant;
  v_amount := round(v_unit * p_credits, 2);
  if o.refunded_amount + v_amount > o.amount_value then
    v_amount := round(o.amount_value - o.refunded_amount, 2);
  end if;
  if v_amount <= 0 then
    raise exception 'refund_amount_zero' using errcode = 'P0001';
  end if;

  update public.profiles
    set credit_balance = credit_balance - p_credits
    where id = p_user_id
    returning credit_balance, credit_reserved into v_bal, v_reserved;

  update public.paypal_orders
    set refunded_credits = refunded_credits + p_credits,
        refunded_amount = refunded_amount + v_amount
    where id = o.id;

  insert into public.credit_transactions
    (user_id, type, amount, balance_after, reserved_after, reference_type, reference_id, idempotency_key, metadata)
  values
    (p_user_id, 'purchase_refund', -p_credits, v_bal, v_reserved, 'paypal_order', o.paypal_order_id, p_idempotency,
     jsonb_build_object('refund_amount', v_amount, 'paypal_order_id', o.paypal_order_id));

  return query select v_amount, v_bal;
end;
$$;

-- Compensation: restore credits and counters if the PayPal refund call failed.
-- Only acts on requests in 'pending' or 'approved' state; removes the ledger row
-- written by reserve_purchase_refund (which used the request id as its key).
create or replace function public.revert_purchase_refund(p_refund_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.refund_requests%rowtype;
  o public.paypal_orders%rowtype;
  v_bal int;
  v_reserved int;
  v_amount numeric(10,2);
begin
  select * into r from public.refund_requests
    where id = p_refund_request_id for update;
  if r.id is null then
    raise exception 'refund_request_not_found' using errcode = 'P0001';
  end if;
  if r.status not in ('pending','approved') then
    return; -- nothing to revert (idempotent)
  end if;

  select * into o from public.paypal_orders
    where paypal_order_id = r.paypal_order_id for update;

  -- find the ledger row written by reserve (key equals the refund request id)
  select (metadata->>'refund_amount')::numeric(10,2) into v_amount
    from public.credit_transactions
    where idempotency_key = r.id::text and type = 'purchase_refund';

  if v_amount is not null then
    update public.profiles
      set credit_balance = credit_balance + r.credits
      where id = r.user_id
      returning credit_balance, credit_reserved into v_bal, v_reserved;

    delete from public.credit_transactions where idempotency_key = r.id::text;

    if o.id is not null then
      update public.paypal_orders
        set refunded_credits = greatest(o.refunded_credits - r.credits, 0),
            refunded_amount = greatest(o.refunded_amount - v_amount, 0)
        where id = o.id;
    end if;
  end if;
end;
$$;

-- Webhook refund handling (dashboard-initiated refunds). Dedupes by refund id.
-- Credits taken back are capped by: refundable remainder, implied credits from
-- the refunded amount, and the current balance. Returns credits deducted.
create or replace function public.apply_external_refund(
  p_paypal_order_id text,
  p_capture_id text,
  p_refund_id text,
  p_amount numeric,
  p_currency text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.paypal_orders%rowtype;
  v_bal int;
  v_reserved int;
  v_unit numeric(12,4);
  v_credits int;
  v_amount numeric(10,2);
begin
  if p_refund_id is null or p_amount is null then
    return 0;
  end if;

  -- dedupe by ledger idempotency key
  if exists (
    select 1 from public.credit_transactions
    where idempotency_key = 'whrefund:' || p_refund_id
  ) then
    return 0;
  end if;

  select * into o from public.paypal_orders
    where (p_paypal_order_id is not null and paypal_order_id = p_paypal_order_id)
       or (p_capture_id is not null and capture_id = p_capture_id)
    for update;
  if o.id is null then
    return 0;
  end if;
  if o.currency <> p_currency then
    return 0;
  end if;

  v_unit := o.amount_value / o.credits_to_grant;
  v_credits := floor(p_amount / v_unit)::int;
  v_credits := least(v_credits, o.credits_to_grant - o.refunded_credits);
  if v_credits <= 0 then
    return 0;
  end if;
  v_credits := least(v_credits, (select credit_balance from public.profiles where id = o.user_id));

  v_amount := least(round(v_unit * v_credits, 2), round(o.amount_value - o.refunded_amount, 2));

  update public.profiles
    set credit_balance = credit_balance - v_credits
    where id = o.user_id
    returning credit_balance, credit_reserved into v_bal, v_reserved;

  update public.paypal_orders
    set refunded_credits = refunded_credits + v_credits,
        refunded_amount = refunded_amount + v_amount
    where id = o.id;

  insert into public.credit_transactions
    (user_id, type, amount, balance_after, reserved_after, reference_type, reference_id, idempotency_key, metadata)
  values
    (o.user_id, 'purchase_refund', -v_credits, v_bal, v_reserved, 'paypal_refund',
     p_refund_id, 'whrefund:' || p_refund_id,
     jsonb_build_object('refund_amount', v_amount, 'webhook', true));

  return v_credits;
end;
$$;

revoke all on function public.reserve_purchase_refund(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.revert_purchase_refund(uuid) from public, anon, authenticated;
revoke all on function public.apply_external_refund(text, text, text, numeric, text) from public, anon, authenticated;
