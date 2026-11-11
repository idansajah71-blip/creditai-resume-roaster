// The Outcome Guarantee (deterministic, never the model's opinion).
// An analysis "meets the guarantee" when, after at most one automatic rewrite
// retry at no extra credit, ALL of these hold:
//   1. the fabrication guard reports no unverified details;
//   2. coverage gain >= GUARANTEE_MIN_GAIN points
//      OR (coverage before >= GUARANTEE_ALREADY_STRONG and it did not drop);
//   3. at most GUARANTEE_MAX_ADDED_TERMS terms were added to the rewrite.
// Otherwise the credit is refunded automatically and the user is told exactly
// why. Thresholds are env-configurable with defaults in code; the money side
// lives in SQL (supabase/migrations/0010_guarantee_refund.sql). This file has
// no I/O of its own and never imports Supabase: the reconcile caller injects
// a service client, so the pure parts stay unit-testable.

export type GuaranteeThresholds = {
  minGain: number;
  alreadyStrong: number;
  maxAddedTerms: number;
  dailyRefundLimit: number;
};

export const GUARANTEE_DEFAULTS: GuaranteeThresholds = {
  minGain: 10,
  alreadyStrong: 85,
  maxAddedTerms: 2,
  dailyRefundLimit: 3,
};

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function guaranteeThresholds(
  env: Record<string, string | undefined> = process.env,
): GuaranteeThresholds {
  return {
    // Env overrides are clamped into sane ranges so a typo cannot silently
    // break the bar: gain 0-100, strong bar 50-100, added terms 0-25, daily
    // refunds 0-100 (0 swallows refunds -> every miss becomes 'waived').
    minGain: Math.min(100, Math.max(0, num(env.GUARANTEE_MIN_GAIN, GUARANTEE_DEFAULTS.minGain))),
    alreadyStrong: Math.min(100, Math.max(50, num(env.GUARANTEE_ALREADY_STRONG, GUARANTEE_DEFAULTS.alreadyStrong))),
    maxAddedTerms: Math.min(25, Math.max(0, num(env.GUARANTEE_MAX_ADDED_TERMS, GUARANTEE_DEFAULTS.maxAddedTerms))),
    dailyRefundLimit: Math.min(100, Math.max(0, num(env.GUARANTEE_DAILY_REFUND_LIMIT, GUARANTEE_DEFAULTS.dailyRefundLimit))),
  };
}

export type GuaranteeReasonCode = "fabrication" | "low_gain" | "too_many_added_terms";

export type GuaranteeReason = {
  code: GuaranteeReasonCode;
  message: string;
  detail: Record<string, unknown>;
};

export type GuaranteeCoverageInput = {
  before: number;
  after: number;
  gain?: number; // optional explicit gain; derived when omitted
  addedTerms?: unknown[];
};

export type GuaranteeInput = {
  coverage: GuaranteeCoverageInput;
  fabricationClean: boolean;
  thresholds: GuaranteeThresholds;
};

