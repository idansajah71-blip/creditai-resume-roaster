# DEVPOST - ready-to-paste submission text

Paste each block into the matching Devpost field. No hype words, no emoji. All numbers and claims are backed by code in this repository (link specific files where useful).

## Inspiration

Judges and recruiters evaluate resumes against a concrete job description, but popular AI resume tools answer with generic advice and no way to verify it. During the same period, we saw auto-rewritten resumes invent companies, years, and achievements with the user none the wiser. We wanted to build the resume tool that can show its work: requirement-by-requirement evidence, a supervised rewrite, and a billing system honest enough to refund unused credits. The payments angle is real, not theatrical: if the product fails, the buyer should get their money back partly, automatically, and transparently.

## What it does

CreditAI takes a resume (text or PDF) and a job description and returns, in one credit:

- A match score (0-100) and a roast: witty but constructive critique.
- Requirement matches (met / partial / missing) with evidence excerpts for each.
- A rewritten resume plus "Rewritten estimate: X -> Y", produced by a second scoring pass, labeled "AI estimate, not a guarantee".
- A "Fabrication check" card: a deterministic diff of the rewrite against your original resume flags every detail the AI added (numbers with units, percentages, money, years, invented company-style names). If too many flagged details appear, the rewrite is retried once with stricter instructions at no extra credit.
- Language detection: an Indonesian resume gets Indonesian output, an English one gets English.

Billing uses atomic credits (1 per analysis). Credits are bought with PayPal Sandbox (10 for $1.00, 50 for $4.00, 100 for $7.00) through inline buttons or a redirect fallback. Unused credits can be partially refunded through an AI refund agent that operates within deterministic guardrails; the ledger in /transactions shows every grant, debit, and refund compensation. A public /api/health endpoint and the /judges page show live system status.

## How we built it

Stack: Next.js 16 (App Router, Server Components + client islands), TypeScript, Tailwind CSS 4, Supabase (Auth + Postgres with RLS) for data and identity, OpenAI Chat Completions for the three AI jobs (analysis, rewrite scoring, refund agent with structured JSON schema outputs), PayPal Orders v2 + Refunds + webhook verification for money.

Key implementation decisions:

1. Credits are never mutated in application code. All balance changes go through SECURITY DEFINER Postgres RPCs (`reserve_credits`, `consume_reservation`, `refund_reservation`, `grant_credits`, `release_stale_reservations`, plus the refund SQL) that re-check balances and lock rows, so concurrent requests cannot overspend.
2. Refund flow is "AI proposes, code disposes": deterministic TypeScript (`lib/refund-math.ts`, integer cents) decides eligibility, allocates to the newest order first, computes per-credit amounts, and caps by the cash left in each order. The agent only writes a short decision message; the amounts can never come from a model. Denials are decided before any AI call.
3. The analyzer never persists your resume text by default. When the opt-in checkbox is left unchecked, after the job finishes the stored input is replaced with only character counts. A scheduled database job nulls inputs older than 30 days, and the dashboard has one-click deletion of analysis data (ledger and payment records are kept for accounting).
4. Everything money-related is idempotent: `PayPal-Request-Id` on order creation and refunds, idempotency keys on captures and credit grants, and a ledger that deduplicates webhook events.

## Challenges we ran into

- Making payroll-style atomicity work across HTTP and Postgres: a capture can succeed while our first attempt at recording it times out; we solved ambiguous capture states by re-querying the order from PayPal instead of trusting our local state.
- Keeping the refund math exact: partial refunds across multiple orders mean the per-credit price differs per order; integer-cent allocation newest-first with per-order caps was the part we tested hardest.
- Verifying that the deduction ledger cannot double-count: PayPal refunds the same purchase twice, our app initiated one of them, and the webhook arrives for both; we deduplicate via `refund_requests.paypal_refund_id` and a `whrefund:<refund_id>` ledger key.
- Proving the AI does not fabricate: free-text rewrite output cannot be constrained by JSON schemas alone, so we built a deterministic wrapper (extraction + normalization + matching rules) with unit tests, including false-positive cases.

## Accomplishments that we're proud of

- Every credit mutation is atomic and idempotent, with a ledger a human can audit line by line.
- Complete payment flows built out on PayPal Sandbox paths: capture, webhook grant, partial refund, refund webhook deduplication, and recovery paths for ambiguous captures; covered by the automated suite (PayPal mocked in tests). A manual end-to-end verification checklist ships in the README.
- Privacy defaults as strong as the accounting: no retention by default, scheduled purge, user-triggered deletion, and a delete route that cannot unbalance the books.
- 82 automated tests, including regression tests for the exact failure modes that motivated the design (insufficient credits, double capture, duplicate webhooks, malformed AI output).

## What we learned

- The hard part of "AI in the loop" is not the prompt; it is everything around it: idempotency, validation, rate limits, and auditability. The model gets one narrow, schema-constrained job.
- Deterministic guardrails beat clever prompts for anything involving money or facts.
- Webhooks are a new, late-arriving source of truth that must be reconciled with synchronous paths, not trusted separately.
- Small eval harnesses (5 real fixtures) expose prompt drift much faster than staring at outputs in the UI.

## What's next

- refund UX: instantly refund small obvious cases (1-2 credits) without the questionnaire, keeping the AI agent for edge cases.
- Shared storage (e.g. Upstash) for rate limiters when scaled horizontally.
- Layout-aware PDF parsing to improve text extraction for two-column resume designs.
- Model-assisted language detection to replace the dictionary heuristic, plus an Indonesian-first landing page.
- Live-mode hardening: PayPal risk tools checklist and dispute flow documentation before any real money.

## Built with

next.js, typescript, react, tailwind css 4, supabase (postgres + auth), zod, openai chat completions, paypal orders v2 + refunds + webhooks, vitest, pg_cron, vercel-ready next config.

## Tools used

Product AI: OpenAI `gpt-4o-mini`.
Development AI: OpenCode assistant (GLM) for scaffolding, refactoring, test generation, and documentation review.
