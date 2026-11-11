-- Migration 0010: outcome guarantee engine and automatic refunds
-- "AI proposes, code disposes": the route evaluates a deterministic quality bar
-- (lib/guarantee.ts) and this migration owns the money side. A refund only ever
-- happens through apply_guarantee_refund, which locks the job and profile rows
-- and is idempotent on the ledger key 'guarantee:<job id>'.

-- Guarantee fields on ai_jobs. coverage_before/coverage_after persist the
-- deterministic keyword coverage so the decision is auditable after the fact;
-- prompt/completion tokens are optional usage counters (nullable, unset unless
-- the route provides them).
alter table public.ai_jobs
  add column if not exists coverage_before numeric(5,1);
alter table public.ai_jobs
  add column if not exists coverage_after numeric(5,1);
alter table public.ai_jobs
  add column if not exists guarantee_status text not null default 'not_applicable';
alter table public.ai_jobs
  add column if not exists guarantee_reason jsonb;
alter table public.ai_jobs
  add column if not exists guarantee_checked_at timestamptz;
alter table public.ai_jobs
  add column if not exists prompt_tokens integer;
alter table public.ai_jobs
  add column if not exists completion_tokens integer;

alter table public.ai_jobs drop constraint if exists ai_jobs_guarantee_status_check;
alter table public.ai_jobs add constraint ai_jobs_guarantee_status_check
  check (guarantee_status in ('not_applicable','met','refunded','waived'));
create index if not exists idx_jobs_guarantee_pending
  on public.ai_jobs(user_id, created_at)
  where status = 'succeeded' and guarantee_checked_at is null;

-- Ledger type: extend the existing check, keeping every prior value.
alter table public.credit_transactions drop constraint if exists credit_transactions_type_check;
alter table public.credit_transactions add constraint credit_transactions_type_check
  check (type in ('purchase','reservation','consumption','refund','adjustment','purchase_refund','guarantee_refund'));

-- Automatic refund when the guarantee is not met.
-- Rules enforced here, never by the client or the model:
--   - only succeeded jobs whose reserved credit was actually consumed,
--     and still guarantee_status = 'not_applicable';
--   - per-user daily cap (count of ledger rows of type 'guarantee_refund'
--     in the last 24 hours); beyond the cap the status becomes 'waived'
--     and nothing is refunded;
--   - refund adds credits_cost back to credit_balance and writes exactly one
--     ledger row with idempotency key 'guarantee:' || job id;
--   - a second call returns the same result without a double refund.
create or replace function public.apply_guarantee_refund(
  p_job_id uuid,
  p_reason jsonb,
  p_daily_limit int default 3
)
returns table(status text, credits_refunded int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ai_jobs%rowtype;
  v_bal int;
  v_resv int;
  v_count int := 0;
  v_credits int := 0;
begin
  select * into v_job from public.ai_jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;

  -- Idempotent replay: a decided job never changes outcome.
  if v_job.guarantee_status = 'refunded' then
    select coalesce(amount, 0) into v_credits
      from public.credit_transactions
      where idempotency_key = 'guarantee:' || p_job_id::text;
    return query select 'refunded'::text, coalesce(v_credits, 0);
    return;
  end if;
  if v_job.guarantee_status <> 'not_applicable' then
    return query select v_job.guarantee_status, 0;
    return;
  end if;

  if v_job.status <> 'succeeded' then
    raise exception 'job_not_succeeded' using errcode = 'P0001';
  end if;

  -- Guarantee candidates paid and consumed their credit.
  select r.status into v_resv
    from public.credit_reservations r
    where r.id = v_job.reservation_id;
  if v_resv is distinct from 'consumed' then
    raise exception 'credit_not_consumed' using errcode = 'P0001';
  end if;

  -- Lock the profile row only when we intend to move money.
  select credit_balance, credit_reserved into v_bal, v_resv
    from public.profiles where id = v_job.user_id for update;
  if v_bal is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  -- Daily cap on automatic refunds (ledger rows of this user/job type).
  select count(*) into v_count
    from public.credit_transactions
    where user_id = v_job.user_id
      and type = 'guarantee_refund'
      and created_at > now() - interval '24 hours';
  if v_count >= p_daily_limit then
    update public.ai_jobs
      set guarantee_status = 'waived',
          guarantee_reason = coalesce(p_reason, '{}'::jsonb),
          guarantee_checked_at = now()
      where id = p_job_id;
    return query select 'waived'::text, 0;
    return;
  end if;

  v_credits := v_job.credits_cost;

  update public.profiles
    set credit_balance = credit_balance + v_credits
    where id = v_job.user_id
    returning credit_balance, credit_reserved into v_bal, v_resv;

  insert into public.credit_transactions
      (user_id, type, amount, balance_after, reserved_after,
       reference_type, reference_id, idempotency_key)
    values
      (v_job.user_id, 'guarantee_refund', v_credits, v_bal, v_resv,
       'guarantee', p_job_id::text, 'guarantee:' || p_job_id::text);

  update public.ai_jobs
    set guarantee_status = 'refunded',
        guarantee_reason = coalesce(p_reason, '{}'::jsonb),
        guarantee_checked_at = now()
    where id = p_job_id;

  return query select 'refunded'::text, v_credits;
end;
$$;

-- Mark the guarantee as met and stamp the coverage numbers (idempotent: only
-- transitions from 'not_applicable'; later calls are no-ops).
create or replace function public.mark_guarantee_met(
  p_job_id uuid,
  p_before numeric,
  p_after numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_jobs
    set guarantee_status = 'met',
        coverage_before = coalesce(coverage_before, p_before),
        coverage_after = coalesce(coverage_after, p_after),
        guarantee_checked_at = now()
    where id = p_job_id and guarantee_status = 'not_applicable';
end;
$$;

revoke all on function public.apply_guarantee_refund(uuid, jsonb, int) from public, anon, authenticated;
revoke all on function public.mark_guarantee_met(uuid, numeric, numeric) from public, anon, authenticated;
