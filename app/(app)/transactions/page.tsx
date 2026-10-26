import { createClient } from "@/lib/supabase/server";

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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Transaction History</h1>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Amount</th>
              <th className="p-2 text-left">Balance After</th>
              <th className="p-2 text-left">Reserved After</th>
              <th className="p-2 text-left">Ref</th>
              <th className="p-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2 font-mono text-xs">{t.id.slice(0, 8)}…</td>
                <td className="p-2">{t.type}</td>
                <td className="p-2">{t.amount}</td>
                <td className="p-2">{t.balance_after}</td>
                <td className="p-2">{t.reserved_after}</td>
                <td className="p-2">{t.reference_type || "-"}</td>
                <td className="p-2">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}