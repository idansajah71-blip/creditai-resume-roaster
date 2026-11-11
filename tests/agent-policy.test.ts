/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AGENT_MAX_ACTIONS_PER_DAY_DEFAULT,
  AGENT_MAX_USD_CAP,
  AGENT_READ_ONLY_TOOLS,
  AGENT_REASONS,
  AGENT_TOOLS,
  evaluateAction,
  type AgentMandate,
} from "@/lib/agent-policy";

const { mockService, mockUser } = vi.hoisted(() => ({
  mockService: { from: vi.fn(), rpc: vi.fn() },
  mockUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser() } }) },
  }),
  createServiceClient: () => mockService,
}));

const NOW = new Date("2026-10-28T00:00:00.000Z");

function mandate(overrides: Partial<AgentMandate> = {}): AgentMandate {
  return {
    enabled: true,
    maxWeeklyUsd: 10,
    maxPackUsd: 5,
    allowedPackageIds: ["credits_10", "credits_50"],
    expiresAt: "2027-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function run(input: {
  tool: string;
  args?: Record<string, unknown> | null;
  mandate?: AgentMandate | null;
  spent7dUsd?: number;
  actionsToday?: number;
  maxActionsPerDay?: number;
  now?: Date;
}) {
  return evaluateAction({
    args: input.args ?? {},
    mandate: input.mandate === undefined ? mandate() : input.mandate,
    spent7dUsd: input.spent7dUsd ?? 0,
    actionsToday: input.actionsToday ?? 0,
    now: input.now ?? NOW,
    maxActionsPerDay: input.maxActionsPerDay,
    tool: input.tool,
  });
}

describe("agent tool inventory", () => {
  it("exposes exactly the four phase-4 tools and nothing mandate-related", () => {
    expect(AGENT_TOOLS).toEqual([
      "get_balance",
      "list_transactions",
      "create_credit_order",
      "request_refund",
    ]);
    expect(AGENT_READ_ONLY_TOOLS).toEqual(["get_balance", "list_transactions"]);
    expect(AGENT_MAX_ACTIONS_PER_DAY_DEFAULT).toBe(25);
    expect(AGENT_MAX_USD_CAP).toBe(50);
    expect(AGENT_TOOLS).not.toContain("update_mandate");
  });
});

describe("unknown tools", () => {
  it("blocks an unknown tool", () => {
    const d = run({ tool: "delete_account" });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.unknownTool);
    expect(d.normalizedArgs).toEqual({});
    expect(d.amountUsd).toBeUndefined();
  });

  it("blocks a tool-name injection attempt", () => {
    const d = run({ tool: "create_credit_order; drop table" });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.unknownTool);
    expect(d.normalizedArgs).toEqual({});
  });

  it("blocks an empty tool name", () => {
    const d = run({ tool: "" });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.unknownTool);
  });
});

describe("read-only tools", () => {
  it("allows get_balance without a mandate", () => {
    const d = run({ tool: "get_balance", mandate: null });
    expect(d.verdict).toBe("allowed");
    expect(d.reason).toBe(AGENT_REASONS.readOnly);
    expect(d.normalizedArgs).toEqual({});
  });

  it("allows list_transactions without a mandate", () => {
    const d = run({ tool: "list_transactions", mandate: null });
    expect(d.verdict).toBe("allowed");
    expect(d.reason).toBe(AGENT_REASONS.readOnly);
  });

  it("strips unknown args from get_balance", () => {
    const d = run({
      tool: "get_balance",
      args: { packageId: "credits_10", amountUsd: 999, currency: "EUR" },
      mandate: null,
    });
    expect(d.normalizedArgs).toEqual({});
  });

  it("defaults list_transactions limit to 10", () => {
    const d = run({ tool: "list_transactions", mandate: null, args: {} });
    expect(d.normalizedArgs).toEqual({ limit: 10 });
  });

  it("clamps list_transactions limit to 1..50 and strips extras", () => {
    const d = run({
      tool: "list_transactions",
      mandate: null,
      args: { limit: 999, foo: "bar", type: "purchase" },
    });
    expect(d.normalizedArgs).toEqual({ limit: 50 });
  });

  it("raises a fractional/low limit to 1", () => {
    const d = run({ tool: "list_transactions", mandate: null, args: { limit: 0 } });
    expect(d.normalizedArgs).toEqual({ limit: 1 });
  });
});

