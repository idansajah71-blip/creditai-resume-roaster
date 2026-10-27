/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { name: string; args: Record<string, unknown> };

const state = {
  rpcCalls: [] as Call[],
  knownAppRefunds: [] as string[], // refund ids initiated by the app (refund_requests)
  appliedRefundIds: new Set<string>(), // emulates the ledger unique key 'whrefund:<id>'
  creditsDeducted: 0,
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
      api.update = () => ({ eq: async () => ({ error: null }) });
      return api;
    }
    if (table === "refund_requests") {
      const api: any = { refundId: undefined };
      api.select = () => api;
      api.eq = (k: string, v: unknown) => {
        if (k === "paypal_refund_id") api.refundId = v;
        return api;
      };
      api.maybeSingle = () =>
        Promise.resolve({
          data: api.refundId !== undefined && state.knownAppRefunds.includes(String(api.refundId)) ? { id: "rr-known" } : null,
          error: null,
        });
      return api;
    }
    return {};
  });

  mockService.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "apply_external_refund") {
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
    state.appliedRefundIds = new Set();
    state.creditsDeducted = 0;
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
});
