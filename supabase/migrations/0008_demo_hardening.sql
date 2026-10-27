-- Migration 0008: demo hardening
-- demo_sessions only needs client-side writes via the service role key; the
-- anon/authenticated roles have no legitimate access, so enable RLS with no
-- policies (deny-all) and lock down the SECURITY DEFINER cleanup function.

-- Deny-all row level security: no policies exist, so no role (except the
-- service role, which bypasses RLS) can read or write demo_sessions.
alter table public.demo_sessions enable row level security;

-- cleanup_demo_data is SECURITY DEFINER; only pg_cron (security context) and
-- the service role may run it. Revoke direct access from everyone else.
revoke all on function public.cleanup_demo_data() from public;
revoke all on function public.cleanup_demo_data() from anon;
revoke all on function public.cleanup_demo_data() from authenticated;