describe("refund requests", () => {
  it("allows request_refund without a mandate", () => {
    const d = run({ tool: "request_refund", mandate: null });
    expect(d.verdict).toBe("allowed");
    expect(d.reason).toBe(AGENT_REASONS.refundRequest);
  });

  it("strips any amount chosen by the model", () => {
    const d = run({
      tool: "request_refund",
      args: {
        orderId: "order-1",
        reason: "duplicate charge",
        amountUsd: 999,
        credits: 500,
        currency: "USD",
      },
    });
    expect(d.normalizedArgs).toEqual({ orderId: "order-1", reason: "duplicate charge" });
    expect(d.normalizedArgs).not.toHaveProperty("amountUsd");
    expect(d.normalizedArgs).not.toHaveProperty("credits");
    expect(d.amountUsd).toBeUndefined();
  });

  it("trims and caps the refund reason", () => {
    const long = "x".repeat(2000);
    const d = run({
      tool: "request_refund",
      args: { orderId: "  order-1  ", reason: "   " + long + "   " },
    });
    const reason = String(d.normalizedArgs.reason);
    expect(d.normalizedArgs.orderId).toBe("order-1");
    expect(reason.length).toBe(1000);
  });

  it("drops an empty orderId/reason", () => {
    const d = run({
      tool: "request_refund",
      args: { orderId: "   ", reason: "   " },
    });
    expect(d.normalizedArgs).toEqual({});
  });
});

describe("create_credit_order mandate", () => {
  it("blocks when no mandate exists", () => {
    const d = run({ tool: "create_credit_order", mandate: null, args: { packageId: "credits_10" } });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.mandateMissing);
  });

  it("blocks when the mandate is disabled", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ enabled: false }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.mandateDisabled);
  });

  it("blocks when the mandate is expired", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ expiresAt: "2020-01-01T00:00:00.000Z" }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.mandateExpired);
  });

  it("blocks when expiry is exactly now", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ expiresAt: NOW.toISOString() }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.mandateExpired);
  });

  it("allows an unexpired mandate (no expiresAt)", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ expiresAt: null }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("needs_approval");
  });

  it("blocks an invalid package id", () => {
    const d = run({
      tool: "create_credit_order",
      args: { packageId: 42 },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.invalidPackageId);
  });

  it("blocks an unknown package", () => {
    const d = run({
      tool: "create_credit_order",
      args: { packageId: "credits_999" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.unknownPackage);
  });

  it("blocks a package that is not in the allowed list", () => {
    const d = run({
      tool: "create_credit_order",
      args: { packageId: "credits_100" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.packageNotAllowed);
  });

  it("blocks case tricks in package ids", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ allowedPackageIds: ["Credits_10"] }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.packageNotAllowed);
  });

  it("blocks whitespace tricks in package ids", () => {
    const d = run({
      tool: "create_credit_order",
      args: { packageId: " credits_10 " },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.unknownPackage);
  });

  it("blocks a package above the per-pack limit", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxPackUsd: 3.99 }),
      args: { packageId: "credits_50" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.packLimit);
  });

  it("allows a package exactly at the per-pack limit", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxPackUsd: 4.0 }),
      args: { packageId: "credits_50" },
    });
    expect(d.verdict).toBe("needs_approval");
  });

  it("blocks when the weekly limit is exceeded by one cent", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxWeeklyUsd: 0.99 }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.weeklyLimit);
  });

  it("allows when the weekly limit is exactly enough", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxWeeklyUsd: 1.0 }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("needs_approval");
  });

  it("allows when remaining weekly budget exactly covers the pack", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxWeeklyUsd: 4.0, maxPackUsd: 5.0 }),
      spent7dUsd: 3.0,
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("needs_approval");
  });

  it("blocks when remaining weekly budget is one cent short", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxWeeklyUsd: 4.0, maxPackUsd: 5.0 }),
      spent7dUsd: 3.01,
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.weeklyLimit);
  });

  it("returns the package price as amountUsd on approval", () => {
    const d = run({
      tool: "create_credit_order",
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("needs_approval");
    expect(d.reason).toBe(AGENT_REASONS.approval);
    expect(d.amountUsd).toBe(1);
  });

  it("strips extra args from create_credit_order", () => {
    const d = run({
      tool: "create_credit_order",
      args: {
        packageId: "credits_10",
        amountUsd: 999,
        price: 0,
        currency: "EUR",
        credits: 1000,
      },
    });
    expect(d.normalizedArgs).toEqual({ packageId: "credits_10" });
  });
});

