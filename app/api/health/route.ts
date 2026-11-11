import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccessToken } from "@/lib/paypal";
import { estimateCostUsd } from "@/lib/model-cost";

// Public system status: booleans only, never secrets or error internals.
// database  = a trivial query against profiles (head request, one column).
// paypal    = a real Sandbox OAuth token fetch (proves credentials + reachability).
// openai_*  = env presence only (cheap; no API call, no spend).
// cost      = average list-price estimate over the most recent succeeded jobs
//             that have persisted prompt/completion token counters.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE_MS = 30_000;
const OP_TIMEOUT_MS = 5000;
const COST_SAMPLE_SIZE = 50;

type Checks = {
  database: boolean;
  paypal: boolean;
  openai_configured: boolean;
  webhook_configured: boolean;
};

type CostMetrics = {
  avg_cost_usd: number | null;
  cost_sample_size: number;
};

type Cached = { at: number; checks: Checks; cost: CostMetrics };

// PayPal credentials missing is a config failure, not a reachability failure;
// /api/health reports paypal:false with a short reason so operators see why.
let paypalReason: string | null = null;

// Module-level cache (30s): avoids hammering Supabase/PayPal on every request.
let cached: Cached | null = null;

function withTimeout(promise: Promise<boolean>, fallback: boolean): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), OP_TIMEOUT_MS);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

async function paypalConfigReason(): Promise<string | null> {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing";
  }
  return null;
}

async function averageCost(): Promise<CostMetrics> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("ai_jobs")
      .select("prompt_tokens, completion_tokens")
      .eq("status", "succeeded")
      .not("prompt_tokens", "is", null)
      .not("completion_tokens", "is", null)
      .order("created_at", { ascending: false })
      .limit(COST_SAMPLE_SIZE);
    if (error || !data) return { avg_cost_usd: null, cost_sample_size: 0 };

    const costs = (data as { prompt_tokens: number | null; completion_tokens: number | null }[])
      .filter(
        (row) =>
          typeof row.prompt_tokens === "number" && typeof row.completion_tokens === "number",
      )
      .map((row) => estimateCostUsd(row.prompt_tokens as number, row.completion_tokens as number));
    if (costs.length === 0) return { avg_cost_usd: null, cost_sample_size: 0 };
    return {
      avg_cost_usd: costs.reduce((sum, cost) => sum + cost, 0) / costs.length,
      cost_sample_size: costs.length,
    };
  } catch {
    // A metrics failure must never take the health check down.
    return { avg_cost_usd: null, cost_sample_size: 0 };
  }
}

async function runChecks(): Promise<{ checks: Checks; cost: CostMetrics }> {
  const missingCreds = await paypalConfigReason();
  const [database, paypal, cost] = await Promise.all([
    withTimeout(
      (async () => {
        const service = createServiceClient();
        const { error } = await service.from("profiles").select("id").limit(1);
        return !error;
      })(),
      false,
    ),
    missingCreds ? Promise.resolve(false) : withTimeout(getAccessToken().then(() => true), false),
    averageCost(),
  ]);

  const checks: Checks = {
    database,
    paypal,
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    webhook_configured: Boolean(process.env.PAYPAL_WEBHOOK_ID),
  };
  paypalReason = !checks.paypal && missingCreds ? missingCreds : null;
  return { checks, cost };
}

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    const result = await runChecks();
    cached = { at: now, ...result };
  }
  const c = cached.checks;
  const ok = c.database && c.paypal && c.openai_configured && c.webhook_configured;
  const response: {
    ok: boolean;
    checks: Checks;
    cost: CostMetrics;
    paypal_reason?: string;
  } = { ok, checks: c, cost: cached.cost };
  if (!c.paypal && paypalReason) {
    response.paypal_reason = paypalReason;
  }
  return NextResponse.json(response);
}
