import { describe, it, expect, vi, beforeEach } from "vitest";

/* Route flow with mocks, mirroring tests/analysis.test.ts patterns.
   The guarantee decision runs the REAL lib/coverage + lib/guarantee code;
   only Supabase service, OpenAI calls, credits and rate limit are mocked. */

const baseResult = {
  matchScore: 52,
  roast: "Roast.",
  strengths: ["a", "b", "c"],
  weaknesses: ["1", "2", "3", "4", "5"],
  requirementMatches: [{ requirement: "PostgreSQL", status: "missing", evidence: "none" }],
  missingKeywords: ["PostgreSQL"],
  recommendations: [{ section: "Experience", advice: "add metrics" }],
  rewrittenResume: "",
  jdKeywords: [
    { term: "PostgreSQL", weight: 1 as const },
    { term: "Kubernetes", weight: 1 as const },
  ],
};

const goodResume = `Jane Doe, backend engineer.
Built services with PostgreSQL for 3 years.`;
const JD = "Must know PostgreSQL and Kubernetes.";

function runResult(rewritten: string): string {
  return JSON.stringify({ ...baseResult, rewrittenResume: rewritten });
}

const { mockService, rpcCalls, insertPayloads, updatePayloads, rpcScript } = vi.hoisted(() => {
  const rpcScript: { fn: string; response: unknown }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const insertPayloads: Record<string, unknown>[] = [];
  const updatePayloads: Record<string, unknown>[] = [];
  const from = vi.fn();
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown> | undefined) => {
    rpcCalls.push({ fn, args: args || {} });
    const scripted = rpcScript.find((s) => s.fn === fn);
    if (scripted) return scripted.response as { error: unknown };
    return { data: null, error: null };
  });
  return { mockService: { from, rpc }, rpcCalls, insertPayloads, updatePayloads, rpcScript };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
  createServiceClient: () => mockService,
}));

const reserveCredit = vi.fn();
const consumeReservation = vi.fn();
const refundReservation = vi.fn();
vi.mock("@/lib/credits", () => ({ reserveCredit, consumeReservation, refundReservation }));

const analyzeResume = vi.fn();
const scoreResume = vi.fn();
const USAGE = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
const SCORE_USAGE = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
const ok = (content: string) => ({ content, usage: USAGE });
const score = (value: number) => ({ score: value, usage: SCORE_USAGE });
vi.mock("@/lib/openai", () => ({
  analyzeResumeDetailed: analyzeResume,
  scoreResumeDetailed: scoreResume,
  currentModel: () => "gpt-4o-mini",
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDb: async () => true }));

let existingJobs: Record<string, unknown>[] = [];
let staleJobs: Record<string, unknown>[] = [];

function makeService() {
  mockService.from.mockImplementation(() => {
    /* One lenient builder for every select shape used by the route:
       - count queries: select.eq(...).gte(...) -> { count: 0 }
       - idempotency replay: select.eq(...).maybeSingle() -> existingJobs[0]
       - reconcile: select.eq/is/not/lt().limit() -> staleJobs
       - job insert: insert().select().single() -> job1; updates are recorded. */
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = () => chain;
    chain.not = () => chain;
    chain.lt = () => chain;
    chain.gte = () => Promise.resolve({ data: null, count: 0, error: null });
    chain.limit = () => Promise.resolve({ data: staleJobs, error: null });
    chain.maybeSingle = () => Promise.resolve({ data: existingJobs[0] ?? null, error: null });
    chain.single = () => Promise.resolve({ data: { id: "job1" }, error: null });
    chain.insert = (payload: Record<string, unknown>) => {
      insertPayloads.push(payload);
      return { select: () => ({ single: async () => ({ data: { id: "job1" }, error: null }) }) };
    };
    chain.update = (payload: Record<string, unknown>) => {
      updatePayloads.push(payload);
      return { eq: async () => ({ error: null }) };
    };
    return chain;
  });
}

