/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockService, mockUserClient, createPayPalOrder, getApprovalUrl, consoleSpy } = vi.hoisted(() => ({
  mockService: { from: vi.fn() },
  mockUserClient: vi.fn(),
  createPayPalOrder: vi.fn(),
  getApprovalUrl: vi.fn(),
  consoleSpy: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockUserClient,
  createServiceClient: () => mockService,
}));

vi.mock("@/lib/paypal", () => ({
  createPayPalOrder,
  getApprovalUrl,
}));

function makeService(gteCount = 0) {
  mockService.from.mockImplementation(() => {
    const api: any = {};
    api.select = () => api;
    api.eq = () => api;
    api.maybeSingle = () => Promise.resolve({ data: null, error: null });
    api.gte = () => Promise.resolve({ count: gteCount, error: null });
    api.insert = () => Promise.resolve({ error: null });
    return api;
  });
}

describe("POST /api/paypal/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeService(0);
    mockUserClient.mockImplementation(async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    }));
    consoleSpy.mockReset();
    vi.spyOn(console, "error").mockImplementation(consoleSpy as unknown as () => void);
    process.env.PAYPAL_CLIENT_ID = "client-id";
    process.env.PAYPAL_CLIENT_SECRET = "super-secret-value";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function post() {
    const { POST } = await import("@/app/api/paypal/orders/route");
    const req = new Request("http://localhost/api/paypal/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId: "credits_10" }),
    });
    return POST(req);
  }

  it("happy path creates the order", async () => {
    createPayPalOrder.mockResolvedValue({ id: "ORDER1", approvalUrl: "https://approve" });
    const res = await post();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(createPayPalOrder).toHaveBeenCalledTimes(1);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns 'PayPal is not configured correctly' when credentials are missing", async () => {
    // ID missing; keep a SECRET value around to prove values are never logged.
    delete process.env.PAYPAL_CLIENT_ID;
    const res = await post();
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.message).toBe("PayPal is not configured correctly");
    expect(createPayPalOrder).not.toHaveBeenCalled();
    // The log names the env vars but never logs the secret value.
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleSpy.mock.calls[0][0])).toContain("PAYPAL_CLIENT_ID");
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("super-secret-value");
  });

  it("logs the underlying error and returns 'paypal create failed' otherwise", async () => {
    createPayPalOrder.mockRejectedValue(new Error("paypal_timeout"));
    const res = await post();
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.message).toBe("paypal create failed");
    expect(consoleSpy).toHaveBeenCalledWith("paypal create failed", "paypal_timeout");
    // No credentials or tokens in the log.
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("super-secret-value");
  });
});
