import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";

type JobRow = {
  id: string;
  status: string;
  model: string | null;
  credits_cost: number;
  result: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

function scoreOf(j: JobRow): number | null {
  if (!j.result) return null;
  try {
    const parsed = JSON.parse(j.result) as { matchScore?: number };
    return typeof parsed.matchScore === "number" ? parsed.matchScore : null;
  } catch {
    return null;
  }
}

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const th = "px-4 py-2.5 type-label whitespace-nowrap text-left";
const numTd = "px-4 py-3 font-mono text-right text-ink whitespace-nowrap";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, status, model, credits_cost, result, error, created_at, completed_at")
    .order("created_at", { ascending: false });

  const rows = ((jobs ?? []) as JobRow[]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="type-label">Ledger of reviews</div>
        <h1 className="type-display text-ink">Analysis history</h1>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No analyses yet." body="Run your first review from the Analyze page." />
      ) : (
        <>
          {/* Desktop: full-width ruled table with a sticky header */}
          <div className="hidden overflow-hidden rounded-[10px] border border-line bg-sheet md:block">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-paper">
                  <tr className="border-b border-line">
                    <th className={th}>ID</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Score</th>
                    <th className={`${th} text-right`}>Cost</th>
                    <th className={`${th} text-right`}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    const score = scoreOf(j);
                    return (
                      <tr key={j.id} className="first:border-t-0 border-t border-line">
                        <td className="px-4 py-3 font-mono text-xs text-ink-3 whitespace-nowrap">
                          <span title={j.id}>{j.id.slice(0, 8)}</span>
                        </td>
                        <td className={`px-4 py-3 text-ink-2 ${j.status === "failed" ? "text-red-pen" : ""}`}>
                          {j.status}
                        </td>
                        <td className={numTd}>{score !== null ? `${score}/100` : "-"}</td>
                        <td className={numTd}>{j.credits_cost}</td>
                        <td className={`${numTd} text-[11px] text-ink-3`} title={new Date(j.created_at).toLocaleString()}>
                          {relTime(j.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: stacked entry slips */}
          <div className="grid gap-4 md:hidden">
            {rows.map((j) => {
              const score = scoreOf(j);
              return (
                <div key={j.id} className="rounded-[10px] border border-line bg-sheet p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-ink-3" title={j.id}>
                      {j.id.slice(0, 8)}
                    </span>
                    <span className={`font-mono text-[11px] uppercase tracking-[0.08em] ${j.status === "failed" ? "text-red-pen" : "text-ink-3"}`}>
                      {j.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div className="type-label">Score</div>
                      <div className="font-mono text-[24px] leading-7 text-ink">{score !== null ? `${score}/100` : "-"}</div>
                    </div>
                    <div className="text-right">
                      <div className="type-label">Cost</div>
                      <div className="font-mono text-[24px] leading-7 text-ink">{j.credits_cost}</div>
                    </div>
                  </div>
                  <div
                    className="mt-3 border-t border-line pt-2 font-mono text-[11px] leading-4 text-ink-3"
                    title={new Date(j.created_at).toLocaleString()}
                  >
                    {relTime(j.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
