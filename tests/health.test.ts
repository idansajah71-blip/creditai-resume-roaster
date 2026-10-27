import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockService, paypalToken } = vi.hoisted(() => {
  const select = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ data: [{ id: "p1" }], error: null }),
  });
  const mockService = { from: vi.fn().mockReturnValue({ select }) };
  const paypalToken = vi.fn().mockResolvedValue("token");
  return { mockService, paypalToken };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => mockService,
}));

vi.mock("@/lib/paypal", () => ({
  getAccessToken: paypalToken,
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    // Credentials present by default: the paypal check performs a real
    // (mocked) token fetch in these tests.
    process.env.PAYPAL_CLIENT_ID = "client";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    paypalToken.mockReset().mockResolvedValue("token");
  });

  afterEach(() => {
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  });

  it("returns boolean checks, aggregates ok, and serves from the 30s cache", async () => {
    const { GET } = await import("@/app/api/health/route");

    // First call runs the checks.
    const res1 = await GET();
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(Object.keys(json1)).toEqual(["ok", "checks"]);
    expect(json1.checks).toEqual({
      database: true,
      paypal: true,
      openai_configured: false,
      webhook_configured: false,
    });
    // Booleans only.
    for (const v of Object.values(json1.checks)) expect(typeof v).toBe("boolean");
    expect(json1.ok).toBe(false); // config checks false in test env
    expect(JSON.stringify(json1)).not.toMatch(/token|secret|error/i);

    // Second call within the cache window is served from cache even if the
    // underlying dependency now fails.
    paypalToken.mockRejectedValue(new Error("paypal_token_failed"));
    const res2 = await GET();
    const json2 = await res2.json();
    expect(json2.checks.paypal).toBe(true);
    // Only one real OAuth fetch so far.
    expect(paypalToken).toHaveBeenCalledTimes(1);
  });

  it("reports paypal:false with a short reason when credentials are missing", async () => {
    // Fresh module instance so the 30s cache from the first test is not reused.
    vi.resetModules();
    delete process.env.PAYPAL_CLIENT_ID;
    process.env.PAYPAL_CLIENT_SECRET = "super-secret-value"; // present, must never be logged

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const json = await res.json();
    expect(json.checks.paypal).toBe(false);
    expect(json.paypal_reason).toContain("PAYPAL_CLIENT_ID");
    // Reason states the env names only; the value must never appear.
    expect(JSON.stringify(json)).not.toContain("super-secret-value");
    // No doomed OAuth fetch is attempted.
    expect(paypalToken).not.toHaveBeenCalled();
  });
});
