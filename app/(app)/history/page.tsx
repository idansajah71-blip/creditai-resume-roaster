import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, status, model, credits_cost, result, error, created_at, completed_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
        Analysis history
      </h1>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted">
            <tr>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">ID</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Status</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Score</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Cost</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Created</th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-ink-muted">
                  No analyses yet.
                </td>
              </tr>
            )}
            {(jobs ?? []).map((j: { id: string; status: string; result: string | null; credits_cost: number; created_at: string }) => {
              let score: number | null = null;
              if (j.result) {
                try {
                  score = JSON.parse(j.result).matchScore;
                } catch {}
              }
              return (
                <tr key={j.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs text-ink-faint">{j.id.slice(0, 8)}</td>
                  <td className="p-3 text-ink">{j.status}</td>
                  <td className="p-3 font-mono text-ink">{score !== null ? `${score}/100` : "-"}</td>
                  <td className="p-3 font-mono text-ink">{j.credits_cost}</td>
                  <td className="p-3 text-ink-muted">{new Date(j.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}