/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockService } = vi.hoisted(() => {
  const from = vi.fn();
  return { mockService: { from } };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
  createServiceClient: () => mockService,
}));

const capturePayPalOrder = vi.fn();
const getPayPalOrder = vi.fn();
vi.mock("@/lib/paypal", () => ({ capturePayPalOrder, getPayPalOrder }));

const grantCredits = vi.fn();
vi.mock("@/lib/credits", () => ({ grantCredits }));

function makeService(order: any) {
  mockService.from.mockImplementation((table: string) => {
    if (table === "paypal_orders") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: order, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { credit_balance: 10 }, error: null }) }) }),
      };
    }
    return {};
  });
}

describe("capture route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("duplicate capture returns idempotent", async () => {
    makeService({ user_id: "u1", paypal_order_id: "O1", status: "captured", amount_value: "1.00", currency: "USD", credits_to_grant: 10 });
    const { POST } = await import("@/app/api/paypal/orders/[id]/capture/route");
    const req = new Request("http://localhost/api/paypal/orders/O1/capture", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "O1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.idempotent).toBe(true);
    expect(capturePayPalOrder).toHaveBeenCalledTimes(0);
  });

  it("ORDER_ALREADY_CAPTURED path grants credits", async () => {
    makeService({ user_id: "u1", paypal_order_id: "O1", status: "created", amount_value: "1.00", currency: "USD", credits_to_grant: 10 });
    capturePayPalOrder.mockRejectedValue(new Error("ORDER_ALREADY_CAPTURED"));
    getPayPalOrder.mockResolvedValue({ status: "COMPLETED", captureId: "CAP1", amount: "1.00", currency: "USD", captureStatus: "COMPLETED" });
    grantCredits.mockResolvedValue({ granted: true, balance: 20 });
    const { POST } = await import("@/app/api/paypal/orders/[id]/capture/route");
    const req = new Request("http://localhost/api/paypal/orders/O1/capture", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "O1" }) });
    expect(res.status).toBe(200);
    expect(grantCredits).toHaveBeenCalled();
  });

  it("amount mismatch returns 400", async () => {
    makeService({ user_id: "u1", paypal_order_id: "O1", status: "created", amount_value: "1.00", currency: "USD", credits_to_grant: 10 });
    capturePayPalOrder.mockResolvedValue({ status: "COMPLETED", captureId: "CAP1", amount: "2.00", currency: "USD", captureStatus: "COMPLETED" });
    const { POST } = await import("@/app/api/paypal/orders/[id]/capture/route");
    const req = new Request("http://localhost/api/paypal/orders/O1/capture", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "O1" }) });
    expect(res.status).toBe(400);
  });
});