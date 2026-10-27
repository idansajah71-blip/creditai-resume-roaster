-- Migration 0007: privacy - allow nulling old job inputs
-- ai_jobs.input becomes nullable; a scheduled job nulls inputs older than the
-- retention window (default 30 days). Role: run via SQL editor or pg_cron.

alter table public.ai_jobs alter column input drop not null;

create or replace function public.purge_old_job_inputs(
  p_older_than interval default interval '30 days'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.ai_jobs
    set input = null
    where created_at < now() - p_older_than
      and input is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_old_job_inputs(interval) from public, anon, authenticated;
