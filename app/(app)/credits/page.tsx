"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";
import { Stamp, MarginNote, Rule } from "@/components/ui/annotations";
import PayPalCheckout, { type PayPalCheckoutStatus } from "@/components/PayPalCheckout";
import { fetchWithTimeout, clientErrorMessage, PAYPAL_UNREACHABLE_MESSAGE } from "@/lib/fetch-timeout";

type Package = { id: string; credits: number; amount: string };

const PACKAGES: Package[] = [
  { id: "credits_10", credits: 10, amount: "1.00" },
  { id: "credits_50", credits: 50, amount: "4.00" },
  { id: "credits_100", credits: 100, amount: "7.00" },
];

type RefundRequestRow = {
  id: string;
  paypal_order_id: string;
  credits: number;
  amount: string | number;
  currency: string;
  status: string;
  ai_decision: { message?: string } | null;
  created_at: string;
};

type RefundSummary = {
  balance: number;
  refundableCredits: number;
  refundableAmount: string;
  requests: RefundRequestRow[];
};

type PanelKind = "success" | "info" | "danger";

const stampTone: Record<string, "green" | "red" | "amber"> = {
  refunded: "green",
  failed: "red",
};

function Panel({ kind, children, onRetry }: { kind: PanelKind; children: React.ReactNode; onRetry?: () => void }) {
  const cls =
    kind === "success"
      ? "border-green/40 bg-green-soft"
      : kind === "danger"
        ? "border-red-pen/40 bg-red-soft"
        : "border-line bg-paper-sunken";
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-[10px] border px-4 py-3 text-sm ${cls}`} role="status">
      {kind === "success" && <Stamp tone="ink">Paid</Stamp>}
      <span className="min-w-0 flex-1 text-ink-2">{children}</span>
      {kind === "danger" && onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary px-3 text-sm">
          Try again
        </button>
      )}
    </div>
  );
}

function CreditsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [balance, setBalance] = useState<number | null>(null);
  const [panel, setPanel] = useState<{ kind: PanelKind; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const capturedRef = useRef(false);

  // refund panel state
  const [summary, setSummary] = useState<RefundSummary | null>(null);
  const [refundCredits, setRefundCredits] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  const [refundMsgKind, setRefundMsgKind] = useState<PanelKind>("info");
  const [refundLoading, setRefundLoading] = useState(false);
  const idemRef = useRef<string>("");

  const newIdem = useCallback(() => {
    idemRef.current = crypto.randomUUID();
    return idemRef.current;
  }, []);

  useEffect(() => {
    newIdem();
  }, [newIdem]);

  async function loadSummary() {
    try {
      const res = await fetch("/api/paypal/refunds");
      const json = await res.json();
      if (json.success) {
        setSummary(json.data as RefundSummary);
        setBalance(json.data.balance);
      }
    } catch {
      // summary is optional decoration; ignore fetch errors
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSummary();
  }, []);

  useEffect(() => {
    const token = params.get("token");
    const cancel = params.get("cancel");
    if (cancel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanel({ kind: "info", text: "Payment cancelled. No charge was made." });
      return;
    }
    if (token && !capturedRef.current) {
      capturedRef.current = true;
      setLoading(true);
      fetch(`/api/paypal/orders/${token}/capture`, { method: "POST" })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.message || "capture failed");
          setPanel({ kind: "success", text: `Success. +${json.data.creditsGranted} credits added. New balance: ${json.data.balance}.` });
          setToast(`+${json.data.creditsGranted} credits added`);
          await loadSummary();
          router.refresh();
          setTimeout(() => router.push("/analyze"), 1500);
        })
        .catch((e) => {
          setPanel({ kind: "danger", text: String(e instanceof Error ? e.message : e) });
          router.replace("/credits");
        })
        .finally(() => setLoading(false));
    }
  }, [params, router]);

  const onCheckoutStatus = useCallback(
    (st: PayPalCheckoutStatus, payload?: { creditsGranted?: number; balance?: number; message?: string }) => {
      if (st === "captured") {
        setPanel({
          kind: "success",
          text: `Success. +${payload?.creditsGranted ?? 0} credits added. New balance: ${payload?.balance ?? ""}.`,
        });
        setToast(`+${payload?.creditsGranted ?? 0} credits added`);
        if (typeof payload?.balance === "number") setBalance(payload.balance);
        loadSummary().then(() => router.refresh());
      } else if (st === "cancelled") {
        setPanel({ kind: "info", text: "Payment cancelled. No charge was made." });
      } else {
        setPanel({
          kind: "danger",
          text: payload?.message ? `PayPal error: ${payload.message}` : "PayPal error. Please try again.",
        });
      }
    },
    [router],
  );

  async function buyRedirect(packageId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/paypal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || PAYPAL_UNREACHABLE_MESSAGE);
      window.location.assign(json.data.approvalUrl);
    } catch (e: unknown) {
      setError(clientErrorMessage(e));
    } finally {
      // Always clear the loading state, success (before navigation completes)
      // and failure alike; a stuck spinner must never mask an error.
      setLoading(false);
    }
  }

  const sdkUnavailable = !process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  async function submitRefund() {
    const amount = Number(refundCredits);
    if (!Number.isInteger(amount) || amount < 1) {
      setRefundMsg("Enter a whole number of credits.");
      setRefundMsgKind("danger");
      return;
    }
    if (refundReason.trim().length < 10) {
      setRefundMsg("Tell us a bit more about why (at least 10 characters).");
      setRefundMsgKind("info");
      return;
    }
    setRefundLoading(true);
    setRefundMsg(null);
    try {
      const res = await fetch("/api/paypal/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json", "idempotency-key": idemRef.current || newIdem() },
        body: JSON.stringify({ credits: amount, reason: refundReason.trim() }),
      });
      const json = await res.json();
      const data = json.data || {};
      const message: string = json.message || data.message || "";
      if (data.status === "refunded" || data.status === "partial") {
        setRefundMsg(message || `Refund processed. ${data.credits} credits returned.`);
        setRefundMsgKind("success");
        setToast(`${data.credits} credits refunded`);
        setRefundCredits("");
        setRefundReason("");
        newIdem();
        await loadSummary();
        router.refresh();
      } else if (data.status === "denied") {
        setRefundMsg(message || "Refund not approved.");
        setRefundMsgKind("info");
        newIdem();
      } else {
        setRefundMsg(message || "Refund failed. You can try again.");
        setRefundMsgKind("danger");
        newIdem();
      }
    } catch {
      setRefundMsg("Network error. Please try again.");
      setRefundMsgKind("danger");
      newIdem();
    } finally {
      setRefundLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="type-label">Credits</div>
          <h1 className="type-display text-ink">Buy credits</h1>
        </div>
        <div className="md:text-right">
          <div className="type-label">Balance</div>
          <div className="font-mono text-[36px] leading-10 text-ink md:text-[40px]">{balance ?? "..."}</div>
        </div>
      </div>

      {/* Sandbox strip */}
      <div className="rounded-[10px] bg-paper-sunken px-4 py-3 text-sm leading-6 text-ink-2">
        PayPal Sandbox. Use the test buyer account from the{" "}
        <a href="/judges" className="font-medium text-blue underline underline-offset-2">
          judge guide
        </a>
        . No real money moves.
      </div>

      {panel && (
        <Panel kind={panel.kind} onRetry={panel.kind === "danger" ? () => setPanel(null) : undefined}>
          {panel.text}
        </Panel>
      )}
      {error && (
        <p className="text-sm font-medium text-red-pen" role="alert">
          {error}
        </p>
      )}
      {loading && <p className="font-mono text-xs text-ink-3">Processing...</p>}

      {/* Packs */}
      <section className="space-y-4">
        <div className="type-label">Choose a pack</div>
        {!sdkUnavailable && (
          <PayPalCheckout packages={PACKAGES} onStatus={onCheckoutStatus} onRedirect={buyRedirect} redirectDisabled={loading} />
        )}
        {sdkUnavailable && (
          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {PACKAGES.map((p) => (
              <Sheet key={p.id} className="flex flex-col">
                <div className="type-label">{p.credits} credits</div>
                <div className="mt-3 font-mono text-[32px] leading-9 text-ink">${p.amount}</div>
                <div className="mt-1 font-mono text-xs text-ink-3">
                  ${(parseFloat(p.amount) / p.credits).toFixed(2)} per credit
                </div>
                <div className="mt-auto pt-4">
                  <Button onClick={() => buyRedirect(p.id)} disabled={loading} className="w-full">
                    Buy with PayPal
                  </Button>
                </div>
              </Sheet>
            ))}
          </div>
        )}
      </section>

      {/* Refund desk */}
      <Rule />

      <section className="space-y-5">
        <h2 className="type-h2 text-ink">Refund unused credits</h2>
        {summary && summary.refundableCredits > 0 ? (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[10px] border border-line bg-paper-sunken p-5">
                <div className="type-label">Refundable credits</div>
                <div className="mt-2 font-mono text-[28px] leading-8 text-ink [font-variant-numeric:tabular-nums]">
                  {summary.refundableCredits}
                </div>
              </div>
              <div className="rounded-[10px] border border-line bg-paper-sunken p-5">
                <div className="type-label">Refundable amount</div>
                <div className="mt-2 font-mono text-[28px] leading-8 text-ink [font-variant-numeric:tabular-nums]">
                  ${summary.refundableAmount}
                </div>
              </div>
            </div>
            <p className="text-sm leading-6 text-ink-2">
              An AI agent reviews your reason; the server decides the amount.
            </p>
            <Rule />
            <div className="grid gap-4 md:grid-cols-[140px_1fr_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="refund-credits">Credits</Label>
                <Input
                  id="refund-credits"
                  type="number"
                  min={1}
                  max={summary.refundableCredits}
                  value={refundCredits}
                  onChange={(e) => setRefundCredits(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-reason">Why the refund?</Label>
                <Textarea
                  id="refund-reason"
                  rows={2}
                  placeholder="e.g. I only used 2 of the 10 credits from my purchase yesterday."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                />
              </div>
              <Button onClick={submitRefund} loading={refundLoading}>
                Request refund
              </Button>
            </div>
            {refundMsg && (
              <div className="mt-1">
                <Panel kind={refundMsgKind}>{refundMsg}</Panel>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm leading-6 text-ink-2">
            {summary ? "No refundable purchases yet. Buy credits and use a few first." : "Checking refundable purchases..."}
          </p>
        )}

        {summary && summary.requests.length > 0 && (
          <div className="space-y-2">
            <h3 className="type-label">Refund requests</h3>
            <ul>
              {summary.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 text-sm last:border-b-0">
                  <Stamp tone={stampTone[r.status] ?? "amber"}>{r.status === "pending" ? "Pending" : r.status}</Stamp>
                  <span className="font-mono text-ink">
                    {r.credits} credits · ${Number(r.amount).toFixed(2)}
                  </span>
                  {r.ai_decision?.message && (
                    <span className="flex-1 min-w-0">
                      <MarginNote>{r.ai_decision.message}</MarginNote>
                    </span>
                  )}
                  <span className="font-mono text-[11px] leading-4 text-ink-3">{new Date(r.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<p className="text-ink-2">Loading...</p>}>
      <CreditsInner />
    </Suspense>
  );
}
