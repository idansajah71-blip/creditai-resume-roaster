/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { name: string; args: Record<string, unknown> };

const state = {
  rpcCalls: [] as Call[],
  knownAppRefunds: [] as string[], // refund ids the route has stored on refund_requests
  // refund_requests rows (dashboard-initiated refunds), used for the 15-min window check
  appRefundRequests: [] as {
    id: string;
    paypal_order_id: string;
    amount: string;
    status: string;
    created_at: string;
    updated_at: string | null;
  }[],
  appliedRefundIds: new Set<string>(), // emulates the ledger unique key 'whrefund:<id>'
  creditsDeducted: 0,
  rpcError: null as { message: string } | null, // forces apply_external_refund to fail
  processedUpdates: 0, // times an event was marked processed
};

const { mockService } = vi.hoisted(() => ({ mockService: { from: vi.fn(), rpc: vi.fn() } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceClient: () => mockService,
}));

const verifyWebhookSignature = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/paypal", () => ({ verifyWebhookSignature }));

function makeService() {
  mockService.from.mockImplementation((table: string) => {
    if (table === "paypal_webhook_events") {
      const api: any = {};
      api.select = () => api;
      api.eq = () => api;
      api.maybeSingle = () => Promise.resolve({ data: null, error: null });
      api.insert = () => Promise.resolve({ error: null });
      api.update = (patch: Record<string, unknown>) => ({
        eq: async (k: string, v: unknown) => {
          if (patch.processed === true) state.processedUpdates += 1;
          return { error: null, k, v };
        },
      });
      return api;
    }
    if (table === "refund_requests") {
      const api: any = { refundId: undefined, orderId: undefined };
      api.select = () => api;
      api.eq = (k: string, v: unknown) => {
        if (k === "paypal_refund_id") api.refundId = v;
        if (k === "paypal_order_id") api.orderId = v;
        return api;
      };
      api.maybeSingle = () =>
        Promise.resolve({
          data: api.refundId !== undefined && state.knownAppRefunds.includes(String(api.refundId)) ? { id: "rr-known" } : null,
          error: null,
        });
      api.in = (k: string, statuses: string[]) => {
        // status in (...) window query for dashboard refunds in flight (item 3)
        const rows = state.appRefundRequests.filter(
          (r) => r.paypal_order_id === api.orderId && statuses.includes(r.status),
        );
        return Promise.resolve({ data: rows, error: null });
      };
      return api;
    }
    return {};
  });

  mockService.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "apply_external_refund") {
      if (state.rpcError) {
        return { data: null, error: state.rpcError };
      }
      state.rpcCalls.push({ name, args });
      const refundId = String(args.p_refund_id);
      if (state.appliedRefundIds.has(refundId)) {
        return { data: 0, error: null }; // ledger key dedupe
      }
      state.appliedRefundIds.add(refundId);
      state.creditsDeducted += 5;
      return { data: 5, error: null };
    }
    return { data: null, error: null };
  });
}

function refundEvent(eventId: string, refundId: string) {
  return {
    id: eventId,
    event_type: "PAYMENT.CAPTURE.REFUNDED",
    resource: {
      id: refundId,
      amount: { value: "0.80", currency_code: "USD" },
      supplementary_data: { related_ids: { order_id: "ORD10" } },
    },
  };
}

describe("webhook PAYMENT.CAPTURE.REFUNDED", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rpcCalls = [];
    state.knownAppRefunds = [];
    state.appRefundRequests = [];
    state.appliedRefundIds = new Set();
    state.creditsDeducted = 0;
    state.rpcError = null;
    state.processedUpdates = 0;
    verifyWebhookSignature.mockResolvedValue(true);
    makeService();
  });

  async function post(event: unknown) {
    const { POST } = await import("@/app/api/paypal/webhook/route");
    const req = new Request("http://localhost/api/paypal/webhook", {
      method: "POST",
      body: JSON.stringify(event),
    });
    return POST(req);
  }

  it("external refund calls apply_external_refund and marks event processed", async () => {
    const res = await post(refundEvent("evt-1", "REFEXT1"));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].args).toMatchObject({
      p_paypal_order_id: "ORD10",
      p_refund_id: "REFEXT1",
      p_amount: 0.8,
      p_currency: "USD",
    });
  });

  it("duplicate refund id (different event id) applies only once", async () => {
    await post(refundEvent("evt-1", "REFEXT1"));
    await post(refundEvent("evt-2", "REFEXT1"));
    expect(state.rpcCalls).toHaveLength(2);
    expect(state.creditsDeducted).toBe(5); // second call returned 0 via ledger dedupe
  });

  it("app-initiated refund (known paypal_refund_id) is skipped", async () => {
    state.knownAppRefunds = ["REFAPP1"];
    await post(refundEvent("evt-1", "REFAPP1"));
    expect(state.rpcCalls).toHaveLength(0);
  });

  function minutesAgo(m: number) {
    return new Date(Date.now() - m * 60 * 1000).toISOString();
  }

  it("webhook arrives before paypal_refund_id is stored: no double deduction", async () => {
    // Dashboard refund exists (approved, fresh) but the route has not stored
    // the PayPal refund id yet -> the window check must catch it.
    state.appRefundRequests.push({
      id: "rr-1",
      paypal_order_id: "ORD10",
      amount: "0.80",
      status: "approved",
      created_at: minutesAgo(1),
      updated_at: null,
    });
    const res = await post(refundEvent("evt-1", "REFAPP-PENDING"));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.processedUpdates).toBe(1);
  });

  it("rpc error does not mark the event processed and returns 500", async () => {
    state.rpcError = { message: "db down" };
    const res = await post(refundEvent("evt-1", "REFEXT9"));
    expect(res.status).toBe(500);
    expect(state.processedUpdates).toBe(0);
  });

  it("dashboard-initiated refund deducts exactly once", async () => {
    // The app already deducted the credits when the dashboard refund was
    // reserved; the webhook (refund id stored) must not deduct again.
    state.creditsDeducted = 5;
    state.knownAppRefunds = ["REFAPP1"];
    state.appRefundRequests.push({
      id: "rr-2",
      paypal_order_id: "ORD10",
      amount: "0.80",
      status: "refunded",
      created_at: minutesAgo(2),
      updated_at: minutesAgo(1),
    });
    const res = await post(refundEvent("evt-1", "REFAPP1"));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.creditsDeducted).toBe(5);
  });

  it("same-order app row older than 15 minutes is not treated as handled", async () => {
    state.appRefundRequests.push({
      id: "rr-3",
      paypal_order_id: "ORD10",
      amount: "0.80",
      status: "refunded",
      created_at: minutesAgo(30),
      updated_at: minutesAgo(30),
    });
    const res = await post(refundEvent("evt-1", "REFEXT2"));
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("same-order recent row with a different amount is still applied externally", async () => {
    state.appRefundRequests.push({
      id: "rr-4",
      paypal_order_id: "ORD10",
      amount: "0.80",
      status: "approved",
      created_at: minutesAgo(1),
      updated_at: minutesAgo(1),
    });
    const ev = refundEvent("evt-1", "REFEXT3");
    ev.resource.amount.value = "0.10";
    const res = await post(ev);
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(1);
  });
});
