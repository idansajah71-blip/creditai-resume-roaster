-- Migration 0003: atomic credit reservation/consumption/refund for AI jobs

create or replace function public.reserve_credits(p_user_id uuid, p_amount int, p_idempotency text)
returns table(reservation_id uuid, balance int, reserved int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res uuid;
  v_bal int;
  v_resv int;
begin
  select id into v_res from public.credit_reservations where idempotency_key = p_idempotency;
  if v_res is not null then
    select credit_balance, credit_reserved into v_bal, v_resv from public.profiles where id = p_user_id;
    return query select v_res, coalesce(v_bal,0), coalesce(v_resv,0);
    return;
  end if;

  select credit_balance, credit_reserved into v_bal, v_resv
    from public.profiles where id = p_user_id for update;
  if v_bal is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if v_bal < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.profiles
    set credit_balance = credit_balance - p_amount,
        credit_reserved = credit_reserved + p_amount
    where id = p_user_id
    returning credit_balance, credit_reserved into v_bal, v_resv;

  insert into public.credit_reservations (user_id, amount, status, idempotency_key)
    values (p_user_id, p_amount, 'held', p_idempotency)
    returning id into v_res;

  insert into public.credit_transactions (user_id, type, amount, balance_after, reserved_after, reference_type, reference_id, idempotency_key)
    values (p_user_id, 'reservation', -p_amount, v_bal, v_resv, 'reservation', v_res::text, p_idempotency);

  return query select v_res, v_bal, v_resv;
end;
$$;

create or replace function public.consume_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_amount int;
  v_status text;
  v_bal int;
  v_resv int;
begin
  select user_id, amount, status into v_user, v_amount, v_status
    from public.credit_reservations where id = p_reservation_id for update;
  if v_user is null then raise exception 'not_found' using errcode='P0001'; end if;
  if v_status <> 'held' then return; end if;

  update public.profiles
    set credit_reserved = credit_reserved - v_amount
    where id = v_user
    returning credit_balance, credit_reserved into v_bal, v_resv;

  update public.credit_reservations set status = 'consumed' where id = p_reservation_id;

  insert into public.credit_transactions (user_id, type, amount, balance_after, reserved_after, reference_type, reference_id)
    values (v_user, 'consumption', 0, v_bal, v_resv, 'reservation', p_reservation_id::text);
end;
$$;

create or replace function public.refund_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_amount int;
  v_status text;
  v_bal int;
  v_resv int;
begin
  select user_id, amount, status into v_user, v_amount, v_status
    from public.credit_reservations where id = p_reservation_id for update;
  if v_user is null then raise exception 'not_found' using errcode='P0001'; end if;
  if v_status <> 'held' then return; end if;

  update public.profiles
    set credit_balance = credit_balance + v_amount,
        credit_reserved = credit_reserved - v_amount
    where id = v_user
    returning credit_balance, credit_reserved into v_bal, v_resv;

  update public.credit_reservations set status = 'refunded' where id = p_reservation_id;

  insert into public.credit_transactions (user_id, type, amount, balance_after, reserved_after, reference_type, reference_id)
    values (v_user, 'refund', v_amount, v_bal, v_resv, 'reservation', p_reservation_id::text);
end;
$$;

revoke all on function public.reserve_credits(uuid, int, text) from public, anon, authenticated;
revoke all on function public.consume_reservation(uuid) from public, anon, authenticated;
revoke all on function public.refund_reservation(uuid) from public, anon, authenticated;