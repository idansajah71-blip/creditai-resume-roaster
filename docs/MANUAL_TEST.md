# Manual Test Checklist

Every check lists action steps and the exact expected result. Do them in order; reset where noted. Preconditions first.

## Preconditions

1. `.env.local` filled (Supabase URL/anon/service keys, `OPENAI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_ENV=sandbox`, `DEMO_IP_SALT`).
2. Migrations `0001-0012` run in the Supabase SQL editor, in order.
3. Supabase: email confirmation disabled (Auth settings) so demo accounts can sign in.
4. PayPal Sandbox webhook subscribed to `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`, pointing at `/api/paypal/webhook` (for localhost, a tunnel such as ngrok is required to receive webhooks).
5. Server running (`npm run dev`). Funds: PayPal Sandbox personal buyer account exists.

## 1. Demo session
- Steps: open `/judges`, click "Start demo session".
- Expected: sign-in completes automatically and lands on `/analyze` signed in; dashboard later shows 5 credits. The button is rate limited: a 4th session from the same IP within one hour shows an error message ("rate limited" / "try later").

## 2. Analysis (credit decreases)
- Steps: on `/analyze`, click "Use sample data", click Analyze.
- Expected: results appear (score card, strengths, weaknesses, requirement matches, rewritten resume). Displayed balance drops by 1; `/transactions` shows a debit row (-1) for this job. Network: a single `POST /api/ai/analyze` returning 200.

## 3. 402 handling (insufficient credits)
- Steps: with a fresh demo account (5 credits), run 5 analyses so the balance reaches 0. On the 6th run, submit Analyze without buying credits.
- Expected: message "You are out of credits." with a "Buy credits" link, `POST /api/ai/analyze` returns HTTP 402, balance unchanged, no ledger debit added. The AI was never called (no cost).

## 4. Daily cap message
- Steps: set `AI_DAILY_LIMIT_PER_USER=2` in `.env.local`, restart the server, ensure the account has credits (buy 10), run Analyze 3 times.
- Expected: the 3rd request returns HTTP 429 with message "Daily analysis limit reached." No ledger debit was added. Restore the env value afterwards.
- (Global cap analog: `AI_GLOBAL_DAILY_LIMIT` returns 503 "Demo capacity reached for today." - optional to test.)

## 5. Inline PayPal purchase (credit increases)
- Steps: `/credits` > choose 10 credits for $1.00 > click the inline PayPal button > approve with the Sandbox buyer credentials (available on `/judges` when configured) > return to the app.
- Expected: success toast with the new balance; `/transactions` gained a `purchase` grant row referencing the capture id; Supabase `paypal_orders` row has `status = captured`. If you close the browser mid-flow and reopen: an approval already granted but not yet captured appears on /credits with a "Resume payment" affordance (redirect flow recovery), no credits granted yet.

## 6. Duplicate capture (idempotency)
- Steps: after a successful purchase (test 5), open DevTools > Network, find the latest `POST /api/paypal/orders/{id}/capture`, right-click "Copy as fetch", paste and run it a second time in the console.
- Expected: HTTP 200 again with `{ idempotent: true }` (same balance, `creditsGranted` same, no new ledger grant row). Balance does NOT increase twice.

## 7. Webhook replay (dedup)
- Steps: PayPal Developer dashboard > Sandbox > Webhooks > your webhook > Events > resend the earlier `PAYMENT.CAPTURE.COMPLETED` event (or any older event).
- Expected: app responds 2xx (PayPal marks delivery ok), no new credits, no new `/transactions` grant rows (the ledger deduplicates by event). An `PAYMENT.CAPTURE.REFUNDED` replay similarly does not double-refund (skipped via refund id).

## 8. Partial refund (PayPal shows the refund, ledger row, balance)
- Steps: buy 10 credits; run 0-1 analyses; use the refund panel on `/credits`, request e.g. 3 credits with a reason over 10 characters; submit.
- Expected: the panel shows an approved/refunded status with the agent message; balance increases by 3 within the same moment as the refund succeeds; `/transactions` shows a `purchase_refund` row (+3) with the refund id; the Sandbox buyer account activity shows a partial refund transaction (- $0.30); `refund_requests` status ends `refunded`. The remaining 7 credits stay refundable.

## 9. Refund denied path (deterministic, no AI)
- Steps: on `/credits`, request a refund larger than refundable (e.g. ask for 12 immediate credits after buying 10).
- Expected: HTTP 400 with message on the panel: "Only 10 unused credits are refundable. Request 10 or fewer." (or "You no longer hold that many unused credits." when balance is lower), `refund requests` NOT stored, no AI call in the network tab.
- AI-deny variant (agent level): a reason that contradicts the facts (e.g. "I never received these credits" right after they were granted) is expected to be denied by the AI agent (status denied + a polite message), with no money moved.
- Rate limit: the 4th stored refund request within 30 days returns 429 "Refund request limit reached (3 per 30 days)."

## 10. Fabrication check warning path
- Steps: on `/analyze`, paste a short resume and a job description that is worded loosely (few skills lines, e.g. an executive-style JD without bullets). Run Analyze, observe the "Fabrication check" card. Repeat with a couple of different JDs if needed.
- Expected: most runs show "No new facts were added." When the rewrite adds details, the card shows a count plus chips of the flagged terms (e.g. "40%", "Acme Rocket Labs"); when more than 2 are flagged, the rewrite is retried once automatically (watch `POST /api/ai/analyze` called once, not the retry visible externally, and no extra credit charged). Fabrication chips are informational; no balance side effects.

