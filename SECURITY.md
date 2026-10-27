# Security notes

## Identity and authorization
- Supabase Auth with HTTP-only cookies; `middleware.ts` refreshes sessions and protects /dashboard, /analyze, /credits, /history, /transactions.
- RLS enabled on all app tables; users can only read their own rows. Widespread
  `createServiceClient()` use is limited to route handlers (never client bundles).

## Secrets
- PayPal client id/secret, PayPal webhook id, OpenAI key, Supabase service role key: server-side env only; `.env.local` is gitignored.
- Client-visible values are limited to `NEXT_PUBLIC_*` (PayPal SDK client id, app URL, repo URL, sample). Sandbox buyer display values are placeholders, never real.

## Billing integrity (money and credits)
- All balance changes run through SECURITY DEFINER Postgres RPCs with row locks (`reserve_credits`, `consume_reservation`, `refund_reservation`, `grant_credits`, `release_stale_reservations`, `reserve_purchase_refund`, `revert_purchase_refund`, `apply_external_refund`). Amounts never trust the client.
- Server-side prices only for /api/paypal/orders; package ids come from a fixed allowlist.
- Idempotency keys for orders (`PayPal-Request-Id`), captures (order-id based), grants, refunds (per-segment keys), and webhook events (ledger dedup + refund id skip).
- Ambiguous capture failures are resolved with `GET /v2/checkout/orders/{id}` before any local state change.
- Webhook signature verified via PayPal `POST /v1/notifications/verify-webhook-signature` before processing; unverified events are rejected.

## Abuse, quota and cost controls
- `AI_DAILY_LIMIT_PER_USER` (default 20) and `AI_GLOBAL_DAILY_LIMIT` (default 500) daily analysis caps.
- `DEMO_SESSIONS_DAILY_LIMIT` (default 200) plus 3 sessions/IP/hour via `POST /api/demo/session` (IP salted hash, `DEMO_IP_SALT`).
- `PAYPAL_MAX_ORDERS_PER_DAY` (default 10) order creation cap.
- Refunds capped at 3 requests per 30 days; per-user rate limit on writes; deterministic deny happens before the refund agent is ever called.
- OpenAI calls carry `max_tokens` limits (2000 analysis, 20 scoring, 300 refund agent) and 60s/30s timeouts.

## Ephemeral demo accounts
- `/api/demo/session` creates a fresh account with 5 credits (expires in 24h); demo users and session rows are removed by `cleanup_demo_data()` (scheduled by pg_cron).
- Demo credentials are created server-side and returned once in the API response; nothing hardcoded in the client.

## Privacy defaults
- Resume text is only stored when the user opts in on /analyze ("Save my resume text for history", unchecked by default). Otherwise `ai_jobs.input` is reduced to character counts once the job finishes (success or failure).
- Migration `0007_purge_inputs.sql` adds `purge_old_job_inputs` (nulls inputs older than the retention window; schedule in DEPLOYMENT.md).
- `POST /api/account/delete-data` deletes the user's analysis rows on request (dashboard button + accessible confirmation dialog); ledger and payment records are intentionally kept for financial integrity.
- Public `/privacy` page documents retention, OpenAI processing, PayPal Sandbox payments, and deletion steps.

## Input handling
- Zod schemas with explicit size limits on every request body (resume 20k chars, JD 10k chars, ids/keys length-limited).
- PDF extraction processes uploads in memory (pdf-parse); files are never written to disk.

## Known gaps (accepted for the demo)
1. Rate limiters are in-memory + database counters; horizontal scale needs a shared store (Upstash) for exactness.
2. No CSRF token beyond SameSite cookies (JSON-only API, no form posts) - review before production use.
3. No automated E2E against live PayPal/OpenAI in CI (secrets/pay costs); manual flows verified on Sandbox.
4. The fabrication guard is a heuristic; it can miss or over-flag edge phrasing (documented in docs/EVALUATION.md).
