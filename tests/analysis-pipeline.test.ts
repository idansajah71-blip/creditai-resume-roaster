import { describe, it, expect, vi } from "vitest";
import {
  AnalysisPipelineError,
  runAnalysisPipeline,
  type AnalysisDependencies,
} from "@/lib/analysis-pipeline";
import type { GuaranteeThresholds } from "@/lib/guarantee";
import type { TokenUsage } from "@/lib/model-cost";

const THRESHOLDS: GuaranteeThresholds = {
  minGain: 10,
  alreadyStrong: 85,
  maxAddedTerms: 2,
  dailyRefundLimit: 3,
};

const RESUME = `Jane Doe
Built services with PostgreSQL for 3 years.`;
const JOB = `Requirements
Skills: PostgreSQL, Kubernetes`;

function usage(prompt = 100, completion = 20): TokenUsage {
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

function analysisJson(rewritten: string, jdKeywords: { term: string; weight: 1 | 2 | 3 }[]) {
  return JSON.stringify({
    matchScore: 50,
    roast: "Roast.",
    strengths: ["a", "b", "c"],
    weaknesses: ["1", "2", "3", "4", "5"],
    requirementMatches: [{ requirement: "PostgreSQL", status: "met", evidence: "3 years" }],
    missingKeywords: ["Kubernetes"],
    recommendations: [{ section: "Experience", advice: "add evidence" }],
    rewrittenResume: rewritten,
    jdKeywords,
  });
}

const KEYWORDS = [
  { term: "PostgreSQL", weight: 1 as const },
  { term: "Kubernetes", weight: 1 as const },
];

function deps(overrides: Partial<AnalysisDependencies> = {}): AnalysisDependencies {
  return {
    analyze: vi.fn(async () => ({ content: analysisJson("built PostgreSQL and Kubernetes pipelines for 3 years.", KEYWORDS), usage: usage() })),
    score: vi.fn(async () => ({ score: 88, usage: usage(10, 5) })),
    ...overrides,
  };
}

describe("runAnalysisPipeline", () => {
  it("returns deterministic coverage, guarantee and aggregated token usage", async () => {
    const dependencies = deps();
    const result = await runAnalysisPipeline(RESUME, JOB, { thresholds: THRESHOLDS, dependencies });

    expect(result.coverage.before).toBe(50);
    expect(result.coverage.after).toBe(100);
    expect(result.coverage.gain).toBe(50);
    expect(result.guarantee.met).toBe(true);
    expect(result.result.unverifiedDetails).toEqual([]);
    expect(result.result.estimatedAfterScore).toBe(88);
    expect(result.result.language).toBe("en");
    expect(result.usage).toEqual({ prompt_tokens: 110, completion_tokens: 25, total_tokens: 135 });
    expect(dependencies.analyze).toHaveBeenCalledTimes(1);
    expect(dependencies.score).toHaveBeenCalledTimes(1);
  });

  it("retries once with avoidDetails when the fabrication guard flags more than two details", async () => {
    const analyze = vi
      .fn()
      .mockResolvedValueOnce({
        content: analysisJson(
          "Jane polished things at Acme Rocket Labs, managing a $1,200 budget, growing 40% until 2029.",
          [],
        ),
        usage: usage(),
      })
      .mockResolvedValueOnce({
        content: analysisJson("improved checkout flows using solid engineering habits.", []),
        usage: usage(),
      });
    const score = vi.fn(async () => ({ score: 70, usage: usage(10, 5) }));

    const result = await runAnalysisPipeline(RESUME, JOB, {
      thresholds: THRESHOLDS,
      dependencies: { analyze, score },
    });

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1][2]).toMatchObject({
      avoidDetails: expect.arrayContaining(["Acme Rocket Labs"]),
    });
    expect(result.result.unverifiedDetails).toEqual([]);
    expect(result.rewriteAttempts).toBe(2);
    expect(result.usage).toEqual({ prompt_tokens: 210, completion_tokens: 45, total_tokens: 255 });
  });

  it("retries once with strengthenTerms when coverage misses the guarantee bar", async () => {
    const analyze = vi
      .fn()
      .mockResolvedValueOnce({
        content: analysisJson("improved services with PostgreSQL.", KEYWORDS),
        usage: usage(),
      })
      .mockResolvedValueOnce({
        content: analysisJson("built PostgreSQL and Kubernetes pipelines for 3 years.", KEYWORDS),
        usage: usage(),
      });
    const score = vi.fn(async () => ({ score: 90, usage: usage(10, 5) }));

    const result = await runAnalysisPipeline(RESUME, JOB, {
      thresholds: THRESHOLDS,
      dependencies: { analyze, score },
    });

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1][2]).toMatchObject({
      strengthenTerms: expect.arrayContaining(["Kubernetes"]),
    });
    expect(result.guarantee.met).toBe(true);
    expect(result.coverage.after).toBe(100);
  });

  it("throws a typed invalid_output error and keeps the usage already spent", async () => {
    const analyze = vi.fn(async () => ({ content: "not json", usage: usage() }));
    const score = vi.fn();

    try {
      await runAnalysisPipeline(RESUME, JOB, {
        thresholds: THRESHOLDS,
        dependencies: { analyze, score },
      });
      throw new Error("expected pipeline to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AnalysisPipelineError);
      expect((e as AnalysisPipelineError).code).toBe("invalid_output");
      expect((e as AnalysisPipelineError).usage).toEqual({
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
      });
      expect(score).not.toHaveBeenCalled();
    }
  });

  it("keeps analysis usage when the optional scoring pass fails", async () => {
    const analyze = vi.fn(async () => ({
      content: analysisJson("built PostgreSQL and Kubernetes pipelines for 3 years.", KEYWORDS),
      usage: usage(),
    }));
    const score = vi.fn(async () => {
      throw new Error("score_failed");
    });

    const result = await runAnalysisPipeline(RESUME, JOB, {
      thresholds: THRESHOLDS,
      dependencies: { analyze, score },
    });

    expect(result.result.estimatedAfterScore).toBeUndefined();
    expect(result.usage).toEqual({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
  });
});
