// Spending policy for the agent. Pure code: no I/O, no model, no Supabase.
// "AI proposes, code disposes" applies here too: the model can only request an
// action, and this function decides whether the request is even allowed to
// reach a human. An agent order never completes a payment; the best it can
// get is 'needs_approval', which requires the user to approve on PayPal.
import { getPackage } from "@/lib/packages";

export const AGENT_TOOLS = [
  "get_balance",
  "list_transactions",
  "create_credit_order",
  "request_refund",
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

export const AGENT_READ_ONLY_TOOLS: readonly AgentTool[] = [
  "get_balance",
  "list_transactions",
];

export const AGENT_MAX_ACTIONS_PER_DAY_DEFAULT = 25;
export const AGENT_MAX_USD_CAP = 50;

export const AGENT_REASONS = {
  unknownTool: "unknown_tool",
  actionCap: "action_cap_reached",
  readOnly: "read_only",
  mandateMissing: "mandate_missing",
  mandateDisabled: "mandate_disabled",
  mandateExpired: "mandate_expired",
  invalidPackageId: "invalid_package_id",
  unknownPackage: "unknown_package",
  packageNotAllowed: "package_not_allowed",
  packLimit: "pack_limit_exceeded",
  weeklyLimit: "weekly_limit_exceeded",
  approval: "awaiting_human_approval",
  refundRequest: "refund_request",
} as const;

export type AgentPolicyVerdict = "allowed" | "blocked" | "needs_approval";

export type AgentMandate = {
  enabled: boolean;
  maxWeeklyUsd: number;
  maxPackUsd: number;
  allowedPackageIds: string[];
  expiresAt?: string | Date | null;
};

export type AgentPolicyDecision = {
  verdict: AgentPolicyVerdict;
  reason: string;
  amountUsd?: number;
  normalizedArgs: Record<string, unknown>;
};

export type AgentPolicyInput = {
  tool: string;
  args?: Record<string, unknown> | null;
  mandate: AgentMandate | null;
  spent7dUsd: number;
  actionsToday: number;
  now?: Date;
  maxActionsPerDay?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function clampUsdLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(AGENT_MAX_USD_CAP, Math.max(0, n));
  return Math.round(clamped * 100) / 100;
}

function spentCents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return Number.MAX_SAFE_INTEGER;
  return Math.round(n * 100);
}

function actionCount(value: unknown): number {
  const n = Number(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) return Number.MAX_SAFE_INTEGER;
  if (n < 0) return 0;
  return Math.floor(n);
}

function actionCap(value: unknown): number {
  if (value === undefined || value === null) return AGENT_MAX_ACTIONS_PER_DAY_DEFAULT;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return AGENT_MAX_ACTIONS_PER_DAY_DEFAULT;
  return Math.floor(n);
}

function mandateExpired(expiresAt: unknown, now: Date): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  const ms =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : Date.parse(String(expiresAt));
  return !Number.isFinite(ms) || ms <= now.getTime();
}

function normalizeListArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const rawLimit = args.limit;
  if (rawLimit !== undefined) {
    const n = Number(rawLimit);
    if (Number.isFinite(n)) {
      normalized.limit = Math.min(50, Math.max(1, Math.floor(n)));
    } else {
      normalized.limit = 10;
    }
  } else {
    normalized.limit = 10;
  }
  return normalized;
}

function normalizeRefundArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  if (typeof args.orderId === "string") {
    const trimmed = args.orderId.trim().slice(0, 100);
    if (trimmed.length > 0) normalized.orderId = trimmed;
  }
  if (typeof args.reason === "string") {
    const trimmed = args.reason.trim().slice(0, 1000);
    if (trimmed.length > 0) normalized.reason = trimmed;
  }
  // amount / credits / any other field is deliberately dropped: the model
  // never picks a refund amount. The deterministic refund route computes it.
  return normalized;
}

function normalizeArgs(tool: AgentTool, args: Record<string, unknown>): Record<string, unknown> {
  switch (tool) {
    case "get_balance":
      return {};
    case "list_transactions":
      return normalizeListArgs(args);
    case "create_credit_order":
      return typeof args.packageId === "string" ? { packageId: args.packageId } : {};
    case "request_refund":
      return normalizeRefundArgs(args);
    default:
      return {};
  }
}

function isAgentTool(tool: string): tool is AgentTool {
  return (AGENT_TOOLS as readonly string[]).includes(tool);
}

export function agentMaxActionsPerDay(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AGENT_MAX_ACTIONS_PER_DAY);
  if (!Number.isFinite(n) || n < 0) return AGENT_MAX_ACTIONS_PER_DAY_DEFAULT;
  return Math.floor(n);
}

export function evaluateAction(input: AgentPolicyInput): AgentPolicyDecision {
  const tool = String(input.tool ?? "");
  const args = asRecord(input.args);
  const now = input.now instanceof Date ? input.now : new Date();
  const maxActions = actionCap(input.maxActionsPerDay);

  // Unknown tool: blocked before anything else, including the action cap, so
  // the reason tells the caller exactly what was wrong.
  if (!isAgentTool(tool)) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.unknownTool,
      normalizedArgs: {},
    };
  }

  const normalizedArgs = normalizeArgs(tool, args);

  // Per-user daily action cap, applied to every tool including read-only.
  if (actionCount(input.actionsToday) >= maxActions) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.actionCap,
      normalizedArgs,
    };
  }

  // Read-only tools never need a mandate.
  if (AGENT_READ_ONLY_TOOLS.includes(tool)) {
    return {
      verdict: "allowed",
      reason: AGENT_REASONS.readOnly,
      normalizedArgs,
    };
  }

  // Refunds are a request, not a spend. The amount is never chosen by the
  // model; the deterministic refund desk computes it from the order.
  if (tool === "request_refund") {
    return {
      verdict: "allowed",
      reason: AGENT_REASONS.refundRequest,
      normalizedArgs,
    };
  }

  // From here: create_credit_order.
  const mandate = input.mandate;
  if (mandate === null || mandate === undefined) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.mandateMissing,
      normalizedArgs,
    };
  }
  if (!mandate.enabled) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.mandateDisabled,
      normalizedArgs,
    };
  }
  if (mandateExpired(mandate.expiresAt, now)) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.mandateExpired,
      normalizedArgs,
    };
  }

  const packageId = normalizedArgs.packageId;
  if (typeof packageId !== "string" || packageId.length === 0) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.invalidPackageId,
      normalizedArgs,
    };
  }

  const pkg = getPackage(packageId);
  if (!pkg) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.unknownPackage,
      normalizedArgs,
    };
  }

  const allowed = Array.isArray(mandate.allowedPackageIds)
    ? mandate.allowedPackageIds
    : [];
  if (!allowed.includes(packageId)) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.packageNotAllowed,
      normalizedArgs,
    };
  }

  const priceCents = Math.round(Number(pkg.amount) * 100);
  const packLimitCents = Math.round(clampUsdLimit(mandate.maxPackUsd) * 100);
  if (priceCents > packLimitCents) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.packLimit,
      normalizedArgs,
    };
  }

  const weeklyLimitCents = Math.round(clampUsdLimit(mandate.maxWeeklyUsd) * 100);
  const spent = spentCents(input.spent7dUsd);
  if (spent + priceCents > weeklyLimitCents) {
    return {
      verdict: "blocked",
      reason: AGENT_REASONS.weeklyLimit,
      normalizedArgs,
    };
  }

  return {
    verdict: "needs_approval",
    reason: AGENT_REASONS.approval,
    amountUsd: priceCents / 100,
    normalizedArgs,
  };
}