export type GuaranteeVerdict = {
  met: boolean;
  reasons: GuaranteeReason[];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* Pure decision: see the module comment for the bar. Every failed condition
   becomes one plain-language reason the UI can print verbatim. */
export function evaluateGuarantee({ coverage, fabricationClean, thresholds }: GuaranteeInput): GuaranteeVerdict {
  const before = Number(coverage.before) || 0;
  const after = Number(coverage.after) || 0;
  const gain = typeof coverage.gain === "number" ? round1(coverage.gain) : round1(after - before);
  const addedCount = Array.isArray(coverage.addedTerms) ? coverage.addedTerms.length : 0;
  const reasons: GuaranteeReason[] = [];

  if (!fabricationClean) {
    reasons.push({
      code: "fabrication",
      message: "The rewrite still contains details that are not in your original resume (flagged below).",
      detail: {},
    });
  }

  const gainOk = gain >= thresholds.minGain;
  const strongNoDrop = before >= thresholds.alreadyStrong && after >= before;
  if (!gainOk && !strongNoDrop) {
    reasons.push({
      code: "low_gain",
      message: `Keyword coverage rose by ${gain.toFixed(1)} points; the guarantee needs at least ${round1(thresholds.minGain)}.${
        before >= thresholds.alreadyStrong ? " Coverage also dropped below its original level." : ""
      }`,
      detail: { before, after, gain, minGain: thresholds.minGain },
    });
  }

  if (addedCount > thresholds.maxAddedTerms) {
    reasons.push({
      code: "too_many_added_terms",
      message: `The rewrite added ${addedCount} new keywords; the guarantee allows at most ${thresholds.maxAddedTerms}.`,
      detail: { added: addedCount },
    });
  }

  return { met: reasons.length === 0, reasons };
}

/* Reasons as plain JSONB for guarantee_reason on ai_jobs. */
export function reasonsForLedger(verdict: GuaranteeVerdict): {
  codes: GuaranteeReasonCode[];
  reasons: GuaranteeReason[];
} {
  return { codes: verdict.reasons.map((r) => r.code), reasons: verdict.reasons };
}

export const RECONCILE_MIN_AGE_MINUTES = 2;

export type ReconcileJobRow = {
  id: string;
  result: string | null;
  coverage_before: number | null;
  coverage_after: number | null;
};

export type ReconcileDecision =
  | { jobId: string; action: "met" }
  | { jobId: string; action: "refund"; reasonJson: { codes: GuaranteeReasonCode[]; reasons: GuaranteeReason[] } }
  | { jobId: string; action: "skip" };

/* Reconcile decision for one job, using only what is persisted (coverage
   columns + result JSON). Returns 'skip' whenever the persisted data cannot
   support a decision, so the helper never guesses. Known limit: the
   added-terms check is not re-derivable after input redaction (addedTerms was
   never persisted per-row), so it is skipped in reconciliation only. */
export function decideStaleGuarantee(row: ReconcileJobRow, thresholds: GuaranteeThresholds): ReconcileDecision {
  if (row.coverage_before === null || row.coverage_after === null) {
    return { jobId: row.id, action: "skip" };
  }

  let result: Record<string, unknown> = {};
  try {
    result = row.result ? (JSON.parse(row.result) as Record<string, unknown>) : {};
  } catch {
    result = {};
  }
  const unverified = Array.isArray(result.unverifiedDetails) ? result.unverifiedDetails : [];
  const coverage: GuaranteeCoverageInput = {
    before: row.coverage_before,
    after: row.coverage_after,
    gain: Math.round((row.coverage_after - row.coverage_before) * 10) / 10,
    addedTerms: [],
  };
  const verdict = evaluateGuarantee({ coverage, fabricationClean: unverified.length === 0, thresholds });
  if (verdict.met) return { jobId: row.id, action: "met" };
  return { jobId: row.id, action: "refund", reasonJson: reasonsForLedger(verdict) };
}

/* Minimal structural view of the service client the reconcile helper uses.
   The route passes the real supabase client through a single cast; the loose
   column typings here keep this file free of schema imports. */
type ReconcileFiltered = {
  eq: (col: string, value: unknown) => ReconcileFiltered;
  is: (col: string, value: unknown) => ReconcileFiltered;
  not: (col: string, op: string, value: unknown) => ReconcileFiltered;
  lt: (col: string, value: unknown) => ReconcileFiltered;
  limit: (n: number) => Promise<{ data: ReconcileJobRow[] | null; error: unknown }>;
};

export type ReconcileService = {
  from: (table: string) => {
    select: (cols: string) => ReconcileFiltered;
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
};

/* Best-effort reconcile: jobs that succeeded but never got their guarantee
   check stamped (process died between the success persist and the RPC, or the
   guarantee RPC failed transiently). Invoked on the user's next analyze
   request; every error is swallowed so it can never break the flow. */
export async function reconcileStaleGuarantees(
  service: ReconcileService,
  userId: string,
  thresholds: GuaranteeThresholds,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RECONCILE_MIN_AGE_MINUTES * 60 * 1000).toISOString();
    const { data } = await service
      .from("ai_jobs")
      .select("id, result, coverage_before, coverage_after")
      .eq("user_id", userId)
      .eq("status", "succeeded")
      .eq("guarantee_status", "not_applicable")
      .is("guarantee_checked_at", null)
      .not("coverage_after", "is", null)
      .lt("created_at", cutoff)
      .limit(5);
    const rows = (data as ReconcileJobRow[]) || [];
    for (const row of rows) {
      const decision = decideStaleGuarantee(row, thresholds);
      if (decision.action === "skip") continue;
      if (decision.action === "met") {
        await service.rpc("mark_guarantee_met", {
          p_job_id: decision.jobId,
          p_before: null,
          p_after: null,
        });
      } else {
        await service.rpc("apply_guarantee_refund", {
          p_job_id: decision.jobId,
          p_reason: decision.reasonJson,
          p_daily_limit: thresholds.dailyRefundLimit,
        });
      }
    }
  } catch (e) {
    console.error("guarantee_reconcile_failed", e instanceof Error ? e.message : e);
  }
}
