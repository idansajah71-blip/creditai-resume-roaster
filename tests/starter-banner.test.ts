/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { starterBannerStatus } from "@/lib/starter";

const { mockClient } = vi.hoisted(() => ({
  mockClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockClient,
}));

function userClient(
  rows: { amount: string | number; reference_type: string | null }[],
  user: string | null = "u1",
) {
  return {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from: vi.fn(() => {
      const api: any = {};
      api.select = () => api;
      api.eq = () => api;
      api.in = (_k: string, list: string[]) => {
        expect(list).toContain("signup_grant");
        return Promise.resolve({ data: rows, error: null });
      };
      return api;
    }),
  };
}

describe("starterBannerStatus (pure helper)", () => {
  it("active: only a signup grant on the ledger", () => {
    const s = starterBannerStatus([
      { amount: 3, reference_type: "signup_grant" },
    ]);
    expect(s).toEqual({ active: true, credits: 3 });
  });

  it("inactive: a purchase (capture or webhook grant) exists", () => {
    expect(
      starterBannerStatus([
        { amount: 3, reference_type: "signup_grant" },
        { amount: 10, reference_type: "paypal_capture" },
      ]),
    ).toEqual({ active: false, credits: 3 });
    expect(
      starterBannerStatus([
        { amount: 3, reference_type: "signup_grant" },
        { amount: 10, reference_type: "paypal_webhook" },
      ]),
    ).toEqual({ active: false, credits: 3 });
  });

  it("inactive: no signup grant at all (empty ledger or demo only)", () => {
    expect(starterBannerStatus([])).toEqual({ active: false, credits: 0 });
    expect(
      starterBannerStatus([{ amount: 5, reference_type: "demo_grant" }]),
    ).toEqual({ active: false, credits: 0 });
  });

  it("demo_grant rows never count toward signup credits", () => {
    const s = starterBannerStatus([
      { amount: 3, reference_type: "signup_grant" },
      { amount: 5, reference_type: "demo_grant" },
    ]);
    expect(s).toEqual({ active: true, credits: 3 });
  });
});

describe("GET /api/account/starter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function call(
    rows: { amount: string | number; reference_type: string | null }[],
    user: string | null = "u1",
  ) {
    mockClient.mockImplementation(async () => userClient(rows, user));
    const { GET } = await import("@/app/api/account/starter/route");
    return GET();
  }

  beforeEach(() => {
    mockClient.mockReset();
  });

  it("returns active with the signup amount when no purchase exists", async () => {
    const res = await call([{ amount: 3, reference_type: "signup_grant" }]);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { active: true, credits: 3 } });
  });

  it("returns inactive after any purchase", async () => {
    const res = await call([
      { amount: 3, reference_type: "signup_grant" },
      { amount: 10, reference_type: "paypal_capture" },
    ]);
    const json = await res.json();
    expect(json.data.active).toBe(false);
    // No ledger internals leak.
    expect(JSON.stringify(json)).not.toContain("paypal_capture");
  });

  it("returns 401 without a session", async () => {
    const res = await call([], null);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
