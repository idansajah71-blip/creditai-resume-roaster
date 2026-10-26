import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, status, credits_cost, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: orders } = await supabase
    .from("paypal_orders")
    .select("id, status, credits_to_grant, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent Analyses</h2>
        <ul className="divide-y rounded border bg-white">
          {(jobs ?? []).map((j: { id: string; status: string; credits_cost: number }) => (
            <li key={j.id} className="flex justify-between px-3 py-2 text-sm">
              <span>{j.id.slice(0, 8)}…</span>
              <span>{j.status}</span>
              <span>{j.credits_cost} credit</span>
            </li>
          ))}
          {(!jobs || jobs.length === 0) && (
            <li className="px-3 py-2 text-sm text-gray-500">Belum ada analisis.</li>
          )}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent Payments</h2>
        <ul className="divide-y rounded border bg-white">
          {(orders ?? []).map((o: { id: string; status: string; credits_to_grant: number }) => (
            <li key={o.id} className="flex justify-between px-3 py-2 text-sm">
              <span>{o.id.slice(0, 8)}…</span>
              <span>{o.status}</span>
              <span>+{o.credits_to_grant} credits</span>
            </li>
          ))}
          {(!orders || orders.length === 0) && (
            <li className="px-3 py-2 text-sm text-gray-500">Belum ada pembayaran.</li>
          )}
        </ul>
      </section>
      <p className="text-xs text-gray-400">User: {user?.email}</p>
    </div>
  );
}