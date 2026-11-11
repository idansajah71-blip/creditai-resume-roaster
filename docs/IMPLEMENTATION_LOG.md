# Implementation Log

## 2026-11-11 — Round 5: copy accuracy and submission claims

- Area: Copy accuracy (AI role in money paths)
  - Problem: `/judges` step 4 implied the AI refund agent proposes decisions; `/privacy` stated OpenAI-specific claims as flat facts although the provider is env-configurable.
  - Solution: judges copy now says eligibility/amount are decided by deterministic code and a model only drafts the customer message; privacy copy says "the configured AI provider (OpenAI Chat Completions by default)".
  - Files: `app/judges/page.tsx`, `app/privacy/page.tsx`

- Area: Submission text accuracy (DEVPOST.md)
  - Problem: "82 automated tests" (actual 291) and "5 real fixtures" (actual 8 pairs in `tests/fixtures/guarantee/manifest.json`); refund-agent line overstated the model's role.
  - Solution: both numbers corrected after verification; refund wording aligned. Claims verified as accurate: `whrefund:<refund_id>` ledger key (`supabase/migrations/0006_refunds.sql`), `refund_requests.paypal_refund_id` unique column, `gpt-4o-mini` default model (`lib/model-cost.ts`), input purge/retention behavior.
  - Files: `DEVPOST.md`
  - Verification: lint/typecheck/build PASS, 291/291 tests PASS (33 files).

## 2026-11-11 — Round 4: auth flows and history payload

