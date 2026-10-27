import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stamp } from "@/components/ui/annotations";

type Tx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reserved_after: number;
  reference_type: string | null;
  created_at: string;
};

type RefundRequest = {
  id: string;
  paypal_order_id: string;
  credits: number;
  amount: string | number;
  currency: string;
  reason: string;
  status: string;
  ai_decision: { message?: string } | null;
  created_at: string;
};

/* Ledger entry type -> bordered mono label with its semantic color.
   Signup/demo grants come through reference_type, the rest via type. */
function typeLabel(t: Tx): { label: string; tone: "green" | "amber" | "ink" } {
  if (t.reference_type === "signup_grant") return { label: "Signup grant", tone: "green" };
  if (t.reference_type === "demo_grant") return { label: "Demo grant", tone: "ink" };
  switch (t.type) {
    case "purchase":
      return { label: "Purchase", tone: "green" };
    case "reservation":
      return { label: "Reserved", tone: "amber" };
    case "consumption":
      return { label: "Used", tone: "ink" };
    case "refund":
    case "purchase_refund":
      return { label: "Refund", tone: "green" };
    default:
      return { label: t.type, tone: "ink" };
  }
}

const toneClass: Record<"green" | "amber" | "ink", string> = {
  green: "border-green/60 text-green",
  amber: "border-amber/60 text-amber",
  ink: "border-line-strong text-ink-2",
};

function TypeLabel({ label, tone }: { label: string; tone: "green" | "amber" | "ink" }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.08em] ${toneClass[tone]}`}
    >
      {label}
    </span>
  );
}

function signed(n: number): { text: string; cls: string } {
  return n < 0
    ? { text: String(n), cls: "text-ink" }
    : { text: `+${n}`, cls: "text-green" };
}

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const th = "px-4 py-2.5 type-label whitespace-nowrap";
const refundStampTone: Record<string, "green" | "red" | "amber"> = {
  refunded: "green",
  failed: "red",
};

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_transactions")
    .select("id, type, amount, balance_after, reserved_after, reference_type, created_at")
    .order("created_at", { ascending: false });

  const { data: refundsRaw } = await supabase
    .from("refund_requests")
    .select("id, paypal_order_id, credits, amount, currency, reason, status, ai_decision, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const txs = (data as Tx[]) || [];
  const refunds = (refundsRaw as RefundRequest[] | null) || [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="type-label">Every credit accounted</div>
        <h1 className="type-display text-ink">Transaction history</h1>
      </div>

      {txs.length === 0 ? (
        <EmptyState title="No transactions yet." body="Purchases, usage, and refunds will be recorded here." />
      ) : (
        <>
          {/* Desktop: ruled ledger table with a sticky header */}
          <div className="hidden overflow-hidden rounded-[10px] border border-line bg-sheet md:block">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-paper">
                  <tr className="border-b border-line">
                    <th className={`${th} text-left`}>ID</th>
                    <th className={`${th} text-left`}>Type</th>
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={`${th} text-right`}>Balance after</th>
                    <th className={`${th} text-right`}>Reserved after</th>
                    <th className={`${th} text-right`}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => {
                    const tl = typeLabel(t);
                    const amt = signed(t.amount);
                    return (
                      <tr key={t.id} className="first:border-t-0 border-t border-line">
                        <td className="px-4 py-3 font-mono text-xs text-ink-3 whitespace-nowrap">
                          <span title={t.id}>{t.id.slice(0, 8)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <TypeLabel label={tl.label} tone={tl.tone} />
                        </td>
                        <td className={`px-4 py-3 font-mono text-right whitespace-nowrap ${amt.cls}`}>{amt.text}</td>
                        <td className="px-4 py-3 font-mono text-right text-ink whitespace-nowrap">{t.balance_after}</td>
                        <td className="px-4 py-3 font-mono text-right text-ink-2 whitespace-nowrap">{t.reserved_after}</td>
                        <td
                          className="px-4 py-3 text-right font-mono text-[11px] text-ink-3 whitespace-nowrap"
                          title={new Date(t.created_at).toLocaleString()}
                        >
                          {relTime(t.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: stacked ledger lines */}
          <div className="grid gap-4 md:hidden">
            {txs.map((t) => {
              const tl = typeLabel(t);
              const amt = signed(t.amount);
              return (
                <div key={t.id} className="rounded-[10px] border border-line bg-sheet p-4">
                  <div className="flex items-center justify-between gap-3">
                    <TypeLabel label={tl.label} tone={tl.tone} />
                    <span className={`font-mono text-[18px] leading-6 ${amt.cls}`}>{amt.text}</span>
                  </div>
                  <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-3">Balance after</dt>
                      <dd className="font-mono text-ink">{t.balance_after}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-3">Reserved after</dt>
                      <dd className="font-mono text-ink-2">{t.reserved_after}</dd>
                    </div>
                  </dl>
                  <div
                    className="mt-3 font-mono text-[11px] leading-4 text-ink-3"
                    title={new Date(t.created_at).toLocaleString()}
                  >
                    {relTime(t.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Refund requests */}
      <section className="rounded-[10px] border border-line bg-sheet p-5">
        <h2 className="type-h3 text-ink">Refund requests</h2>
        {refunds.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-ink-2">No refund requests yet.</p>
        ) : (
          <ul className="mt-3">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 text-sm last:border-b-0">
                <Stamp tone={refundStampTone[r.status] ?? "amber"}>{r.status}</Stamp>
                <span className="font-mono text-ink whitespace-nowrap">
                  {r.credits} credits · ${Number(r.amount).toFixed(2)}
                </span>
                <span className="min-w-0 flex-1 text-ink-2">{r.reason}</span>
                <span
                  className="font-mono text-[11px] leading-4 text-ink-3 whitespace-nowrap"
                  title={new Date(r.created_at).toLocaleString()}
                >
                  {relTime(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
