import { createClient } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, status, model, credits_cost, result, error, created_at, completed_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Analysis History</h1>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Score</th>
              <th className="p-2 text-left">Cost</th>
              <th className="p-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).map((j: { id: string; status: string; result: string | null; credits_cost: number; created_at: string }) => {
              let score: number | null = null;
              if (j.result) {
                try {
                  score = JSON.parse(j.result).matchScore;
                } catch {}
              }
              return (
                <tr key={j.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{j.id.slice(0, 8)}…</td>
                  <td className="p-2">{j.status}</td>
                  <td className="p-2">{score !== null ? `${score}/100` : "-"}</td>
                  <td className="p-2">{j.credits_cost}</td>
                  <td className="p-2">{new Date(j.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}