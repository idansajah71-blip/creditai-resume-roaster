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
  currentUser: "u1",
  orders: [] as Order[],
  refundRequests: [] as { id: string; [k: string]: unknown }[],
  balance: 8,
  recentRefunds: 0,
};

function resetDb() {
  db.currentUser = "u1";
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

const { mockService, rpcApply, queryProbe } = vi.hoisted(() => {
  const rpcApply = vi.fn();
  const queryProbe = {
    inCalls: [] as string[][],
    likePatterns: [] as string[],
    gteCalls: [] as { table: string; column: string; value: string }[],
  };
  return { mockService: { from: vi.fn(), rpc: rpcApply }, rpcApply, queryProbe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: db.currentUser } } }) },
  }),
  createServiceClient: () => mockService,
}));

const refundAssistantMessage = vi.fn();
vi.mock("@/lib/refund-agent", () => ({ refundAssistantMessage, REFUND_FALLBACK_MESSAGE: "Fixed fallback message." }));

const refundCapture = vi.fn();
vi.mock("@/lib/paypal", () => ({ refundCapture }));

function makeService() {
  let rrSeq = 0;
  mockService.from.mockImplementation((table: string) => {
    if (table === "paypal_orders") {
      const api: any = { userId: null, status: null, since: null };
      api.select = () => api;
      api.eq = (k: string, v: unknown) => {
        if (k === "user_id") api.userId = v;
        if (k === "status") api.status = v;
        return api;
      };
      api.gte = (k: string, v: string) => {
        api.since = new Date(v).getTime();
        queryProbe.gteCalls.push({ table, column: k, value: v });
        return api;
      };
      api.order = () => {
        const rows = db.orders
          .filter((o) => (api.userId ? o.user_id === api.userId : true))
          .filter((o) => (api.status ? o.status === api.status : true))
          .filter((o) => (api.since !== null ? new Date(o.created_at).getTime() >= api.since : true));
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
          data: api.userId === db.currentUser ? { credit_balance: db.balance } : null,
          error: null,
        });
      return api;
    }
    if (table === "refund_requests") {
      const api: any = { userId: null, inList: null, byRefundId: undefined };
      api.select = () => api;
      api.eq = (k: string, v: unknown) => {
        if (k === "paypal_refund_id") api.byRefundId = v;
        if (k === "user_id") api.userId = v;
        return api;
      };
      api.in = (k: string, list: string[]) => {
        if (k === "idempotency_key") {
          api.inList = list;
          queryProbe.inCalls.push(list);
        }
        return api;
      };
      api.gte = () => Promise.resolve({ count: db.recentRefunds, error: null });
      api.like = (k: string, pattern: string) => {
        queryProbe.likePatterns.push(pattern);
        return api;
      };
      api.order = () => {
        const rowsFor = () => {
          if (api.inList) {
            // Exact-in lookup, scoped to the requesting user (item 2 semantics).
            return db.refundRequests
              .filter((r) => r.user_id === api.userId && api.inList.includes(String(r.idempotency_key)))
              .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
          }
          if (api.byRefundId !== undefined) {
            return db.refundRequests.filter((r) => r.paypal_refund_id === api.byRefundId);
          }
          return db.refundRequests;
        };
        // Thenable: supports BOTH `await ...order()` and `...order().limit(n)`.
        const w: any = {
          limit: (n: number) => Promise.resolve({ data: rowsFor().slice(0, n), error: null }),
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve({ data: rowsFor(), error: null }).then(res, rej),
          catch: (rej: (e: unknown) => unknown) => Promise.resolve({ data: rowsFor(), error: null }).catch(rej),
        };
        return w;
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
    queryProbe.inCalls = [];
    queryProbe.likePatterns = [];
    queryProbe.gteCalls = [];
    makeService();
  });

  const TEST_KEY = "5f6c7d8e-1a2b-4c3d-8e9f-aabbccddeeff"; // valid UUID (server accepts it as-is)
  async function post(credits: number, reason: string, key = TEST_KEY) {
    const { POST } = await import("@/app/api/paypal/refunds/route");
    const req = new Request("http://localhost/api/paypal/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ credits, reason }),
    });
    return POST(req);
  }

  it("happy path: approve, reserve, refund via PayPal", async () => {
    refundAssistantMessage.mockResolvedValue("Sure, reasonable request.");
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
    const row = db.refundRequests.find((r) => r.idempotency_key === `u1:${TEST_KEY}:0`);
    expect(row?.status).toBe("refunded");
    expect(row?.paypal_refund_id).toBe("REF1");
  });

  it("ineligible request denies without calling the AI", async () => {
    const res = await post(100, "Please refund everything right now please.");
    const json = await res.json();
    expect(json.data.status).toBe("denied");
    expect(refundAssistantMessage).not.toHaveBeenCalled();
    expect(refundCapture).not.toHaveBeenCalled();
    expect(db.refundRequests).toHaveLength(0);
  });

  it("model failure falls back to a fixed message and still refunds", async () => {
    refundAssistantMessage.mockRejectedValue(new Error("openai_http_error"));
    refundCapture.mockResolvedValue({ id: "REF9", status: "COMPLETED" });

    const res = await post(3, "Account issue, please refund my unused credits.");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("refunded");
    // The fixed fallback message, not a thrown error, reaches the customer.
    expect(json.data.message).toBe("Fixed fallback message.");
    expect(refundCapture).toHaveBeenCalledTimes(1);
    const row = db.refundRequests.find((r) => r.paypal_refund_id === "REF9");
    expect(row?.status).toBe("refunded");
    expect(row?.amount).toBe("0.30");
  });

  it("PayPal failure triggers compensation and marks failed", async () => {
    refundAssistantMessage.mockResolvedValue("Approved.");
    refundCapture.mockRejectedValue(new Error("paypal_refund_failed"));

    const res = await post(4, "Server issue, please return my unused credits.");
    expect(res.status).toBe(502);
    // Compensation restored credits and counters.
    expect(db.balance).toBe(8);
    expect(db.orders[0].refunded_credits).toBe(0);
    expect(db.orders[0].refunded_amount).toBe(0);
    const row = db.refundRequests.find((r) => String(r.idempotency_key).startsWith(`u1:${TEST_KEY}:`));
    expect(row?.status).toBe("failed");
  });

  it("duplicate idempotency key replays the stored outcome", async () => {
    db.refundRequests.push({
      id: "rr-1",
      user_id: "u1",
      idempotency_key: `u1:${TEST_KEY}:0`,
      paypal_order_id: "ORD10",
      credits: 8,
      amount: "0.80",
      currency: "USD",
      status: "refunded",
      ai_decision: { message: "Sure, reasonable request." },
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
    expect(refundAssistantMessage).not.toHaveBeenCalled();
  });

  it('header "%" never matches other users rows (no LIKE, exact-in)', async () => {
    // Another user's stored segment uses a wildcard-looking key.
    db.refundRequests.push({
      id: "rr-other",
      user_id: "u2",
      idempotency_key: "u2:%:0",
      paypal_order_id: "ORD10",
      credits: 5,
      amount: "0.50",
      currency: "USD",
      status: "refunded",
      ai_decision: { message: "ok" },
      created_at: new Date().toISOString(),
      paypal_refund_id: "REF-OTHER",
    });

    const res = await post(9, "Please refund nine credits from today.", "%");
    // Not served from another user's replay: route proceeds with its own flow.
    const json = await res.json();
    expect(json.data.idempotent).toBeUndefined();
    expect(json.data.status).toBe("denied"); // 9 > refundable/balance cap? 9 <= 8 balance? -> denied deterministic
    expect(refundAssistantMessage).not.toHaveBeenCalled();
    // Stored rows untouched; the route never re-used the wildcard key.
    expect(db.refundRequests.filter((r) => r.user_id === "u2")).toHaveLength(1);
    expect(db.refundRequests.filter((r) => r.user_id === "u1")).toHaveLength(0);
    // No LIKE query was issued for the replay lookup.
    expect(queryProbe.likePatterns).toHaveLength(0);
  });

  it("two users sending the same header never collide", async () => {
    refundAssistantMessage.mockResolvedValue("Approved.");
    refundCapture.mockResolvedValue({ id: "REF1", status: "COMPLETED" });
    const shared = "1f0a1421-9a2b-4a3c-8d24-5f6c7d8e9f01";

    // User 1 refunds 8 credits.
    const res1 = await post(8, "I only used 2 of the 10 credits from yesterday.", shared);
    expect(res1.status).toBe(200);
    // Switch to user 2 with their own fresh order/space.
    db.currentUser = "u2";
    db.balance = 10;
    db.orders.push({
      user_id: "u2",
      paypal_order_id: "ORD20",
      capture_id: "CAP20",
      amount_value: "1.00",
      currency: "USD",
      credits_to_grant: 10,
      refunded_credits: 0,
      refunded_amount: 0,
      status: "captured",
      created_at: new Date().toISOString(),
    });
    const res2 = await post(8, "I only used 2 of the 10 credits from yesterday.", shared);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.data.idempotent).toBeUndefined(); // u2 gets its own processing

    // Namespaced keys keep the two users' rows distinct.
    const keys = db.refundRequests.map((r) => r.idempotency_key);
    expect(keys).toContain("u1:1f0a1421-9a2b-4a3c-8d24-5f6c7d8e9f01:0");
    expect(keys).toContain("u2:1f0a1421-9a2b-4a3c-8d24-5f6c7d8e9f01:0");
    expect(refundCapture).toHaveBeenCalledTimes(2);
  });

  it("replay lookup uses exact candidate keys scoped to the user (no LIKE)", async () => {
    refundAssistantMessage.mockResolvedValue("Approved.");
    refundCapture.mockResolvedValue({ id: "REF1", status: "COMPLETED" });
    const key = "2f0a1421-9a2b-4a3c-8d24-5f6c7d8e9f02";
    await post(8, "I only used 2 of the 10 credits from yesterday.", key);

    refundAssistantMessage.mockClear();
    const res = await post(8, "I only used 2 of the 10 credits from yesterday.", key);
    const json = await res.json();
    expect(json.data.status).toBe("refunded");
    expect(json.data.idempotent).toBe(true);
    expect(refundAssistantMessage).not.toHaveBeenCalled();
    expect(refundCapture).toHaveBeenCalledTimes(1); // no second PayPal call

    // The lookup was an exact candidate list for THIS user (namespaced keys),
    // and LIKE was never used anywhere in the flow.
    const replayCall = queryProbe.inCalls.find((c) =>
      c.some((k) => k.startsWith(`u1:${key}:0`)),
    );
    expect(replayCall).toBeTruthy();
    expect(replayCall!.every((k) => k.startsWith(`u1:${key}:`))).toBe(true);
    expect(queryProbe.likePatterns).toHaveLength(0);
  });

  it("POST ignores captured orders older than 14 days (reserve window)", async () => {
    // Replace the 2-day-old order with one that is 20 days old.
    db.orders[0].created_at = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

    const res = await post(5, "Please refund five unused credits today.");
    const json = await res.json();
    // The elided order removes the refundable pool, so the route denies
    // deterministically without calling the AI.
    expect(json.data.status).toBe("denied");
    expect(json.message).toContain("Only 0 unused credits are refundable");
    expect(refundAssistantMessage).not.toHaveBeenCalled();

    // Both eligibility queries filter created_at by the same 14-day window.
    const order14 = queryProbe.gteCalls.filter((c) => c.table === "paypal_orders");
    expect(order14).toHaveLength(1);
    expect(order14[0].column).toBe("created_at");
    expect(Date.now() - new Date(order14[0].value).getTime()).toBeCloseTo(14 * 24 * 60 * 60 * 1000, -3);
  });

  it("GET never offers refunds for orders older than 14 days", async () => {
    db.orders[0].created_at = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

    const { GET } = await import("@/app/api/paypal/refunds/route");
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.refundableCredits).toBe(0);
    expect(json.data.refundableAmount).toBe("0.00");
    expect(queryProbe.gteCalls.some((c) => c.table === "paypal_orders")).toBe(true);
  });
});
