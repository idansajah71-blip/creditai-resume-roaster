# Deployment

## Vercel
1. Push repo to GitHub.
2. Import in Vercel.
3. Set all env vars from `.env.example` (including `NEXT_PUBLIC_APP_URL` to your domain).
4. Deploy.

## Database
- Run `supabase/migrations/0001_init.sql`, `0002_paypal_grant.sql`, `0003_ai_reservations.sql`, `0004_stale_reservations.sql`, `0005_demo_sessions.sql`, `0006_refunds.sql`, `0007_purge_inputs.sql` in Supabase SQL editor (in order).

## Privacy retention
- Migration `0007_purge_inputs.sql` makes `ai_jobs.input` nullable and adds `purge_old_job_inputs(p_older_than interval default interval '30 days')`
  (SECURITY DEFINER, runs as the database owner; it nulls inputs older than the window and returns the row count).
- Schedule the daily purge with Supabase pg_cron (Database > Extensions > enable `pg_cron`, then):
  ```sql
  select cron.schedule(
    'purge-job-inputs',
    '45 2 * * *',
    $$select public.purge_old_job_inputs(interval '30 days');$$
  );
  ```
- Retention default in the app: resume text is NOT stored unless the user checks
  "Save my resume text for history" on /analyze. When unchecked, `ai_jobs.input`
  holds only character counts (`{"resumeChars": n, "jobChars": n}`) once the job
  finishes (success or failure).
- Users can delete their own analysis history (`ai_jobs`) at any time via the
  "Delete my analysis data" button on the dashboard. Credit ledger and payment
  records are intentionally kept for financial integrity.

## Cost protection (OpenAI)
- In the OpenAI dashboard, set a hard monthly spend limit on your project. This caps real cost even if env limits are misconfigured.
- Tune `AI_DAILY_LIMIT_PER_USER`, `AI_GLOBAL_DAILY_LIMIT`, `PAYPAL_MAX_ORDERS_PER_DAY`, `DEMO_SESSIONS_DAILY_LIMIT` in env.

## Ephemeral demo sessions
- `POST /api/demo/session` creates a fresh demo user (email `demo-<random>@creditai.local`), grants 5 credits, and is limited per IP (3/hour) and globally (`DEMO_SESSIONS_DAILY_LIMIT`/day).
- Demo users and `demo_sessions` rows older than 24h are removed by the SQL function `public.cleanup_demo_data()`.
- Schedule cleanup with Supabase pg_cron (Database > Extensions > enable `pg_cron`, then):
  ```sql
  select cron.schedule(
    'cleanup-demo',
    '15 * * * *',
    $$select public.cleanup_demo_data();$$
  );
  ```

## PayPal Sandbox
- Create Sandbox app, set webhook URL to `https://<domain>/api/paypal/webhook`.
- Subscribe to `PAYMENT.CAPTURE.COMPLETED` **and** `PAYMENT.CAPTURE.REFUNDED`.
- Copy Webhook ID into `PAYPAL_WEBHOOK_ID`.
- Set `NEXT_PUBLIC_PAYPAL_CLIENT_ID` to enable inline Smart Buttons on `/credits` (fallback redirect flow works without it).

## Verify
- `npm run build` must pass.
- `npm run test` must pass.
- Public URL not verified in this environment (no deployment performed).