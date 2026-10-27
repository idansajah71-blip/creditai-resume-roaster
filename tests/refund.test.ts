/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Order = {
  user_id: string;
  paypal_order_id: string;
  capture_id: string | null;
  amount_value: string;
  currency: string;
  credits_to_grant: number;
  refunded_credits: number;
  refunded_amount: number;
  status: string;
  created_at: string;
};

const db = {
  orders: [] as Order[],
  refundRequests: [] as { id: string; [k: string]: unknown }[],
  balance: 8,
  recentRefunds: 0,
};

function resetDb() {
  db.orders = [
    {
      user_id: "u1",
      paypal_order_id: "ORD10",
      capture_id: "CAP10",
      amount_value: "1.00",
      currency: "USD",
      credits_to_grant: 10,
      refunded_credits: 0,
      refunded_amount: 0,
      status: "captured",
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
  db.refundRequests = [];
  db.balance = 8;
  db.recentRefunds = 0;
}

const { mockService, rpcApply } = vi.hoisted(() => {
  const rpcApply = vi.fn();
  return { mockService: { from: vi.fn(), rpc: rpcApply }, rpcApply };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
  createServiceClient: () => mockService,
}));

const decideRefund = vi.fn();
vi.mock("@/lib/refund-agent", () => ({ decideRefund }));

const refundCapture = vi.fn();
vi.mock("@/lib/paypal", () => ({ refundCapture }));

function makeService() {
  let rrSeq = 0;
  mockService.from.mockImplementation((table: string) => {
    if (table === "paypal_orders") {
      const api: any = { userId: null, status: null };
      api.select = () => api;
      api.eq = (k: string, v: unknown) => {
        if (k === "user_id") api.userId = v;
        if (k === "status") api.status = v;
        return api;
      };
      api.order = (_c: string, _o: unknown) => {
        const rows = db.orders
          .filter((o) => (api.userId ? o.user_id === api.userId : true))
          .filter((o) => (api.status ? o.status === api.status : true));
        return Promise.resolve({ data: rows, error: null });
      };
      return api;
    }
    if (table === "profiles") {
      const api: any = { userId: null };
      api.select = () => api;
      api.eq = (_k: string, v: unknown) => {
        api.userId = v;
        return api;
      };
      api.single = () =>
        Promise.resolve({
          data: api.userId === "u1" ? { credit_balance: db.balance } : null,
          error: null,
        });
      return api;
    }
    if (table === "refund_requests") {
      const api: any = { like: null, count: null };
      api.select = () => api;
      api.eq = (k: string, v: unknown) => {
        if (k === "paypal_refund_id") api.byRefundId = v;
        return api;
      };
      api.gte = () => Promise.resolve({ count: db.recentRefunds, error: null });
      api.like = (k: string, v: string) => {
        api.like = v;
        return api;
      };
      api.order = () => {
        if (api.like) {
          const prefix = api.like.replace(/%$/, "");
          const rows = db.refundRequests
            .filter((r) => String(r.idempotency_key).startsWith(prefix))
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
          return Promise.resolve({ data: rows, error: null });
        }
        if (api.byRefundId !== undefined) {
          const matched = db.refundRequests.filter((r) => r.paypal_refund_id === api.byRefundId);
          return Promise.resolve({
            data: matched[0] ?? null,
            error: null,
          });
        }
        return Promise.resolve({ data: db.refundRequests, error: null });
      };
      api.maybeSingle = () =>
        Promise.resolve({ data: db.refundRequests.find((r) => r.paypal_refund_id === api.byRefundId) ?? null, error: null });
      api.insert = (values: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            const row = { id: `rr-${++rrSeq}`, created_at: new Date().toISOString(), ...values };
            db.refundRequests.push(row);
            return Promise.resolve({ data: row, error: null });
          },
        }),
      });
      api.update = (patch: Record<string, unknown>) => ({
        eq: (_k: string, v: string) => {
          const row = db.refundRequests.find((r) => r.id === v);
          if (row) Object.assign(row, patch);
          return Promise.resolve({ data: null, error: null });
        },
      });
      return api;
    }
    return {};
  });

  // Emulates reserve_purchase_refund / revert_purchase_refund SQL behavior.
  mockService.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "reserve_purchase_refund") {
      const order = db.orders.find((o) => o.paypal_order_id === args.p_paypal_order_id);
      if (!order) return { data: null, error: { message: "order_not_found" } };
      const credits = Number(args.p_credits);
      const key = String(args.p_idempotency);
      if (db.refundRequests.some((r) => r.idempotency_key === key && r.status === "refunded")) {
        return { data: null, error: { message: "duplicate" } };
      }
      const remainingCredits = order.credits_to_grant - order.refunded_credits;
      if (order.status !== "captured" || credits > remainingCredits || credits > db.balance) {
        return { data: null, error: { message: "ineligible" } };
      }
      const unitCents = Math.round(Number(order.amount_value) * 100 / order.credits_to_grant);
      const cashLeft = Math.round(Number(order.amount_value) * 100) - Math.round(Number(order.refunded_amount) * 100);
      const amountCents = Math.min(unitCents * credits, cashLeft);
      db.balance -= credits;
      order.refunded_credits += credits;
      order.refunded_amount += amountCents / 100;
      return {
        data: [{ amount: (amountCents / 100).toFixed(2), balance: db.balance }],
        error: null,
      };
    }
    if (name === "revert_purchase_refund") {
      const row = db.refundRequests.find((r) => r.id === args.p_refund_request_id);
      if (!row) return { data: null, error: { message: "not_found" } };
      if (row.status === "pending" || row.status === "approved") {
        const order = db.orders.find((o) => o.paypal_order_id === row.paypal_order_id);
        db.balance += Number(row.credits);
        if (order) {
          order.refunded_credits -= Number(row.credits);
          order.refunded_amount -= Number(row.amount);
        }
      }
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

describe("refund math", () => {
  it("computes per-credit amounts without float drift", async () => {
    const m = await import("@/lib/refund-math");
    const o = { paypal_order_id: "A", capture_id: "C", amount_value: "7.00", currency: "USD", credits_to_grant: 100, refunded_credits: 0, refunded_amount: 0 };
    expect(m.unitCents(o)).toBe(7);
    expect(m.refundAmountCents(o, 8)).toBe(56);
    expect(m.fromCents(56)).toBe("0.56");
  });

  it("caps the refund at the cash left in the order", async () => {
    const m = await import("@/lib/refund-math");
    const o = { paypal_order_id: "A", capture_id: "C", amount_value: "1.00", currency: "USD", credits_to_grant: 10, refunded_credits: 9, refunded_amount: "0.90" };
    expect(m.refundAmountCents(o, 5)).toBe(10); // only 0.10 cash left
  });

  it("allocateRefund spans orders newest first and caps by balance", async () => {
    const m = await import("@/lib/refund-math");
    const a = { paypal_order_id: "A", capture_id: "C", amount_value: "1.00", currency: "USD", credits_to_grant: 10, refunded_credits: 0, refunded_amount: 0, created_at: "2026-01-02" };
    const b = { paypal_order_id: "B", capture_id: "D", amount_value: "7.00", currency: "USD", credits_to_grant: 100, refunded_credits: 0, refunded_amount: 0, created_at: "2026-01-01" };
    const segs = m.allocateRefund([a, b], 15, 20);
    expect(segs).not.toBeNull();
    expect(segs![0].order.paypal_order_id).toBe("A");
    expect(segs![0].credits).toBe(10);
    expect(segs![1].credits).toBe(5);
    expect(m.allocateRefund([a], 15, 20)).toBeNull(); // not enough refundable
    expect(m.allocateRefund([a], 8, 5)).toBeNull(); // balance too low
  });
});

describe("refund route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDb();
    makeService();
  });

  async function post(credits: number, reason: string, key = "req-key-1234") {
    const { POST } = await import("@/app/api/paypal/refunds/route");
    const req = new Request("http://localhost/api/paypal/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ credits, reason }),
    });
    return POST(req);
  }

  it("happy path: approve, reserve, refund via PayPal", async () => {
    decideRefund.mockResolvedValue({ decision: "approve", message: "Sure, reasonable request." });
    refundCapture.mockResolvedValue({ id: "REF1", status: "COMPLETED" });

    const res = await post(8, "I only used 2 of the 10 credits from yesterday.");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("refunded");
    expect(json.data.credits).toBe(8);
    expect(json.data.amount).toBe("0.80");
    expect(refundCapture).toHaveBeenCalledWith(
      "CAP10",
      "0.80",
      "USD",
      expect.any(String),
      expect.stringContaining("8"),
    );
    expect(db.balance).toBe(0);
    expect(db.orders[0].refunded_credits).toBe(8);
    const row = db.refundRequests.find((r) => r.idempotency_key === "req-key-1234:0");
    expect(row?.status).toBe("refunded");
    expect(row?.paypal_refund_id).toBe("REF1");
  });

  it("ineligible request denies without calling the AI", async () => {
    const res = await post(100, "Please refund everything right now please.");
    const json = await res.json();
    expect(json.data.status).toBe("denied");
    expect(decideRefund).not.toHaveBeenCalled();
    expect(refundCapture).not.toHaveBeenCalled();
    expect(db.refundRequests).toHaveLength(0);
  });

  it("AI deny blocks the refund", async () => {
    decideRefund.mockResolvedValue({ decision: "deny", message: "Request looks inconsistent with usage." });
    const res = await post(5, "I changed my mind about these credits please.");
    const json = await res.json();
    expect(json.data.status).toBe("denied");
    expect(json.data.message).toContain("inconsistent");
    expect(refundCapture).not.toHaveBeenCalled();
    expect(db.refundRequests).toHaveLength(0);
  });

  it("PayPal failure triggers compensation and marks failed", async () => {
    decideRefund.mockResolvedValue({ decision: "approve", message: "Approved." });
    refundCapture.mockRejectedValue(new Error("paypal_refund_failed"));

    const res = await post(4, "Server issue, please return my unused credits.");
    expect(res.status).toBe(502);
    // Compensation restored credits and counters.
    expect(db.balance).toBe(8);
    expect(db.orders[0].refunded_credits).toBe(0);
    expect(db.orders[0].refunded_amount).toBe(0);
    const row = db.refundRequests.find((r) => String(r.idempotency_key).startsWith("req-key-1234"));
    expect(row?.status).toBe("failed");
  });

  it("duplicate idempotency key replays the stored outcome", async () => {
    db.refundRequests.push({
      id: "rr-1",
      idempotency_key: "req-key-1234:0",
      paypal_order_id: "ORD10",
      credits: 8,
      amount: "0.80",
      currency: "USD",
      status: "refunded",
      ai_decision: { decision: "approve", message: "Sure, reasonable request." },
      created_at: new Date().toISOString(),
      paypal_refund_id: "REF1",
    });
    const res = await post(8, "I only used 2 of the 10 credits from yesterday.");
    const json = await res.json();
    expect(json.data.status).toBe("refunded");
    expect(json.data.idempotent).toBe(true);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("rate limit: max 3 refund requests per 30 days", async () => {
    db.recentRefunds = 3;
    const res = await post(2, "Another small refund request for credits.");
    expect(res.status).toBe(429);
    expect(decideRefund).not.toHaveBeenCalled();
  });
});
