/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockService } = vi.hoisted(() => {
  const from = vi.fn();
  return { mockService: { from } };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => mockService,
}));

const verifyWebhookSignature = vi.fn();
vi.mock("@/lib/paypal", () => ({ verifyWebhookSignature }));

const grantCredits = vi.fn();
vi.mock("@/lib/credits", () => ({ grantCredits }));

function makeService(opts: { existing?: any; order?: any }) {
  mockService.from.mockImplementation((table: string) => {
    if (table === "paypal_webhook_events") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.existing ?? null, error: null }) }) }),
        insert: async () => ({ error: opts.existing ? new Error("dup") : null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === "paypal_orders") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.order ?? null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    return {};
  });
}

describe("webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyWebhookSignature.mockResolvedValue(true);
  });

  it("replay (processed) returns 200 without grant", async () => {
    makeService({ existing: { processed: true }, order: null });
    const { POST } = await import("@/app/api/paypal/webhook/route");
    const req = new Request("http://localhost/api/paypal/webhook", {
      method: "POST",
      headers: {
        "paypal-auth-algo": "a",
        "paypal-cert-url": "c",
        "paypal-transmission-id": "t",
        "paypal-transmission-sig": "s",
        "paypal-transmission-time": "x",
      },
      body: JSON.stringify({ id: "evt1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(grantCredits).toHaveBeenCalledTimes(0);
  });

  it("grant failure returns 500", async () => {
    makeService({ existing: null, order: { user_id: "u1", paypal_order_id: "O1", status: "created", amount_value: "1.00", currency: "USD", credits_to_grant: 10 } });
    grantCredits.mockRejectedValue(new Error("db fail"));
    const { POST } = await import("@/app/api/paypal/webhook/route");
    const req = new Request("http://localhost/api/paypal/webhook", {
      method: "POST",
      headers: {
        "paypal-auth-algo": "a",
        "paypal-cert-url": "c",
        "paypal-transmission-id": "t",
        "paypal-transmission-sig": "s",
        "paypal-transmission-time": "x",
      },
      body: JSON.stringify({
        id: "evt2",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP1",
          amount: { value: "1.00", currency_code: "USD" },
          supplementary_data: { related_ids: { order_id: "O1" } },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});