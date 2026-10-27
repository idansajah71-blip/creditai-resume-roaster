# Demo Video Script - CreditAI Resume Roaster
Target: under 2:45 (record ~2:35 for slack). Tone: plain, concrete. No emoji, no hype.

## 0:00 - Problem and promise (screen: landing page, scrolled to hero)
- Line: "Resume tools give advice you cannot verify. Recruiters compare against a concrete job description; this app mirrors that: evidence per requirement, a rewrite you can audit, and credits you can get back."
- Show: the hero headline, pricing row (10 for $1.00), and the PayPal Sandbox banner. Do not read the pricing text aloud.

## 0:20 - Analysis with before/after and fabrication check (screen: /analyze)
- Action: click "Use sample data" (English sample), then Analyze.
- Point at: the score card with "Rewritten estimate: X -> Y (AI estimate, not a guarantee)", then the "Fabrication check" card.
- Line: "One credit buys the analysis, the rewrite, and a second scoring pass. The fabrication check diffs the rewrite against your original and flags anything the AI added."
- Show (fast scroll): requirement matches with evidence chips, missing keywords.

## 1:00 - Buying credits with the inline PayPal button (screen: /credits)
- Action: select 10 credits, click the inline PayPal button, pay with the Sandbox buyer (credentials shown at the end of the video's description; do not show them on screen).
- Line: "Prices and package ids are server-side; the browser only sends an id. Capture is idempotent - a retry cannot double-charge or double-issue credits."
- Show: approval page then back on /credits with a success banner and the new balance.

## 1:25 - The ledger (screen: /transactions)
- Action: scroll the ledger slowly.
- Line: "Every balance change is one ledger row: the PayPal grant, the debit per analysis, and later refund compensations. Credits are mutated only inside SQL functions with row locks, so two concurrent requests cannot overspend."

## 1:45 - Partial refund through the AI refund agent (screen: /credits refund panel, then PayPal)
- Action: open the refund panel on /credits, type a short reason (e.g. "I only used 3 of the 10 credits and my job search changed plans."), submit.
- Show: the agent's decision message, then the updated balance and the new refund badge in /transactions.
- Line: "The AI only proposes a decision and message. Eligibility, amounts, and allocation are deterministic TypeScript in integer cents, capped by cash left per order, and executed through the PayPal Refunds API - partial by design."
- Show: the refund row and the compensation ledger entry for the refunded credits.

## 2:15 - System status, idempotency, webhook (screen: /judges)
- Action: scroll to the "System status" card (database, PayPal Sandbox API, OpenAI key, webhook configured), then the "What to look for" list.
- Line: "The health endpoint returns booleans only. Webhooks are verified via the PayPal API and deduplicated in the ledger, so a refund webhook that arrives after the app-initiated refund cannot double-refund."

## 2:30 - Close (screen: repo README)
- Line: "MIT licensed, single-developer project. The repo has the migrations, the guard tests, and a judge quick-start page. Link in the description."
- Action: hard cut. Do not narrate a thank-you list.

## Recording notes
- Record at 1080p or higher; hide bookmarks bar; avoid hover flashes.
- Sandbox buyer credentials: DO NOT display on screen; put them in the video description instead.
- If the demo runs long, trim the scrolling in the analysis (0:20) and ledger (1:25) sections, but keep the refund flow (1:45-2:15) - it is the differentiator.
- Before upload: filename, captions, and description text must remain emoji-free.