- Area: Auth
  - Problem: `/login` forwarded the user-controlled `?next=` to `router.push()`; signup with email confirmation enabled left the user on a bouncing redirect.
  - Solution: `safeNextPath()` on the login page; register page detects a session-less signup and shows a confirmation notice instead of pushing `/dashboard`.
  - Files: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`
  - Remaining limitation: none known.

- Area: Performance / database
  - Problem: `/history` and `/dashboard` shipped and parsed the full `result` JSON just to render the score.
  - Solution: migration `0012_match_score.sql` (nullable `match_score` int with a 0-100 check, per-row best-effort backfill guarded by an exception handler, no result rewrites); analyze route stamps the column; `/history` selects `match_score` with a JSON fallback for legacy rows; `/dashboard` does the same.
  - Files: `supabase/migrations/0012_match_score.sql`, `app/api/ai/analyze/route.ts`, `app/(app)/history/page.tsx`, `app/(app)/dashboard/page.tsx`, `tests/match-score-migration.test.ts`
  - Remaining limitation: the hosted database has not had this migration applied from this environment; the JSON fallback keeps the UI working either way.

- Area: Docs
  - Problem: README/DEPLOYMENT/MANUAL_TEST migration lists were stale (missing 0011/0012).
  - Solution: updated all three.
  - Verification: lint/typecheck/build PASS, 291/291 tests PASS (33 files).

## 2026-11-11 — Round 3: abuse protection and error handling

- Area: Abuse protection
  - Problem: `/api/ai/extract-pdf` had no rate limit; PDF parsing is CPU-bound.
  - Solution: per-user sliding-window limiter (10 / 5 min) in the route; parser failures now return 422 instead of 501; `tests/extract-pdf.test.ts` (9 tests) covers auth, magic bytes, MIME, size, truncation, empty text, malformed PDFs, and the limiter.
  - Files: `app/api/ai/extract-pdf/route.ts`, `tests/extract-pdf.test.ts`
  - Remaining limitation: the limiter is per server instance (documented in SECURITY.md).

- Area: Webhook hardening
  - Problem: `/api/paypal/webhook` parsed arbitrary-size bodies before any check.
  - Solution: 256 KB cap (413) before verification; extended `tests/webhook.test.ts` with oversized / malformed JSON / bad signature / unknown event type cases.
  - Files: `app/api/paypal/webhook/route.ts`, `tests/webhook.test.ts`

- Area: UI error handling
  - Problem: delete-data flow reloaded the page on error (alert invisible); unguarded response shape; starter banner dismissal never re-read from localStorage.
  - Solution: reload only on success with inline `role="alert"` on failure; guarded response; banner reads stored dismissal in a lazy state initializer.
  - Files: `components/DeleteDataSection.tsx`, `components/StarterCreditsBanner.tsx`
  - Verification: lint/typecheck/build PASS, 287/287 tests PASS (32 files).

## 2026-11-11 — Re-audit pass (deep inspection)

- Area: Auth
- Problem: `/auth/callback` trusted the user-controlled `next` query param in its redirect.
- Solution: Added `lib/redirect.ts` `safeNextPath()` (absolute same-origin paths only) and wired it into the callback; added `tests/redirect.test.ts` (5 tests).
- Files: `lib/redirect.ts`, `app/auth/callback/route.ts`, `tests/redirect.test.ts`
- Verification: lint/typecheck/build PASS, 274/274 tests PASS.
- Remaining limitation: RLS not re-verified against a live database.

- Area: Analyze page reliability
- Problem: PDF upload had unguarded `fetch`/`res.json()` (stuck progress line, unhandled rejection); submit and mount effects lacked payload/error guards.
- Solution: try/catch/finally in `onPdfChange` plus client-side MIME/size pre-checks; guarded `json.data` in `onSubmit`; wrapped mount-effect fetches.
- Files: `app/(app)/analyze/page.tsx`
- Verification: typecheck/build PASS, test suite PASS.
- Remaining limitation: none known for this path.

- Area: Performance
- Problem: `/transactions` and `/history` queried ledgers without a limit.
- Solution: bounded to newest 200 (transactions) / 100 (history) rows.
- Files: `app/(app)/transactions/page.tsx`, `app/(app)/history/page.tsx`
- Verification: build PASS.
- Remaining limitation: `/history` still ships full result JSON for its newest rows.

- Area: Consistency
- Problem: `/credits` redirect capture used bare `fetch` (no 20 s abort) unlike every other purchase call.
- Solution: switched to `fetchWithTimeout`.
- Files: `app/(app)/credits/page.tsx`
- Verification: build PASS.

- Area: Test hygiene
- Problem: `tests/dbg.test.ts` was a debug scratch test (console.log only, no assertions).
- Solution: removed.
- Verification: 274/274 tests PASS (270 -> 274: -1 debug, +5 redirect).

- Area: Docs
- Problem: SECURITY.md quoted analysis `max_tokens: 2000` (code uses 2400).
- Solution: corrected. Audit report refreshed with the re-audit findings.
- Files: `SECURITY.md`, `docs/ENGINEERING_AUDIT.md`

## 2026-11-11 — Security and AI hardening pass

- Area: Security headers
- Problem: No security headers (CSP, X-Frame-Options, etc.) configured.
- Solution: Added `headers()` to `next.config.ts` with PayPal-compatible CSP and standard headers.
- Files: `next.config.ts`
- Tests: lint, typecheck, build PASS.

## 2026-11-11 — Prompt injection defense

- Area: AI
- Problem: System prompt did not explicitly bound resume/JD as untrusted data.
- Solution: Added SECURITY trust-boundary instructions to analyze and score prompts.
- Files: `lib/openai.ts`
- Tests: typecheck, 270 tests PASS.

## 2026-11-11 — PDF hardening

- Area: PDF extraction
- Problem: Validation only checked declared MIME type; extracted text unbounded.
- Solution: Magic-byte (`%PDF`) validation; cap extracted text at 20,000 chars.
- Files: `app/api/ai/extract-pdf/route.ts`
- Tests: typecheck, build PASS.

## 2026-11-11 — Documentation

- Area: Docs
- Problem: Missing required audit/architecture/implementation-log docs.
- Solution: Created `docs/ENGINEERING_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_LOG.md`.
- Files: docs/*
- Tests: n/a.