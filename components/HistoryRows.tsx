import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";

export type JobRow = { id: string; status: string; result: string | null; created_at: string };

export function scoreOf(row: JobRow): number | null {
  if (!row.result) return null;
  try {
    const parsed = JSON.parse(row.result) as { matchScore?: number };
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

/* Compact history/analysis row: short mono ID, status label, score,
   relative time. Used on /analyze (History) and /dashboard (Recent). */
export default function HistoryRows({ rows, title = "History" }: { rows: JobRow[]; title?: string }) {
  return (
    <Sheet className="p-5">
      <h2 className="type-h3 text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">No analyses yet.</p>
      ) : (
        <ul className="mt-3">
          {rows.slice(0, 5).map((j) => {
            const score = scoreOf(j);
            return (
              <li key={j.id} className="flex items-center gap-2 border-b border-line py-2 text-sm last:border-b-0">
                <span className="font-mono text-xs text-ink-3">{j.id.slice(0, 8)}</span>
                <Badge variant={j.status === "failed" ? "missing" : "neutral"}>{j.status}</Badge>
                <span className="ml-auto font-mono text-xs text-ink">{score !== null ? `${score}/100` : "-"}</span>
                <span className="font-mono text-[11px] leading-4 text-ink-3">{relTime(j.created_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
