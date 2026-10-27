import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockService } = vi.hoisted(() => {
  const from = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { mockService: { from, rpc } };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
  createServiceClient: () => mockService,
}));

const reserveCredit = vi.fn().mockResolvedValue({ reservationId: "res1", balance: 0, reserved: 1 });
const consumeReservation = vi.fn();
const refundReservation = vi.fn();
vi.mock("@/lib/credits", () => ({ reserveCredit, consumeReservation, refundReservation }));

const analyzeResume = vi.fn().mockResolvedValue(JSON.stringify({
  matchScore: 80,
  roast: "roast",
  strengths: ["a", "b", "c"],
  weaknesses: ["1", "2", "3", "4", "5"],
  requirementMatches: [{ requirement: "Node.js", status: "met", evidence: "3 years" }],
  missingKeywords: ["AWS"],
  recommendations: [{ section: "Experience", advice: "add metrics" }],
  rewrittenResume: "Jane Doe ...",
}));
const scoreResume = vi.fn();
vi.mock("@/lib/openai", () => ({ analyzeResume, scoreResume }));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimitDb: async () => true }));

function makeService() {
  mockService.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), gte: async () => ({ count: 0, error: null }) }),
      gte: async () => ({ count: 0, error: null }),
    }),
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "job1" }, error: null }) }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
  }));
}

describe("stale reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeService();
  });

  it("calls release_stale_reservations on analyze", async () => {
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    await POST(req);
    expect(mockService.rpc).toHaveBeenCalledWith("release_stale_reservations", expect.any(Object));
  });
});