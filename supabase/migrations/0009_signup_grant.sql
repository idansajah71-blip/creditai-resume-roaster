-- Migration 0009: starter credits for new users
-- Every new profile receives a small free credit grant so users can try the
-- analysis before paying. Trade-off (documented in README Security section):
-- automated signup abuse is bounded because every analysis still consumes
-- credits through the same per-user and global daily caps
-- (AI_DAILY_LIMIT_PER_USER / AI_GLOBAL_DAILY_LIMIT).

-- Starter grant size; change this one constant to adjust it.
-- (Kept in the migration on purpose: the value is decided at provision time,
-- not runtime config, so replicated databases stay consistent.)
--
-- Idempotency: grant_credits dedupes on the ledger idempotency_key
-- 'signup:<uuid>', so the grant can never be issued twice; the inner
-- EXCEPTION block makes the grant best effort so account creation never
-- fails because credits could not be granted.

create or replace function public.grant_signup_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starter int := 3;
begin
  begin
    perform public.grant_credits(
      new.id,                                     -- user
      v_starter,                                  -- starter credits
      'signup:' || new.id::text,                  -- idempotency key
      'signup_grant',                             -- reference type
      new.id::text                                -- reference id
    );
  exception
    when others then
      -- Best effort: a failed grant must never block user creation.
      null;
  end;
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.grant_signup_credits();

revoke all on function public.grant_signup_credits() from public;
revoke all on function public.grant_signup_credits() from anon;
revoke all on function public.grant_signup_credits() from authenticated;
