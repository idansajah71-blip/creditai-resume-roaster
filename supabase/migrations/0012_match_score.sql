-- Migration 0012: first-class match_score on ai_jobs.
-- History and dashboard views currently parse the full `result` JSON to read
-- the score, so /history ships every complete analysis (rewrite included)
-- just to render "72/100". Storing the score as its own column lets those
-- queries select the number instead of the blob. The column is nullable:
-- older rows are backfilled best-effort below, and the UI keeps falling back
-- to parsing `result` when the column is still null.

alter table public.ai_jobs
  add column if not exists match_score integer;

alter table public.ai_jobs drop constraint if exists ai_jobs_match_score_check;
alter table public.ai_jobs add constraint ai_jobs_match_score_check
  check (match_score is null or (match_score >= 0 and match_score <= 100));

-- Best-effort backfill from stored results. A row whose result is not valid
-- JSON (or has no integer matchScore) simply keeps a null column; nothing is
-- deleted or rewritten. Each row is guarded individually so one bad blob
-- cannot abort the backfill.
do $$
declare
  r record;
begin
  for r in
    select id, result from public.ai_jobs
    where match_score is null and result is not null
  loop
    begin
      update public.ai_jobs
        set match_score = ((r.result)::jsonb ->> 'matchScore')::int
        where id = r.id;
    exception when others then
      null; -- unparsable result: leave match_score null, UI falls back
    end;
  end loop;
end $$;
