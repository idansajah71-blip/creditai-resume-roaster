# Engineering Audit — CreditAI Resume Roaster

Status reflects the re-audit pass. Baseline validation at the time of writing: lint PASS, typecheck PASS, 291/291 tests PASS, production build PASS.

## 1. Executive summary

CreditAI is a mature Next.js 16 App Router application with Supabase Auth/Postgres, an OpenAI-compatible analysis pipeline, and a PayPal Sandbox payment/refund system. The codebase already contains substantial hardening (atomic credit RPCs, idempotent orders/captures/webhooks, deterministic fabrication guard, deterministic coverage engine, outcome guarantee with SQL refund, prompt-injection-aware system prompt). This re-audit found and fixed a further set of issues concentrated in the auth redirect path, unbounded ledger queries, and client-side error handling. Remaining risks are operational (in-memory rate limiter, Sandbox-only payments, unverified deployment) rather than architectural.

## 2. Architecture

- Frontend: React 19 server/client components, Tailwind 4, design system "The Red Pen".
- Backend: Next.js route handlers under `app/api/*`, Supabase service client for privileged writes.
- AI: `lib/openai.ts` (analyze + score), `lib/analysis-pipeline.ts` orchestration, Zod schema `lib/ai-schema.ts`.
- Credits: `lib/credits.ts` wraps SECURITY DEFINER RPCs (`reserve_credits`, `consume_reservation`, `refund_reservation`, `grant_credits`).
- Payments: `lib/paypal.ts` wraps PayPal REST v2; routes under `app/api/paypal/*`.
- Database: 11 migrations in `supabase/migrations/`, RLS enabled on all app tables.

## 3. Confirmed strengths

- Server-side package allowlist in `lib/packages.ts`; prices never trusted from the client.
- Capture verification: amount + currency + status checked against the DB order.
- Webhook signature verification via the official PayPal endpoint, with ledger-level dedup.
- Idempotency keys on orders, captures, grants, refunds.
- Fabrication guard deterministic with a JD skills-context exception; coverage engine deterministic.
- Outcome guarantee decided by code + SQL, never by the model.
- Input redaction by default; one-click data deletion; scheduled 30-day purge.

## 4. Issues found and addressed (this re-audit)

| ID | Severity | Area | Description | Resolution |
|---|---|---|---|---|
| R1 | P1 | Auth | `/auth/callback` used the user-controlled `next` query param in a redirect without validation (off-site / mangled-host redirect). | Added `lib/redirect.ts` `safeNextPath()` allowlist; wired into the callback; 5 new tests. |
| R2 | P1 | UX/reliability | `/analyze` PDF upload had unguarded `fetch`/`res.json()`: a network failure left an unhandled rejection and the progress line stuck at "Extracting PDF...". | try/catch/finally, client-side MIME + size pre-checks, input reset, safe error message. |
| R3 | P2 | Reliability | `/analyze` submit did not guard `json.data`/`json.data.jobId`/`json.data.result`; an unexpected payload shape threw in the UI. | Guarded with safe fallbacks and a user-facing error. |
| R4 | P2 | Reliability | `/analyze` mount effect ran `loadHistory()` and the profile fetch without error handling (unhandled rejection risk). | Both wrapped; failures degrade to best-effort. |
| R5 | P2 | Performance | `/transactions` selected the whole `credit_transactions` ledger with no limit; `/history` selected every `ai_jobs` row including full result JSON. | Bounded to the newest 200 / 100 rows respectively; comments document the bound. |
| R6 | P2 | Consistency | `/credits` redirect capture used bare `fetch` while every other purchase call used `fetchWithTimeout` (20 s abort). | Switched to `fetchWithTimeout`. |
| R7 | P2 | Test hygiene | `tests/dbg.test.ts` was a debug leftover: console.log output, zero assertions. | Removed. |
| R8 | P3 | Docs | SECURITY.md stated analysis `max_tokens: 2000`; the code uses 2400. | Corrected. |

Round 3 (abuse protection and error handling):

