# CreditAI (Phase 1)

Next.js App Router + TypeScript + Tailwind + Supabase Auth/Postgres. Phase 1: auth, protected routes, DB schema/RLS. No PayPal/AI yet.

## Setup

1. Install deps:
   ```bash
   npm install
   ```
2. Copy env:
   ```bash
   cp .env.example .env.local
   ```
   Fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Run migrations: open Supabase SQL editor, paste `supabase/migrations/0001_init.sql`, run.
4. Start dev:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - dev server
- `npm run build` - production build
- `npm run lint` - eslint
- `npm run typecheck` - tsc --noEmit
- `npm run test` - vitest

## Migration notes

- `supabase/migrations/0001_init.sql` creates profiles, credit_reservations, credit_transactions, ai_jobs, paypal_orders, paypal_webhook_events.
- RLS enabled; users can only SELECT their own rows. Writes via service role only.
- Profile auto-created on signup via trigger on auth.users.

## Verification

- Register/login/logout works.
- Protected routes (/dashboard, /analyze, /credits, /history, /transactions) redirect unauthenticated users.
- RLS: user A cannot read user B's rows (verify in Supabase with anon key).

## Environment variables
See `.env.example`. Required: Supabase URL/anon/service role, OpenAI key, PayPal client id/secret/webhook id, app URL.

## Database migrations
Run in order: `0001_init.sql`, `0002_paypal_grant.sql`, `0003_ai_reservations.sql`.

## PayPal Sandbox setup
See `DEPLOYMENT.md` and `/judges`.

## Manual test scenarios
1. Insufficient credits -> 402, no charge.
2. AI failure/malformed output -> refund, job failed.
3. Duplicate capture -> idempotent, no double grant.
4. Webhook replay -> no double grant.
5. Mismatched amount -> 400.

## License
MIT (see `LICENSE`).

## AI tools
See `AI_TOOLS.md`.

## PayPal Sandbox testing (Phase 2)

1. Create a Sandbox business app at developer.paypal.com; note client id/secret.
2. Create a Sandbox buyer (personal) account.
3. Set env: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`.
4. Expose local server via ngrok/cloudflare tunnel; set webhook URL to `/api/paypal/webhook` and subscribe to `PAYMENT.CAPTURE.COMPLETED`.
5. Flow:
   - Login -> POST /api/paypal/orders { packageId: "credits_10" } -> open approvalUrl -> approve with buyer account.
   - POST /api/paypal/orders/{id}/capture -> credits granted, balance increases.
6. Duplicate capture test: call capture endpoint twice -> second returns idempotent, balance unchanged.
7. Webhook retry test: replay the same webhook event -> no double grant (event_id dedup).
8. Mismatched amount: tamper order amount in DB -> capture rejects with 400.