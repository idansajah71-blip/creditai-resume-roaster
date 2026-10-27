import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

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
      <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
        Transaction history
      </h1>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">ID</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Type</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Amount</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Balance after</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Reserved after</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Ref</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Created</th>
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-ink-muted">
                  No transactions yet.
                </td>
              </tr>
            )}
            {txs.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs text-ink-faint">{t.id.slice(0, 8)}</td>
                <td className="p-3">
                  {t.type === "purchase_refund" ? (
                    <Badge variant="warning">{t.type}</Badge>
                  ) : (
                    <span className="text-ink">{t.type}</span>
                  )}
                </td>
                <td className="p-3 font-mono text-ink">{t.amount}</td>
                <td className="p-3 font-mono text-ink">{t.balance_after}</td>
                <td className="p-3 font-mono text-ink">{t.reserved_after}</td>
                <td className="p-3 text-ink-muted">{t.reference_type || "-"}</td>
                <td className="p-3 text-ink-muted">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Refund requests</h2>
        {refunds.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No refund requests yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {refunds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <Badge
                  variant={
                    r.status === "refunded" ? "success" : r.status === "failed" ? "danger" : "warning"
                  }
                >
                  {r.status}
                </Badge>
                <span className="font-mono text-ink">
                  {r.credits} credits · ${Number(r.amount).toFixed(2)}
                </span>
                <span className="text-ink-muted">{r.reason}</span>
                <span className="ml-auto text-xs text-ink-faint">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}