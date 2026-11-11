import { describe, it, expect } from "vitest";
import {
  evaluateGuarantee,
  guaranteeThresholds,
  reasonsForLedger,
  decideStaleGuarantee,
  GUARANTEE_DEFAULTS,
  type GuaranteeThresholds,
} from "@/lib/guarantee";

const TH: GuaranteeThresholds = {
  minGain: 10,
  alreadyStrong: 85,
  maxAddedTerms: 2,
  dailyRefundLimit: 3,
};

function eval_(opts: {
  before: number;
  after: number;
  gain?: number;
  added?: number;
  fabricationClean?: boolean;
  thresholds?: Partial<GuaranteeThresholds>;
}) {
  return evaluateGuarantee({
    coverage: { before: opts.before, after: opts.after, ...(opts.gain !== undefined ? { gain: opts.gain } : {}), addedTerms: Array.from({ length: opts.added ?? 0 }, (_, i) => i) },
    fabricationClean: opts.fabricationClean ?? true,
    thresholds: { ...TH, ...opts.thresholds },
  });
}

describe("evaluateGuarantee decision table", () => {
  it("boundary: gain exactly minGain passes", () => {
    const v = eval_({ before: 20, after: 30 });
    expect(v.met).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it("boundary: gain 0.1 below minGain fails with the low_gain reason", () => {
    const v = eval_({ before: 20, after: 29.9 });
    expect(v.met).toBe(false);
    expect(v.reasons.map((r) => r.code)).toEqual(["low_gain"]);
  });

  it("boundary: already-strong bar exactly 85 with no drop passes even with 0 gain", () => {
    const v = eval_({ before: 85, after: 85 });
    expect(v.met).toBe(true);
  });

  it("already-strong 84.9 does not pass with 0 gain", () => {
    const v = eval_({ before: 84.9, after: 84.9 });
    expect(v.met).toBe(false);
    expect(v.reasons.map((r) => r.code)).toEqual(["low_gain"]);
  });

  it("a drop below the original level fails even at the strong bar", () => {
    const v = eval_({ before: 90, after: 89 });
    expect(v.met).toBe(false);
    expect(v.reasons[0].code).toBe("low_gain");
    expect(v.reasons[0].message).toContain("dropped");
  });

  it("dirty fabrication fails even with a strong gain", () => {
    const v = eval_({ before: 0, after: 60, fabricationClean: false });
    expect(v.met).toBe(false);
    expect(v.reasons.map((r) => r.code)).toContain("fabrication");
    expect(v.reasons.map((r) => r.code)).not.toContain("low_gain");
  });

  it("boundary: exactly maxAddedTerms passes", () => {
    const v = eval_({ before: 0, after: 30, added: 2 });
    expect(v.met).toBe(true);
  });

  it("boundary: one more than maxAddedTerms fails", () => {
    const v = eval_({ before: 0, after: 30, added: 3 });
    expect(v.met).toBe(false);
    expect(v.reasons.map((r) => r.code)).toEqual(["too_many_added_terms"]);
    expect(v.reasons[0].message).toContain("added 3 new keywords");
  });

  it("maxAddedTerms 0 rejects any added term (env-driven strictness)", () => {
    const v = eval_({ before: 0, after: 30, added: 1, thresholds: { maxAddedTerms: 0 } });
    expect(v.met).toBe(false);
  });

  it("zero keywords: before 0 after 0 gives a finite low_gain failure, no NaN", () => {
    const v = eval_({ before: 0, after: 0 });
    expect(v.met).toBe(false);
    expect(Number.isFinite(v.reasons[0].detail.gain)).toBe(true);
    expect(v.reasons[0].message).toBe("Keyword coverage rose by 0.0 points; the guarantee needs at least 10.");
  });

  it("a negative gain (lost terms) fails and reports the negative number", () => {
    const v = eval_({ before: 40, after: 25 });
    expect(v.met).toBe(false);
    expect(v.reasons[0].message).toContain("rose by -15.0 points");
  });

  it("multiple failures stack: fabrication + low gain appear together", () => {
    const v = eval_({ before: 0, after: 2, fabricationClean: false, added: 9 });
    expect(v.met).toBe(false);
    expect(v.reasons.map((r) => r.code)).toEqual(["fabrication", "low_gain", "too_many_added_terms"]);
  });

  it("reasons carry plain-language messages a user can read verbatim", () => {
    const v = eval_({ before: 5, after: 8, fabricationClean: false });
    expect(v.reasons[1].message).toBe("Keyword coverage rose by 3.0 points; the guarantee needs at least 10.");
  });

  it("minGain 0 makes every non-strong analysis pass via low-gain rules", () => {
    const v = eval_({ before: 0, after: 0.5, thresholds: { minGain: 0 } });
    expect(v.met).toBe(true);
  });

  it("explicit gain override is honored (used by reconcile where addedTerms cannot be re-derived)", () => {
    const v = eval_({ before: 10, after: 25, gain: 12.5 });
    expect(v.met).toBe(true);
  });
});

describe("reasonsForLedger", () => {
  it("serializes to the JSONB shape stored in guarantee_reason", () => {
    const v = eval_({ before: 0, after: 0, fabricationClean: false });
    const json = reasonsForLedger(v);
    expect(json.codes).toEqual(["fabrication", "low_gain"]);
    expect(json.reasons).toEqual(v.reasons);
  });
});

describe("guaranteeThresholds env parsing", () => {
  it("defaults when env is missing or unparseable", () => {
    expect(guaranteeThresholds({})).toEqual(GUARANTEE_DEFAULTS);
    expect(guaranteeThresholds({ GUARANTEE_MIN_GAIN: "abc" }).minGain).toBe(10);
  });

  it("parses valid overrides", () => {
    const th = guaranteeThresholds({
      GUARANTEE_MIN_GAIN: "5",
      GUARANTEE_ALREADY_STRONG: "90",
      GUARANTEE_MAX_ADDED_TERMS: "1",
      GUARANTEE_DAILY_REFUND_LIMIT: "7",
    });
    expect(th).toEqual({ minGain: 5, alreadyStrong: 90, maxAddedTerms: 1, dailyRefundLimit: 7 });
  });

  it("clamps out-of-range overrides into safe bounds", () => {
    const th = guaranteeThresholds({
      GUARANTEE_MIN_GAIN: "150",
      GUARANTEE_ALREADY_STRONG: "10",
      GUARANTEE_MAX_ADDED_TERMS: "99",
      GUARANTEE_DAILY_REFUND_LIMIT: "-2",
    });
    expect(th.minGain).toBe(100);
    expect(th.alreadyStrong).toBe(50); // >= 50 keeps the strong-or-gain bar meaningful
    expect(th.maxAddedTerms).toBe(25);
    expect(th.dailyRefundLimit).toBe(0);
  });
});

describe("decideStaleGuarantee (reconcile)", () => {
  it("skips when coverage columns are missing (legacy jobs)", () => {
    const d = decideStaleGuarantee(
      { id: "j1", result: null, coverage_before: null, coverage_after: null },
      TH,
    );
    expect(d).toEqual({ jobId: "j1", action: "skip" });
  });

  it("marks met for a strong-no-drop persisted pair", () => {
    const d = decideStaleGuarantee(
      { id: "j2", result: JSON.stringify({ unverifiedDetails: [] }), coverage_before: 90, coverage_after: 90 },
      TH,
    );
    expect(d).toEqual({ jobId: "j2", action: "met" });
  });

  it("refunds a persisted failure using the stored result flags", () => {
    const d = decideStaleGuarantee(
      { id: "j3", result: JSON.stringify({ unverifiedDetails: ["Acme"] }), coverage_before: 10, coverage_after: 12 },
      TH,
    );
    expect(d.action).toBe("refund");
    if (d.action === "refund") {
      expect(d.reasonJson.codes).toContain("fabrication");
    }
  });

  it("tolerates a corrupted stored result without throwing", () => {
    const d = decideStaleGuarantee(
      { id: "j4", result: "{not-json", coverage_before: 90, coverage_after: 95 },
      TH,
    );
    // No unverified list derivable -> treated as clean; strong gain -> met.
    expect(d).toEqual({ jobId: "j4", action: "met" });
  });
});
