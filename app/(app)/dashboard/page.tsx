import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import DeleteDataSection from "@/components/DeleteDataSection";
import StarterCreditsBanner from "@/components/StarterCreditsBanner";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", user!.id)
    .single();

  const { data: jobs } = await supabase
    .from("ai_jobs")
    .select("id, status, credits_cost, result, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  type JobRow = { id: string; status: string; result: string | null; credits_cost: number; created_at: string };
  const typedJobs = (jobs ?? []) as JobRow[];
  const lastScore =
    typedJobs.find((j) => j.result)?.result
      ? (() => {
          try {
            return JSON.parse(typedJobs.find((j) => j.result)!.result as string).matchScore;
          } catch {
            return "-";
          }
        })()
      : "-";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Welcome back.</p>
      </div>

      <StarterCreditsBanner />

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Credits" value={profile?.credit_balance ?? 0} />
        <Stat label="Analyses run" value={(jobs ?? []).length} />
        <Stat label="Last match score" value={lastScore} />
      </div>

      <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Start a new analysis</h2>
          <p className="text-sm text-ink-muted">Paste a resume and a job description.</p>
        </div>
        <Link href="/analyze" className="btn btn-primary px-4 py-2 text-sm">
          New analysis
        </Link>
      </Card>

      <DeleteDataSection />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Recent analyses</h2>
        <div className="card divide-y divide-border">
          {typedJobs.length === 0 && (
            <div className="p-6 text-sm text-ink-muted">No analyses yet.</div>
          )}
          {typedJobs.map((j) => {
            let score: number | null = null;
            if (j.result) {
              try {
                score = JSON.parse(j.result).matchScore;
              } catch {}
            }
            return (
              <div key={j.id} className="flex items-center justify-between px-5 py-3">
                <span className="font-mono text-xs text-ink-faint">{j.id.slice(0, 8)}</span>
                <span className="text-sm text-ink-muted">{j.status}</span>
                <span className="font-mono text-sm text-ink">{score !== null ? `${score}/100` : "-"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}