describe("analyze route: guarantee flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcScript.length = 0;
    rpcCalls.length = 0;
    insertPayloads.length = 0;
    updatePayloads.length = 0;
    existingJobs = [];
    staleJobs = [];
    reserveCredit.mockResolvedValue({ reservationId: "res1", balance: 0, reserved: 1 });
    scoreResume.mockResolvedValue(score(71));
    makeService();
  });

  async function post(resume = goodResume, idempotencyKey?: string) {
    const { POST } = await import("@/app/api/ai/analyze/route");
    return POST(
      new Request("http://localhost/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: resume, jobDescription: JD, idempotencyKey }),
      }),
    );
  }

  it("met: pass 1 clears the bar, stamp RPC is called, no refund", async () => {
    // The rewrite actually contains the JD terms -> strong gain; no invented details.
    analyzeResume.mockResolvedValue(ok(runResult("shipped PostgreSQL and Kubernetes pipelines for 3 years.")));
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.result.guarantee.status).toBe("met");
    expect(json.data.result.guarantee.reasons).toEqual([]);
    expect(json.data.result.coverage.after).toBe(100);
    expect(analyzeResume).toHaveBeenCalledTimes(1);
    const mark = rpcCalls.find((c) => c.fn === "mark_guarantee_met");
    expect(mark).toBeTruthy();
    expect(rpcCalls.some((c) => c.fn === "apply_guarantee_refund")).toBe(false);
    const succeeded = updatePayloads.find((p) => p.status === "succeeded");
    expect(succeeded?.prompt_tokens).toBe(110);
    expect(succeeded?.completion_tokens).toBe(25);
  });

  it("failed then guarantee retry succeeds: retry carries strengthen terms, stamps met", async () => {
    analyzeResume
      .mockResolvedValueOnce(ok(runResult("Improved checkout flows with solid habits.")))
      .mockResolvedValueOnce(ok(runResult("shipped PostgreSQL and Kubernetes pipelines for 3 years.")));
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(analyzeResume).toHaveBeenCalledTimes(2);
    const secondOptions = analyzeResume.mock.calls[1][2];
    expect(secondOptions.strengthenTerms).toContain("PostgreSQL");
    expect(secondOptions.avoidDetails).toEqual([]);
    expect(json.data.result.guarantee.status).toBe("met");
  });

  it("failed twice then refund: RPC receives the reasons and the response shows refunded", async () => {
    rpcScript.push({
      fn: "apply_guarantee_refund",
      response: { data: [{ status: "refunded", credits_refunded: 1 }], error: null },
    });
    analyzeResume.mockResolvedValue(ok(runResult("Improved checkout flows with solid habits.")));
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(analyzeResume).toHaveBeenCalledTimes(2);
    const refund = rpcCalls.find((c) => c.fn === "apply_guarantee_refund");
    expect(refund).toBeTruthy();
    expect(refund!.args.p_daily_limit).toBe(3);
    const reason = refund!.args.p_reason as { codes: string[]; reasons: unknown[] };
    expect(reason.codes).toContain("low_gain");
    expect(json.data.result.guarantee.status).toBe("refunded");
    expect(json.data.result.guarantee.creditsRefunded).toBe(1);
    // The decision is stamped on the job columns; the stored result JSON stays model+flags.
    const succeeded = updatePayloads.find((p) => p.status === "succeeded");
    expect(succeeded?.coverage_after).toBe(0);
    expect(succeeded?.guarantee_status).toBeUndefined();
  });

  it("refund RPC failure never fails the request: not_applicable + console.error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcScript.push({
      fn: "apply_guarantee_refund",
      response: { data: null, error: { message: "db down" } },
    });
    analyzeResume.mockResolvedValue(ok(runResult("Improved checkout flows with solid habits.")));
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.result.guarantee.status).toBe("not_applicable");
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0][0])).toContain("guarantee_refund_failed");
    errSpy.mockRestore();
  });

  it("daily cap: the SQL layer can waive, and the response reports it", async () => {
    rpcScript.push({
      fn: "apply_guarantee_refund",
      response: { data: [{ status: "waived", credits_refunded: 0 }], error: null },
    });
    analyzeResume.mockResolvedValue(ok(runResult("Improved checkout flows with solid habits.")));
    const res = await post();
    const json = await res.json();
    expect(json.data.result.guarantee.status).toBe("waived");
    expect(json.data.result.guarantee.creditsRefunded).toBe(0);
  });

  it("double call idempotency: a replayed analyze never touches the refund RPC again", async () => {
    rpcScript.push({
      fn: "apply_guarantee_refund",
      response: { data: [{ status: "refunded", credits_refunded: 1 }], error: null },
    });
    analyzeResume.mockResolvedValue(ok(runResult("Improved checkout flows with solid habits.")));
    const first = await post(undefined, "double-key-12345678");
    expect((await first.json()).data.result.guarantee.status).toBe("refunded");
    expect(rpcCalls.filter((c) => c.fn === "apply_guarantee_refund")).toHaveLength(1);

    // Second POST with the same idempotency key replays the stored succeeded job.
    existingJobs = [
      { id: "job1", status: "succeeded", result: runResult("Improved checkout flows with solid habits.") },
    ];
    analyzeResume.mockClear();
    const replayed = await post(undefined, "double-key-12345678");
    expect(replayed.status).toBe(200);
    expect(analyzeResume).not.toHaveBeenCalled();
    expect(rpcCalls.filter((c) => c.fn === "apply_guarantee_refund")).toHaveLength(1);
  });

  it("reconcile runs best-effort before the analysis and stamps stale met jobs", async () => {
    staleJobs = [
      {
        id: "stale-1",
        result: JSON.stringify({ unverifiedDetails: [] }),
        coverage_before: 90,
        coverage_after: 94,
      },
    ];
    analyzeResume.mockResolvedValue(ok(runResult("shipped PostgreSQL and Kubernetes pipelines for 3 years.")));
    const res = await post();
    expect(res.status).toBe(200);
    expect(rpcCalls.some((c) => c.fn === "mark_guarantee_met" && c.args.p_job_id === "stale-1")).toBe(true);
  });
});