describe("negative, NaN and huge numbers", () => {
  it("blocks when maxPackUsd is negative", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxPackUsd: -5 }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.packLimit);
  });

  it("blocks when maxPackUsd is NaN", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxPackUsd: Number.NaN }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.packLimit);
  });

  it("clamps a huge maxPackUsd to the 50 USD cap and allows a small pack", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxPackUsd: 1e9 }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("needs_approval");
  });

  it("blocks when maxWeeklyUsd is negative", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxWeeklyUsd: -1 }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.weeklyLimit);
  });

  it("blocks when maxWeeklyUsd is NaN", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({ maxWeeklyUsd: Number.NaN }),
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.weeklyLimit);
  });

  it("clamps a huge maxWeeklyUsd to the 50 USD cap", () => {
    const d = run({
      tool: "create_credit_order",
      mandate: mandate({
        maxWeeklyUsd: 1e9,
        maxPackUsd: 1e9,
        allowedPackageIds: ["credits_10", "credits_50", "credits_100"],
      }),
      args: { packageId: "credits_100" },
    });
    expect(d.verdict).toBe("needs_approval");
  });

  it("blocks when spent7dUsd is NaN (conservative)", () => {
    const d = run({
      tool: "create_credit_order",
      spent7dUsd: Number.NaN,
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.weeklyLimit);
  });

  it("blocks when spent7dUsd is negative (conservative)", () => {
    const d = run({
      tool: "create_credit_order",
      spent7dUsd: -5,
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.weeklyLimit);
  });

  it("blocks when spent7dUsd is Infinity", () => {
    const d = run({
      tool: "create_credit_order",
      spent7dUsd: Number.POSITIVE_INFINITY,
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.weeklyLimit);
  });
});

describe("action cap", () => {
  it("blocks any tool at 25 actions today", () => {
    const d = run({ tool: "get_balance", actionsToday: 25, mandate: null });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.actionCap);
  });

  it("allows 24 actions today", () => {
    const d = run({ tool: "get_balance", actionsToday: 24, mandate: null });
    expect(d.verdict).toBe("allowed");
  });

  it("honors a custom cap", () => {
    const d = run({
      tool: "get_balance",
      actionsToday: 2,
      maxActionsPerDay: 2,
      mandate: null,
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.actionCap);
  });

  it("a cap of zero blocks everything", () => {
    const d = run({
      tool: "get_balance",
      actionsToday: 0,
      maxActionsPerDay: 0,
      mandate: null,
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.actionCap);
  });

  it("a NaN cap falls back to the default", () => {
    const d = run({
      tool: "get_balance",
      actionsToday: 25,
      maxActionsPerDay: Number.NaN,
      mandate: null,
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.actionCap);
  });

  it("a negative actionsToday counts as zero", () => {
    const d = run({
      tool: "get_balance",
      actionsToday: -3,
      mandate: null,
    });
    expect(d.verdict).toBe("allowed");
  });

  it("the cap also blocks create_credit_order", () => {
    const d = run({
      tool: "create_credit_order",
      actionsToday: 25,
      args: { packageId: "credits_10" },
    });
    expect(d.verdict).toBe("blocked");
    expect(d.reason).toBe(AGENT_REASONS.actionCap);
  });
});

describe("agentMaxActionsPerDay helper", () => {
  it("defaults to 25 when unset", async () => {
    const { agentMaxActionsPerDay } = await import("@/lib/agent-policy");
    expect(agentMaxActionsPerDay({})).toBe(25);
  });

  it("parses a valid env value", async () => {
    const { agentMaxActionsPerDay } = await import("@/lib/agent-policy");
    expect(agentMaxActionsPerDay({ AGENT_MAX_ACTIONS_PER_DAY: "40" })).toBe(40);
  });

  it("falls back to 25 on invalid env values", async () => {
    const { agentMaxActionsPerDay } = await import("@/lib/agent-policy");
    expect(agentMaxActionsPerDay({ AGENT_MAX_ACTIONS_PER_DAY: "nope" })).toBe(25);
    expect(agentMaxActionsPerDay({ AGENT_MAX_ACTIONS_PER_DAY: "-1" })).toBe(25);
  });
});

// ---------------------------------------------------------------- route tests
describe("PUT/GET /api/agent/mandate", () => {
  function makeGet(row: any, spent: any = 0, spentError: any = null, rowError: any = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: rowError });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mockService.from.mockReturnValue({ select });
    mockService.rpc.mockResolvedValue({ data: spent, error: spentError });
  }

  function makePut(row: any, error: any = null) {
    const single = vi.fn().mockResolvedValue({ data: row, error });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mockService.from.mockReturnValue({ upsert });
    return { upsert };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.mockReturnValue({ id: "u1" });
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockUser.mockReturnValue(null);
      makeGet(null);
      const { GET } = await import("@/app/api/agent/mandate/route");
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns the default mandate and spent7d when no row exists", async () => {
      makeGet(null, 3.5);
      const { GET } = await import("@/app/api/agent/mandate/route");
      const res = await GET();
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.mandate.enabled).toBe(false);
      expect(json.data.mandate.maxWeeklyUsd).toBe(0);
      expect(json.data.mandate.allowedPackageIds).toEqual([]);
      expect(json.data.spent7d).toBe(3.5);
    });

    it("returns the stored mandate and spent7d", async () => {
      makeGet(
        {
          enabled: true,
          max_weekly_usd: "7.50",
          max_pack_usd: "4.00",
          allowed_package_ids: ["credits_10"],
          expires_at: "2027-01-01T00:00:00.000Z",
          created_at: "2026-10-28T00:00:00.000Z",
          updated_at: "2026-10-28T00:00:00.000Z",
        },
        "2.00",
      );
      const { GET } = await import("@/app/api/agent/mandate/route");
      const res = await GET();
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.mandate.enabled).toBe(true);
      expect(json.data.mandate.maxWeeklyUsd).toBe(7.5);
      expect(json.data.mandate.maxPackUsd).toBe(4);
      expect(json.data.mandate.allowedPackageIds).toEqual(["credits_10"]);
      expect(json.data.spent7d).toBe(2);
    });

    it("returns 500 when the mandate query fails", async () => {
      makeGet(null, 0, null, { message: "boom" });
      const { GET } = await import("@/app/api/agent/mandate/route");
      const res = await GET();
      expect(res.status).toBe(500);
    });

    it("returns 500 when the spend RPC fails", async () => {
      makeGet(null, 0, { message: "rpc boom" });
      const { GET } = await import("@/app/api/agent/mandate/route");
      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("PUT", () => {
    it("returns 401 when unauthenticated", async () => {
      mockUser.mockReturnValue(null);
      makePut(null);
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          maxWeeklyUsd: 10,
          maxPackUsd: 5,
          allowedPackageIds: ["credits_10"],
        }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 on invalid json", async () => {
      makePut(null);
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: "{not json",
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 on schema validation failure", async () => {
      makePut(null);
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({ enabled: "yes" }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when a package id does not exist", async () => {
      makePut(null);
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          maxWeeklyUsd: 10,
          maxPackUsd: 5,
          allowedPackageIds: ["credits_999"],
        }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 on case/whitespace tricks in package ids", async () => {
      makePut(null);
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          maxWeeklyUsd: 10,
          maxPackUsd: 5,
          allowedPackageIds: [" credits_10 ", "Credits_10"],
        }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 on an invalid expiresAt", async () => {
      makePut(null);
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          maxWeeklyUsd: 10,
          maxPackUsd: 5,
          allowedPackageIds: ["credits_10"],
          expiresAt: "not a date",
        }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    it("clamps negative and huge values and dedupes package ids", async () => {
      const { upsert } = makePut({
        enabled: true,
        max_weekly_usd: 50,
        max_pack_usd: 0,
        allowed_package_ids: ["credits_10"],
        expires_at: null,
        created_at: null,
        updated_at: null,
      });
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          maxWeeklyUsd: 999,
          maxPackUsd: -5,
          allowedPackageIds: ["credits_10", "credits_10"],
        }),
      });
      const res = await PUT(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      const payload = upsert.mock.calls[0][0];
      expect(payload.user_id).toBe("u1");
      expect(payload.max_weekly_usd).toBe(50);
      expect(payload.max_pack_usd).toBe(0);
      expect(payload.allowed_package_ids).toEqual(["credits_10"]);
      expect(json.data.mandate.maxWeeklyUsd).toBe(50);
      expect(json.data.mandate.maxPackUsd).toBe(0);
    });

    it("normalizes a valid expiresAt to ISO", async () => {
      const { upsert } = makePut({
        enabled: false,
        max_weekly_usd: 0,
        max_pack_usd: 0,
        allowed_package_ids: [],
        expires_at: "2027-06-01T00:00:00.000Z",
        created_at: null,
        updated_at: null,
      });
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({
          enabled: false,
          maxWeeklyUsd: 0,
          maxPackUsd: 0,
          allowedPackageIds: [],
          expiresAt: "2027-06-01T02:00:00+02:00",
        }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(200);
      const payload = upsert.mock.calls[0][0];
      expect(payload.expires_at).toBe("2027-06-01T00:00:00.000Z");
    });

    it("returns 500 when the upsert fails", async () => {
      makePut(null, { message: "db boom" });
      const { PUT } = await import("@/app/api/agent/mandate/route");
      const req = new Request("http://localhost/api/agent/mandate", {
        method: "PUT",
        body: JSON.stringify({
          enabled: false,
          maxWeeklyUsd: 0,
          maxPackUsd: 0,
          allowedPackageIds: [],
        }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(500);
    });
  });
});
