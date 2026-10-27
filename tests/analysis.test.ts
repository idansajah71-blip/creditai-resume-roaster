import { describe, it, expect, vi, beforeEach } from "vitest";

const validResult = {
  matchScore: 80,
  roast: "Nice resume, could be sharper.",
  strengths: ["a", "b", "c"],
  weaknesses: ["1", "2", "3", "4", "5"],
  requirementMatches: [{ requirement: "Node.js", status: "met", evidence: "3 years" }],
  missingKeywords: ["AWS", "CI/CD"],
  recommendations: [{ section: "Experience", advice: "add metrics" }],
  rewrittenResume: "Jane Doe ...",
};

const { mockService } = vi.hoisted(() => {
  const from = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { mockService: { from, rpc } };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
  createServiceClient: () => mockService,
}));

const reserveCredit = vi.fn();
const consumeReservation = vi.fn();
const refundReservation = vi.fn();
vi.mock("@/lib/credits", () => ({
  reserveCredit,
  consumeReservation,
  refundReservation,
}));

const analyzeResume = vi.fn();
const scoreResume = vi.fn();
vi.mock("@/lib/openai", () => ({ analyzeResume, scoreResume }));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDb: async () => true }));

function makeService() {
  mockService.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
        gte: async () => ({ count: 0, error: null }),
      }),
      gte: async () => ({ count: 0, error: null }),
    }),
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "job1" }, error: null }) }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
  }));
}

describe("analyze route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeService();
  });

  it("returns 402 on insufficient balance", async () => {
    reserveCredit.mockRejectedValue(new Error("insufficient_credits"));
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(402);
    expect(refundReservation).toHaveBeenCalledTimes(0);
  });

  it("refunds on AI failure", async () => {
    reserveCredit.mockResolvedValue({ reservationId: "res1", balance: 0, reserved: 1 });
    analyzeResume.mockRejectedValue(new Error("boom"));
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    expect(refundReservation).toHaveBeenCalledWith("res1");
  });

  it("refunds on malformed output", async () => {
    reserveCredit.mockResolvedValue({ reservationId: "res1", balance: 0, reserved: 1 });
    analyzeResume.mockResolvedValue("not json");
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    expect(refundReservation).toHaveBeenCalledWith("res1");
  });

  it("finalizes (consumes) on success", async () => {
    reserveCredit.mockResolvedValue({ reservationId: "res1", balance: 0, reserved: 1 });
    analyzeResume.mockResolvedValue(JSON.stringify(validResult));
    scoreResume.mockResolvedValue(88);
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.result.matchScore).toBe(80);
    expect(json.data.result.estimatedAfterScore).toBe(88);
    expect(json.data.result.unverifiedDetails).toContain("Jane Doe");
    expect(consumeReservation).toHaveBeenCalledWith("res1");
  });

  it("omits the after-score delta silently when scoring fails", async () => {
    reserveCredit.mockResolvedValue({ reservationId: "res1", balance: 0, reserved: 1 });
    analyzeResume.mockResolvedValue(JSON.stringify(validResult));
    scoreResume.mockRejectedValue(new Error("openai_http_error"));
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.result.estimatedAfterScore).toBeUndefined();
    expect(consumeReservation).toHaveBeenCalledWith("res1");
  });

  it("retries the rewrite once when more than 2 details are unverified", async () => {
    reserveCredit.mockResolvedValue({ reservationId: "res1", balance: 0, reserved: 1 });
    const fabricated = {
      ...validResult,
      rewrittenResume:
        "Jane polished things at Acme Rocket Labs, managing a $1,200 budget, growing 40% until 2029.",
    };
    const clean = {
      ...validResult,
      rewrittenResume: "Improved checkout flows using solid engineering habits.",
    };
    analyzeResume
      .mockResolvedValueOnce(JSON.stringify(fabricated))
      .mockResolvedValueOnce(JSON.stringify(clean));
    scoreResume.mockResolvedValue(75);

    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Two model attempts, single credit consumed.
    expect(analyzeResume).toHaveBeenCalledTimes(2);
    expect(consumeReservation).toHaveBeenCalledTimes(1);
    // Original result's rewrite replaced by the stricter one.
    expect(json.data.result.rewrittenResume).toBe(clean.rewrittenResume);
    // Retry prompt carries the forbidden details.
    const secondOptions = analyzeResume.mock.calls[1][2];
    expect(secondOptions.avoidDetails).toEqual(
      expect.arrayContaining(["Acme Rocket Labs"]),
    );
    // Clean rewrite has no unverified details left.
    expect(json.data.result.unverifiedDetails).toEqual([]);
  });

  it("handles concurrent requests: second fails insufficient", async () => {
    reserveCredit
      .mockResolvedValueOnce({ reservationId: "res1", balance: 0, reserved: 1 })
      .mockRejectedValueOnce(new Error("insufficient_credits"));
    analyzeResume.mockResolvedValue(JSON.stringify(validResult));
    const { POST } = await import("@/app/api/ai/analyze/route");

    const req1 = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j", idempotencyKey: "key-one-12345" }),
    });
    const req2 = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j", idempotencyKey: "key-two-67890" }),
    });

    const [r1, r2] = await Promise.all([POST(req1), POST(req2)]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(402);
  });
});