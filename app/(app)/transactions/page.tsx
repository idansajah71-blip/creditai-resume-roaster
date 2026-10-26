import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";

type Tx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reserved_after: number;
  reference_type: string | null;
  created_at: string;
};

export default async function TransactionsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_transactions")
    .select("id, type, amount, balance_after, reserved_after, reference_type, created_at")
    .order("created_at", { ascending: false });

  const txs = (data as Tx[]) || [];

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
                <td className="p-3 text-ink">{t.type}</td>
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
    </div>
  );
}