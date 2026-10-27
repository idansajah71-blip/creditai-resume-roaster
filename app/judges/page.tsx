"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import { CopyField } from "@/components/ui/CopyField";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import SystemStatusCard from "@/components/SystemStatusCard";
import { createClient } from "@/lib/supabase/client";

const buyerEmail = process.env.NEXT_PUBLIC_PAYPAL_BUYER_EMAIL || "";
const buyerPass = process.env.NEXT_PUBLIC_PAYPAL_BUYER_PASSWORD || "";
const buyerConfigured = Boolean(buyerEmail) && Boolean(buyerPass);

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent">
          {n}
        </span>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

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
      <div className="space-y-8">
        <div className="rounded-[10px] border border-warning/30 bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          PayPal Sandbox mode. No real money is used.
        </div>
        <div>
          <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
            Judge quick-start
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Five steps, about five minutes. Everything is real inference and real structure with
            sandbox money.
          </p>
        </div>

        <SystemStatusCard />

        <Step n={1} title="Start a demo session">
          <p className="text-sm text-ink-muted">
            Creates a fresh, ephemeral account with 5 free credits (expires after 24 hours).
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={startDemo} loading={busy}>
              Start demo session
            </Button>
            <span className="text-xs text-ink-muted">Rate limited to 3 sessions per IP per hour.</span>
          </div>
          {error && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </Step>

        <Step n={2} title="Run an analysis with sample data">
          <p className="text-sm text-ink-muted">
            On /analyze click <strong>Use sample data</strong>, then Analyze. Watch the score card:
            the rewritten estimate, the fabrication check, and the requirement badges.
          </p>
          <div className="mt-3">
            <a href="/analyze" className="btn btn-secondary px-4 py-2 text-sm">
              Open Analyze
            </a>
          </div>
        </Step>

        <Step n={3} title="Buy credits with the sandbox buyer">
          <p className="text-sm text-ink-muted">
            On /credits choose Later for 10 credits, approve with the inline PayPal button using
            these sandbox buyer credentials:
          </p>
          {buyerConfigured ? (
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
                  Buyer email
                </div>
                <CopyField value={buyerEmail} />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
                  Buyer password
                </div>
                <CopyField value={buyerPass} />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-warning">
              Buyer credentials not configured. Set NEXT_PUBLIC_PAYPAL_BUYER_EMAIL and
              NEXT_PUBLIC_PAYPAL_BUYER_PASSWORD, or create your own Sandbox personal account
              (developer.paypal.com - Testing tools - Sandbox accounts).
            </p>
          )}
          <div className="mt-3">
            <a href="/credits" className="btn btn-secondary px-4 py-2 text-sm">
              Open Credits
            </a>
          </div>
        </Step>

        <Step n={4} title="Request a partial refund">
          <p className="text-sm text-ink-muted">
            Still on /credits, use the refund panel for your purchase (e.g. refund 5 of 10 unused
            credits). Answer the refund questions: the AI refund agent proposes a decision within
            deterministic guardrails, the PayPal Refunds API is called server-side, and the ledger
            compensates your credit balance atomically.
          </p>
        </Step>

        <Step n={5} title="Open Transactions">
          <p className="text-sm text-ink-muted">
            The full credit ledger: purchase grants, debits per analysis, refunds with their
            compensation, and payment references from the captured order.
          </p>
          <div className="mt-3">
            <a href="/transactions" className="btn btn-secondary px-4 py-2 text-sm">
              Open Transactions
            </a>
          </div>
        </Step>

        <Card>
          <h2 className="text-lg font-semibold text-ink">What to look for</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
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
            <Badge variant="accent">No shared credentials</Badge>
            <Badge variant="accent">Ephemeral accounts</Badge>
            <Badge variant="accent">Sandbox money only</Badge>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
