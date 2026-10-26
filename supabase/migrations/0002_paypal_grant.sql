-- Migration 0002: atomic, idempotent credit granting for PayPal purchases

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount int,
  p_idempotency text,
  p_reference_type text,
  p_reference_id text
)
returns table(granted boolean, balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_bal int;
  v_reserved int;
begin
  if p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  select id into v_existing
    from public.credit_transactions
    where idempotency_key = p_idempotency;

  if v_existing is not null then
    select credit_balance into v_bal from public.profiles where id = p_user_id;
    return query select false, coalesce(v_bal, 0);
    return;
  end if;

  update public.profiles
    set credit_balance = credit_balance + p_amount
    where id = p_user_id
    returning credit_balance, credit_reserved into v_bal, v_reserved;

  if v_bal is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  insert into public.credit_transactions
    (user_id, type, amount, balance_after, reserved_after, reference_type, reference_id, idempotency_key)
  values
    (p_user_id, 'purchase', p_amount, v_bal, v_reserved, p_reference_type, p_reference_id, p_idempotency);

  return query select true, v_bal;
end;
$$;

-- Only service role should execute; revoke from anon/authenticated.
revoke all on function public.grant_credits(uuid, int, text, text, text) from public;
revoke all on function public.grant_credits(uuid, int, text, text, text) from anon;
revoke all on function public.grant_credits(uuid, int, text, text, text) from authenticated;