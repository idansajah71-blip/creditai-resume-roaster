// The real analysis pipeline, shared by the API route and the eval harness.
//
// Keeping the orchestration here (model calls, validation, fabrication retry,
// deterministic coverage, guarantee retry, second scoring pass, token
// aggregation) means `npm run eval` measures the same code path users hit.
// The only injected pieces are the OpenAI call functions, which makes the
// pipeline unit-testable without network access.
import { analysisResultSchema, type AnalysisResult } from "@/lib/ai-schema";
import { compareCoverage, filterKeywordsAgainstJD, type Term } from "@/lib/coverage";
import { findUnverifiedDetails } from "@/lib/fabrication-guard";
import {
  evaluateGuarantee,
  type GuaranteeReason,
  type GuaranteeThresholds,
} from "@/lib/guarantee";
import { detectLanguage, type Lang } from "@/lib/language";
import { addUsage, currentModel, EMPTY_USAGE, type TokenUsage } from "@/lib/model-cost";
import {
  analyzeResumeDetailed,
  scoreResumeDetailed,
  type AnalyzeOptions,
  type AnalyzeCallResult,
  type ScoreCallResult,
} from "@/lib/openai";

export type CoverageSummary = {
  before: number;
  after: number;
  gain: number;
  addedTerms: Term[];
  lostTerms: Term[];
  matched: Term[];
  missing: Term[];
};

export type GuaranteeSummary = {
  met: boolean;
  reasons: GuaranteeReason[];
};

export type AnalysisPipelineResult = {
  result: AnalysisResult;
  coverage: CoverageSummary;
  guarantee: GuaranteeSummary;
  usage: TokenUsage;
  model: string;
  language: Lang;
  rewriteAttempts: number;
};

export class AnalysisPipelineError extends Error {
  readonly code: "ai_request_failed" | "invalid_output";
  readonly usage: TokenUsage;

  constructor(code: "ai_request_failed" | "invalid_output", usage: TokenUsage, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "AnalysisPipelineError";
    this.code = code;
    this.usage = usage;
  }
}

export type AnalysisDependencies = {
  analyze?: (
    resume: string,
    jobDescription: string,
    options?: AnalyzeOptions,
  ) => Promise<AnalyzeCallResult>;
  score?: (rewritten: string, jobDescription: string) => Promise<ScoreCallResult>;
};

export type AnalysisPipelineOptions = {
  thresholds: GuaranteeThresholds;
  dependencies?: AnalysisDependencies;
};

function summarizeCoverage(
  coverage: ReturnType<typeof compareCoverage>,
): CoverageSummary {
  return {
    before: coverage.before.score,
    after: coverage.after.score,
    gain: coverage.gain,
    addedTerms: coverage.addedTerms,
    lostTerms: coverage.lostTerms,
    matched: coverage.after.matched,
    missing: coverage.after.missing,
  };
}

export async function runAnalysisPipeline(
  resumeText: string,
  jobDescription: string,
  options: AnalysisPipelineOptions,
): Promise<AnalysisPipelineResult> {
  const analyze = options.dependencies?.analyze ?? analyzeResumeDetailed;
  const score = options.dependencies?.score ?? scoreResumeDetailed;
  const language = detectLanguage(resumeText);

  let usage: TokenUsage = { ...EMPTY_USAGE };
  const callAnalyze = async (callOptions: AnalyzeOptions): Promise<string> => {
    const call = await analyze(resumeText, jobDescription, callOptions);
    usage = addUsage(usage, call.usage);
    return call.content;
  };

  const parseResult = (raw: string): AnalysisResult => {
    try {
      return analysisResultSchema.parse(JSON.parse(raw));
    } catch (e) {
      throw new AnalysisPipelineError("invalid_output", usage, e);
    }
  };

  let raw: string;
  try {
    raw = await callAnalyze({ language });
  } catch (e) {
    if (e instanceof AnalysisPipelineError) throw e;
    throw new AnalysisPipelineError("ai_request_failed", usage, e);
  }
  let result = parseResult(raw);

  // Deterministic fabrication guard: flag details absent from the original.
  let unverified = findUnverifiedDetails(resumeText, result.rewrittenResume, jobDescription);
  let rewriteAttempts = 1;
  if (unverified.length > 2) {
    // One stricter rewrite retry, at no extra credit cost. A failed retry
    // keeps the first result and its flags.
    rewriteAttempts = 2;
    try {
      const retryRaw = await callAnalyze({
        language,
        avoidDetails: unverified,
      });
      const retryResult = parseResult(retryRaw);
      result = retryResult;
      unverified = findUnverifiedDetails(resumeText, result.rewrittenResume, jobDescription);
    } catch {
      // Keep the first result and report the flagged details as-is.
    }
  }

  /* Deterministic keyword coverage, computed by code from the job wording the
     model extracted (keywords must exist in the JD itself; anti-hallucination
     filter drops the rest). No extra model calls. */
  let keywords = filterKeywordsAgainstJD(result.jdKeywords ?? [], jobDescription).slice(0, 25);
  let coverage = compareCoverage(resumeText, result.rewrittenResume, keywords);
  let verdict = evaluateGuarantee({
    coverage: {
      before: coverage.before.score,
      after: coverage.after.score,
      gain: coverage.gain,
      addedTerms: coverage.addedTerms,
    },
    fabricationClean: unverified.length === 0,
    thresholds: options.thresholds,
  });

  // Guarantee retry: one extra rewrite attempt at no extra credit, only when
  // the bar failed and no retry was used yet. The retry instruction lists the
  // still-missing keywords and never asks for skills the original resume does
  // not support; previously flagged details stay forbidden.
  if (!verdict.met && rewriteAttempts === 1) {
    try {
      const retryRaw = await callAnalyze({
        language,
        avoidDetails: unverified,
        strengthenTerms: coverage.after.missing.map((k) => k.term),
      });
      const retryResult = parseResult(retryRaw);
      result = retryResult;
      unverified = findUnverifiedDetails(resumeText, result.rewrittenResume, jobDescription);
      keywords = filterKeywordsAgainstJD(result.jdKeywords ?? [], jobDescription).slice(0, 25);
      coverage = compareCoverage(resumeText, result.rewrittenResume, keywords);
      verdict = evaluateGuarantee({
        coverage: {
          before: coverage.before.score,
          after: coverage.after.score,
          gain: coverage.gain,
          addedTerms: coverage.addedTerms,
        },
        fabricationClean: unverified.length === 0,
        thresholds: options.thresholds,
      });
    } catch {
      // Keep the previous result; its verdict stands.
    }
  }

  // Before/after estimate: cheap second scoring pass; omit silently on failure.
  try {
    const scoreCall = await score(result.rewrittenResume, jobDescription);
    usage = addUsage(usage, scoreCall.usage);
    result.estimatedAfterScore = scoreCall.score;
  } catch {
    // no delta shown
  }

  result.language = language;
  result.unverifiedDetails = unverified;

  return {
    result,
    coverage: summarizeCoverage(coverage),
    guarantee: { met: verdict.met, reasons: verdict.reasons },
    usage,
    model: currentModel(),
    language,
    rewriteAttempts,
  };
}
