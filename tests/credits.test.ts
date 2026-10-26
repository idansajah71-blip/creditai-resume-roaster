import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: mockRpc }),
  createClient: vi.fn(),
}));

describe("grantCredits", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("returns granted true on first grant", async () => {
    mockRpc.mockResolvedValue({ data: [{ granted: true, balance: 10 }], error: null });
    const { grantCredits } = await import("@/lib/credits");
    const res = await grantCredits("user1", 10, "cap-1", "paypal_capture", "cap-1");
    expect(res.granted).toBe(true);
    expect(res.balance).toBe(10);
  });

  it("returns granted false on duplicate (idempotent)", async () => {
    mockRpc.mockResolvedValue({ data: [{ granted: false, balance: 10 }], error: null });
    const { grantCredits } = await import("@/lib/credits");
    const res = await grantCredits("user1", 10, "cap-1", "paypal_capture", "cap-1");
    expect(res.granted).toBe(false);
    expect(res.balance).toBe(10);
  });

  it("throws on rpc error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("db fail") });
    const { grantCredits } = await import("@/lib/credits");
    await expect(grantCredits("user1", 10, "cap-2", "paypal_capture", "cap-2")).rejects.toThrow();
  });
});