## 11. Delete my data
- Steps: `/dashboard` > "Delete my analysis data" > confirmation dialog: press Tab (focus lands on Cancel), press Escape (closes), open again, click Delete data.
- Expected: `/dashboard` and `/history` show no analyses; `ai_jobs` rows for this user are empty; `credit_transactions`, `paypal_orders`, `refund_requests` keep every row; balance unchanged. The dialog closes on Escape only, is skipped on background click, and keeps focus inside while open.

## 12. /api/health
- Steps: `curl http://localhost:3000/api/health` (twice, within 30s).
- Expected: shape `{ ok, checks: { database, paypal, openai_configured, webhook_configured } }` - booleans only, no secrets/error internals. Second call is served from the cache (fast; add a DB/PayPal-side latency only every 30s). With all envs set on Sandbox, all four checks are true; `ok = true`. With the paypal secret blank, `paypal = false` and `ok = false`.
- On `/judges`, the "System status" card reflects the same four values as badges (Connected/Down, Configured/Missing).

## 13. Mobile layout at 375px
- Steps: DevTools device toolbar, 375x812. Visit `/`, `/judges`, `/login`, `/analyze`, `/credits`, `/transactions`, `/privacy`.
- Expected: no horizontal scrolling, text remains readable (no legibility loss at 100% zoom), buttons satisfy a 40px tap height (the `.btn` class min-height), tiles/cards stack in one column; the score card, fabrication chips, and CopyField rows wrap correctly; the PayPal panel renders and is tappable.

## 14. Guarantee met (good pair)
- Steps: on `/analyze`, click "Use sample data", run Analyze.
- Expected: the results column shows a green GUARANTEE MET stamp above the verdict reasons; clicking "How this is measured" jumps to the explainer card listing the bar (no invented details, >= 10 coverage gain or >= 85 without a drop, <= 2 added keywords). `/transactions` shows nothing new beyond the ledger debit; balance NET change is -1.

## 15. Guarantee refund (bad pair, automatic)
- Steps: on `/analyze`, enter a very short resume (e.g. `Name only, no details.`) and an unrelated job description (e.g. `Hiring a submarine welder, 10 years of pressurized hull experience required.`), run Analyze.
- Expected: after the automatic free retry, a red CREDIT REFUNDED stamp appears with plain-language reasons ("Keyword coverage rose by 0.0 points; the guarantee needs at least 10." and/or the fabrication line) and the note "Your credit was returned. You can keep this result."; the balance stamp in the navbar returns to the pre-run value (router.refresh() after the response); `/transactions` shows a green `Guarantee refund` row (+1) whose reference id is the job id; the shown result stays readable.

## 16. Guarantee waived (daily cap)
- Steps: in the SQL editor run `select count(*) from public.credit_transactions where user_id = '<your uuid>' and type = 'guarantee_refund';` to count already-refunded misses; set `GUARANTEE_DAILY_REFUND_LIMIT=<that count>` in `.env.local`, restart the server, and run another deliberately bad analysis.
- Expected: an amber REFUND LIMIT REACHED stamp with the reasons, +0 credits, `ai_jobs.guarantee_status = 'waived'` for that job, no new guarantee_refund ledger row. Also a "Refund to PayPal instead" button (deep link to the deterministic refund desk on `/credits` with 1 credit and the reason prefilled). Restore the env value afterwards.

## 17. Guarantee refund idempotency (SQL, exact)
- Steps in the Supabase SQL editor (pick a job that SUCCEEDED, consumed its credit, and has `guarantee_status = 'refunded'` from test 15):
```sql
select id, status, guarantee_status, credits_cost
from public.ai_jobs
order by created_at desc limit 5;
```
- Then call the refund twice with that job id and a dummy reason:
```sql
select public.apply_guarantee_refund('<job id>', '{"codes":["low_gain"]}'::jsonb, 3);
select public.apply_guarantee_refund('<job id>', '{"codes":["low_gain"]}'::jsonb, 3);
```
- Expected result: BOTH calls return (`refunded`, 1), the profile balance is unchanged between the two calls, and the ledger contains EXACTLY ONE row for the job:
```sql
select count(*) as ledger_rows
from public.credit_transactions
where reference_type = 'guarantee' and reference_id = '<job id>';
-- ledger_rows = 1

select type, amount, idempotency_key, balance_after, reserved_after
from public.credit_transactions
where idempotency_key = 'guarantee:' || '<job id>';
```
Also verify a second call cannot move money: run the double-call block again; `ledger_rows` stays 1 and the sum of amounts for the job stays one single +1.

## 18. Guarantee mark idempotency (SQL)
- Steps: pick a job with `guarantee_status = 'met'`; run `select public.mark_guarantee_met('<job id>', 0, 100);` twice more.
- Expected: both calls return void, `guarantee_status` stays `met`, `coverage_before/coverage_after` stay the originally stored values (the update only transitions from `not_applicable`), and `guarantee_checked_at` does not advance on re-calls.

## Accessibility spot checks
- Keyboard only (no mouse): tab through `/judges`, `/analyze`, `/credits`, `/dashboard`, and the dialogs: focus is visible on every interactive element, the refund textarea is reachable, the PayPal panel button is focusable in its iframe, and focus is trapped inside open dialogs (Escape cancels).
- Screen reader (NVDA/Chrome): toasts ("Purchase complete...") and analyze progress are announced via polite live regions; errors are announced via alert role.

## Reset between tests
- Fresh demo account: wait out the 3-sessions-per-IP-per-hour limit (rows persist for one hour), or register a normal account on `/register` while waiting.
- Daily caps: lower `AI_DAILY_LIMIT_PER_USER` locally for quicker tests; restore afterwards.
- PayPal Sandbox: buyer funds are not auto-refilled; move funds business-to-personal on the developer dashboard if the buyer account runs dry.
