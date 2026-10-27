"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import { CopyField } from "@/components/ui/CopyField";
import { Button } from "@/components/ui/Button";
import SystemStatusCard from "@/components/SystemStatusCard";
import { createClient } from "@/lib/supabase/client";

const buyerEmail = process.env.NEXT_PUBLIC_PAYPAL_BUYER_EMAIL || "";
const buyerPass = process.env.NEXT_PUBLIC_PAYPAL_BUYER_PASSWORD || "";
const buyerConfigured = Boolean(buyerEmail) && Boolean(buyerPass);

/* Vertical stepper: a large serif numeral on a rule rail, content to the
   right. The rail draws the reading order without colored decoration. */
function Step({ n, title, last = false, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-5 md:gap-8">
      <div className="flex flex-col items-center self-stretch" aria-hidden="true">
        <span className="font-display text-[40px] leading-10 text-ink md:text-[48px] md:leading-12">{n}</span>
        {!last && <span className="mt-2 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="type-h3 pt-1 text-ink">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

const stepBody = "max-w-[620px] text-sm leading-6 text-ink-2";
const quietLink = "btn btn-secondary px-4 py-2 text-sm";

export default function JudgesPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDemo() {
    setBusy(true);
    setError(null);
    try {
      // Ephemeral account from POST /api/demo/session (rate limited per IP).
      const res = await fetch("/api/demo/session", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || "Demo session unavailable.");
        setBusy(false);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: json.data.email,
        password: json.data.password,
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      router.push("/analyze");
      router.refresh();
    } catch {
      setError("Demo session unavailable.");
      setBusy(false);
    }
  }

  return (
    <PublicShell>
      <div className="space-y-10">
        <div className="space-y-2">
          <div className="type-label">Evaluation protocol</div>
          <h1 className="type-display text-ink">Reviewer guide</h1>
          <p className="max-w-[620px] text-sm leading-6 text-ink-2">
            Five steps, about five minutes. Everything is real inference and real structure with
            sandbox money.
          </p>
        </div>

        <div className="rounded-[10px] bg-paper-sunken px-4 py-3 text-sm leading-6 text-ink-2">
          PayPal Sandbox mode. No real money is used.
        </div>

        <ol className="space-y-10">
          <li>
            <Step n={1} title="Start a demo session">
              <p className={stepBody}>
                Creates a fresh, ephemeral account with 5 free credits (expires after 24 hours).
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={startDemo} loading={busy}>
                  Start demo session
                </Button>
                <span className="font-mono text-xs leading-5 text-ink-3">
                  Rate limited to 3 sessions per IP per hour.
                </span>
              </div>
              {error && (
                <p className="text-sm font-medium text-red-pen" role="alert">
                  {error}
                </p>
              )}
            </Step>
          </li>

          <li>
            <Step n={2} title="Run a review with sample data">
              <p className={stepBody}>
                On /analyze click <strong>Use sample data</strong>, then Analyze. Watch the score card:
                the rewritten estimate, the fabrication check, and the requirement badges.
              </p>
              <div>
                <a href="/analyze" className={quietLink}>
                  Open Analyze
                </a>
              </div>
            </Step>
          </li>

          <li>
            <Step n={3} title="Buy credits with the sandbox buyer">
              <p className={stepBody}>
                On /credits choose Later for 10 credits, approve with the inline PayPal button using
                these sandbox buyer credentials:
              </p>
              {buyerConfigured ? (
                <div className="max-w-[440px] space-y-3">
                  <div>
                    <div className="type-label mb-1">Buyer email</div>
                    <CopyField value={buyerEmail} />
                  </div>
                  <div>
                    <div className="type-label mb-1">Buyer password</div>
                    <CopyField value={buyerPass} />
                  </div>
                </div>
              ) : (
                <p className={`${stepBody} text-amber`}>
                  Buyer credentials not configured. Set NEXT_PUBLIC_PAYPAL_BUYER_EMAIL and
                  NEXT_PUBLIC_PAYPAL_BUYER_PASSWORD, or create your own Sandbox personal account
                  (developer.paypal.com - Testing tools - Sandbox accounts).
                </p>
              )}
              <div>
                <a href="/credits" className={quietLink}>
                  Open Credits
                </a>
              </div>
            </Step>
          </li>

          <li>
            <Step n={4} title="Request a partial refund and see it in Transactions">
              <p className={stepBody}>
                Still on /credits, use the refund panel for your purchase (e.g. refund 5 of 10 unused
                credits). Answer the refund questions: the AI refund agent proposes a decision within
                deterministic guardrails, the PayPal Refunds API is called server-side, and the ledger
                compensates your credit balance atomically.
              </p>
            </Step>
          </li>

          <li>
            <Step n={5} title="Check the ledger and system status" last>
              <p className={stepBody}>
                The full credit ledger: purchase grants, debits per analysis, refunds with their
                compensation, and payment references from the captured order.
              </p>
              <div>
                <a href="/transactions" className={quietLink}>
                  Open Transactions
                </a>
              </div>
              <div className="pt-2">
                <SystemStatusCard />
              </div>
            </Step>
          </li>
        </ol>

        {/* Editor's margin note: what a grader should verify */}
        <section className="rounded-[10px] border border-l-2 border-l-red-pen border-line bg-paper-sunken p-6">
          <h2 className="type-h3 text-ink">What to look for</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-ink-2">
            <li>
              <strong>Atomic credits:</strong> the credit is reserved, then consumed or refunded. A
              failed analysis never leaves the balance wrong.
            </li>
            <li>
              <strong>Idempotent capture and webhook:</strong> retries and races produce one grant
              per capture; duplicate webhooks are deduplicated in the ledger.
            </li>
            <li>
              <strong>Partial refund with compensation:</strong> unused credits convert back to USD
              cents and reduce the user balance in one database transaction.
            </li>
            <li>
              <strong>AI refund agent with guardrails:</strong> AI proposes, code disposes. The
              amounts and eligibility are deterministic; the model only drafts the message.
            </li>
            <li>
              <strong>Fabrication check:</strong> the rewritten resume is diffed against your
              original; facts it added are flagged for you to verify.
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-[4px] border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-ink-3">
              No shared credentials
            </span>
            <span className="rounded-[4px] border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-ink-3">
              Ephemeral accounts
            </span>
            <span className="rounded-[4px] border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-ink-3">
              Sandbox money only
            </span>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