| ID | Severity | Area | Description | Resolution |
|---|---|---|---|---|
| R9 | P1 | Abuse protection | `/api/ai/extract-pdf` had no rate limit at all; parsing a 5MB PDF is CPU-bound, so the endpoint was the cheapest way to burn server CPU. | Per-user sliding-window limiter (10 uploads / 5 min, in-memory, documented limitation); 9 route tests added. |
| R10 | P2 | Error handling | A malformed PDF that passed the magic-byte check was reported as `501 pdf extraction unavailable`, conflating "server cannot parse PDFs" with "this file is bad". | Parser failures now return 422 with a client-actionable message. |
| R11 | P2 | Abuse protection | `/api/paypal/webhook` parsed arbitrary-size bodies on an unauthenticated endpoint before any check. | 256 KB payload cap (413) before verification; webhook tests extended (oversized, malformed JSON, bad signature, unknown event type). |
| R12 | P2 | UX | Delete-data flow always reloaded the page in `finally`, wiping the error/alert the user was meant to see; `json.data` was also unguarded. | Reload only on success; failures render as an inline `role="alert"`; response guarded. |
| R13 | P3 | UX | Starter-credits banner dismissal was stored in localStorage but never read back, so the banner reappeared on every navigation. | Lazy `useState` initializer reads the stored dismissal; lint-clean (no setState in effect). |

Round 4 (auth flows and history payload):

| ID | Severity | Area | Description | Resolution |
|---|---|---|---|---|
| R14 | P1 | Auth | `/login` read `?next=` from the URL and passed it straight to `router.push()` — the same off-origin redirect the auth callback had. | Reused `safeNextPath()` from `lib/redirect.ts`. |
| R15 | P2 | Auth UX | With Supabase email confirmation enabled, successful signup created no session but the page pushed `/dashboard`, which bounced back to `/login` with no explanation. | The page now detects the session-less signup and shows a "check your email, then log in" confirmation notice. |
| R16 | P2 | Performance | `/history` and `/dashboard` parsed the full `result` JSON (complete rewrite included) just to render the score; `/history` shipped every blob. | New migration `0012_match_score.sql` stores `match_score` (0-100 check, best-effort backfill, no result rewrites); the analyze route stamps it; `/history` selects the column and falls back to JSON only for legacy rows; `/dashboard` does the same. Migration content covered by `tests/match-score-migration.test.ts`. |
| R17 | P3 | Docs | README/DEPLOYMENT/MANUAL_TEST migration lists were stale (missing 0011, and 0012 once added). | Updated all three lists. |

Round 5 (copy accuracy and submission claims):

| ID | Severity | Area | Description | Resolution |
|---|---|---|---|---|
| R18 | P3 | Copy accuracy | `/judges` step 4 described the refund agent as if the model proposed the decision, overstating the AI's role in a money path. | Rewritten: eligibility and the amount are decided by deterministic code; a model only drafts the customer message (matches `lib/refund-math.ts` + `lib/refund-agent.ts`). |
| R19 | P3 | Copy accuracy | `/privacy` stated as flat fact that data "is sent to the OpenAI API" and OpenAI does not train on it, although the provider is configurable. | Softened to "the configured AI provider (OpenAI Chat Completions by default)" with advice to check another provider's policy. |
| R20 | P2 | Docs | `DEVPOST.md` (submission text) contained stale numbers: "82 automated tests" (actual 291) and "5 real fixtures" (actual 8 pairs in `tests/fixtures/guarantee/manifest.json`); the refund-agent line had the same overstatement as R18. | Corrected both numbers after verifying against the code and manifest; refund wording aligned with the deterministic decision. Verified claims that check out: `whrefund:<refund_id>` ledger key (migration 0006), `refund_requests.paypal_refund_id` uniqueness, `gpt-4o-mini` default model, purge/retention behavior. |

Issues from the previous audit pass that remain fixed: security headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) in `next.config.ts`; prompt-injection trust boundaries in `lib/openai.ts` and `lib/refund-agent.ts`; PDF magic-byte validation and extracted-text cap in `app/api/ai/extract-pdf/route.ts`; `currentModel()` consistency in `lib/refund-agent.ts`.

## 5. Remaining concerns / limitations

- Rate limiters are in-memory + DB-backed; horizontal scale needs a shared store.
- Payments are Sandbox by default; live mode requires deliberate configuration and QA.
- The fabrication guard is heuristic, not a fact-checker.
- No deployment performed from this environment; `npm run build` passes locally.
- RLS policies exist in migrations; not re-verified against a live database in this pass.
- Migration `0012_match_score.sql` has not been applied to a hosted database from this environment; `/history` keeps the JSON fallback so the page works either way.