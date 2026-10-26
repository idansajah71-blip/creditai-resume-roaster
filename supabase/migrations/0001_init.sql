-- Migration 0001: initial schema for credit-ai-app
-- Apply via Supabase SQL editor or psql. Idempotent-ish (uses IF NOT EXISTS).

create extension if not exists "pgcrypto";

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  credit_balance int not null default 0 check (credit_balance >= 0),
  credit_reserved int not null default 0 check (credit_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists profiles_updated on public.profiles;
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- credit reservations
create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid,
  amount int not null check (amount > 0),
  status text not null check (status in ('held','consumed','refunded')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reservations_user on public.credit_reservations(user_id);
create index if not exists idx_reservations_job on public.credit_reservations(job_id);
drop trigger if exists reservations_updated on public.credit_reservations;
create trigger reservations_updated before update on public.credit_reservations
  for each row execute function public.set_updated_at();

-- credit ledger
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('purchase','reservation','consumption','refund','adjustment')),
  amount int not null,
  balance_after int not null,
  reserved_after int not null,
  reference_type text,
  reference_id text,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_tx_user_created on public.credit_transactions(user_id, created_at desc);

-- ai jobs (analysis history)
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('queued','running','succeeded','failed')),
  input text not null,
  result text,
  model text not null,
  credits_cost int not null check (credits_cost > 0),
  reservation_id uuid references public.credit_reservations(id),
  error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_jobs_user_created on public.ai_jobs(user_id, created_at desc);
drop trigger if exists jobs_updated on public.ai_jobs;
create trigger jobs_updated before update on public.ai_jobs
  for each row execute function public.set_updated_at();

-- paypal orders (payment records)
create table if not exists public.paypal_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  paypal_order_id text not null unique,
  amount_value numeric(10,2) not null,
  currency text not null default 'USD',
  credits_to_grant int not null check (credits_to_grant > 0),
  status text not null check (status in ('created','approved','captured','failed','refunded')),
  capture_id text unique,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pp_orders_user on public.paypal_orders(user_id);
drop trigger if exists pp_orders_updated on public.paypal_orders;
create trigger pp_orders_updated before update on public.paypal_orders
  for each row execute function public.set_updated_at();

-- paypal webhook events
create table if not exists public.paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- profile auto-create on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.paypal_orders enable row level security;
alter table public.paypal_webhook_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "reservations_select_own" on public.credit_reservations;
create policy "reservations_select_own" on public.credit_reservations
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.credit_transactions;
create policy "transactions_select_own" on public.credit_transactions
  for select using (auth.uid() = user_id);

drop policy if exists "jobs_select_own" on public.ai_jobs;
create policy "jobs_select_own" on public.ai_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "orders_select_own" on public.paypal_orders;
create policy "orders_select_own" on public.paypal_orders
  for select using (auth.uid() = user_id);

-- paypal_webhook_events: no policy => only service role can access.