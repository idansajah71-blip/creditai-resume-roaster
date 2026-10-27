import { createClient } from "@/lib/supabase/server";
import { Stat } from "@/components/ui/Stat";
import { Sheet } from "@/components/ui/Sheet";
import DeleteDataSection from "@/components/DeleteDataSection";
import StarterCreditsBanner from "@/components/StarterCreditsBanner";
import HistoryRows from "@/components/HistoryRows";
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
    <div className="space-y-10">
      <div className="space-y-2">
        <div className="type-label">Overview</div>
        <h1 className="type-display text-ink">Welcome back.</h1>
      </div>

      <StarterCreditsBanner />

      <div className="grid gap-6 md:grid-cols-3 md:gap-6">
        <Stat label="Credits" value={profile?.credit_balance ?? 0} />
        <Stat label="Analyses run" value={(jobs ?? []).length} />
        <Stat label="Last match score" value={lastScore} />
      </div>

      <Sheet className="sheet-hero flex flex-col items-start gap-4 p-6 md:p-8 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="type-h3 text-ink">Start a review</h2>
          <p className="mt-1 text-sm leading-6 text-ink-2">
            Paste a resume and a job description. 1 credit per analysis.
          </p>
        </div>
        <Link href="/analyze" className="btn btn-primary px-5 text-sm">
          Start a review
        </Link>
      </Sheet>

      <HistoryRows rows={typedJobs} title="Recent analyses" />

      <DeleteDataSection />
    </div>
  );
}
