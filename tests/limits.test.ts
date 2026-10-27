import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockService } = vi.hoisted(() => {
  return { mockService: { from: vi.fn(), auth: { admin: { createUser: vi.fn() } } } };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
  createServiceClient: () => mockService,
}));

const analyzeResume = vi.fn();
vi.mock("@/lib/openai", () => ({ analyzeResume }));

const reserveCredit = vi.fn();
const consumeReservation = vi.fn();
const refundReservation = vi.fn();
const grantCredits = vi.fn();
vi.mock("@/lib/credits", () => ({ reserveCredit, consumeReservation, refundReservation, grantCredits }));

const createPayPalOrder = vi.fn();
const getApprovalUrl = vi.fn();
vi.mock("@/lib/paypal", () => ({ createPayPalOrder, getApprovalUrl }));

// Returns a from(table) mock where .gte() calls resolve counts from a shared
// queue (in call order) across all from() invocations.
function makeService(gteCounts: number[], eqCount?: number) {
  let gteIdx = 0;
  const gte = () => {
    const c = gteCounts[gteIdx] ?? 0;
    gteIdx++;
    return Promise.resolve({ count: c, error: null });
  };
  mockService.from.mockImplementation((table: string) => {
    const select = () => ({
      eq: () => ({ gte }),
      gte,
    });
    if (table === "ai_jobs") {
      return { select, rpc: async () => ({ error: null }) };
    }
    if (table === "paypal_orders") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            gte: () => Promise.resolve({ count: eqCount ?? 0, error: null }),
          }),
        }),
      };
    }
    if (table === "demo_sessions") {
      return { select: () => ({ eq: () => ({ gte }), gte }), insert: async () => ({ error: null }) };
    }
    return {};
  });
}

describe("cost protection limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_DAILY_LIMIT_PER_USER = "20";
    process.env.AI_GLOBAL_DAILY_LIMIT = "500";
    process.env.PAYPAL_MAX_ORDERS_PER_DAY = "10";
    process.env.DEMO_SESSIONS_DAILY_LIMIT = "200";
  });

  it("analyze returns 429 when per-user daily cap reached", async () => {
    makeService([20]);
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(reserveCredit).not.toHaveBeenCalled();
  });

  it("analyze returns 503 when global daily cap reached", async () => {
    makeService([0, 500]);
    const { POST } = await import("@/app/api/ai/analyze/route");
    const req = new Request("http://localhost/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ resumeText: "r", jobDescription: "j" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(reserveCredit).not.toHaveBeenCalled();
  });

  it("paypal orders returns 429 when order cap reached", async () => {
    makeService([], 10);
    const { POST } = await import("@/app/api/paypal/orders/route");
    const req = new Request("http://localhost/api/paypal/orders", {
      method: "POST",
      body: JSON.stringify({ packageId: "credits_10" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });

  it("demo session returns 429 when per-IP hourly cap reached", async () => {
    makeService([3]);
    const { POST } = await import("@/app/api/demo/session/route");
    const req = new Request("http://localhost/api/demo/session", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(mockService.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("demo session returns 503 when global daily cap reached", async () => {
    makeService([0, 200]);
    const { POST } = await import("@/app/api/demo/session/route");
    const req = new Request("http://localhost/api/demo/session", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(mockService.auth.admin.createUser).not.toHaveBeenCalled();
  });
});
