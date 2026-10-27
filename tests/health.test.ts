import { describe, it, expect, vi } from "vitest";

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
  it("returns boolean checks, aggregates ok, and serves from the 30s cache", async () => {
    const { GET } = await import("@/app/api/health/route");

    // First call runs the checks. In the test env the config envs are absent.
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
});
