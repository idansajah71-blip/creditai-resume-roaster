-- Migration 0005: demo session tracking and cleanup

create table if not exists public.demo_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_demo_sessions_ip_created on public.demo_sessions(ip_hash, created_at desc);
create index if not exists idx_demo_sessions_created on public.demo_sessions(created_at);

-- Cleanup function for ephemeral demo users older than 24h
create or replace function public.cleanup_demo_data()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from auth.users
    where email like 'demo-%@creditai.local'
      and created_at < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  delete from public.demo_sessions where created_at < now() - interval '24 hours';
  return v_count;
end;
$$;
