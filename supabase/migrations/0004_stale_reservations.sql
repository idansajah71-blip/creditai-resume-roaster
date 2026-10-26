-- Migration 0004: release stale held reservations

create or replace function public.release_stale_reservations(p_user_id uuid, p_older_than interval)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_rec record;
begin
  for v_rec in
    select id from public.credit_reservations
    where user_id = p_user_id
      and status = 'held'
      and created_at < now() - p_older_than
  loop
    -- refund reservation
    perform public.refund_reservation(v_rec.id);
    -- mark linked ai_job as failed if exists
    update public.ai_jobs
      set status = 'failed', error = 'stale_reservation_released'
      where reservation_id = v_rec.id and status in ('queued','running');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.release_stale_reservations(uuid, interval) from public, anon, authenticated;