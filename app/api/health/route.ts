import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccessToken } from "@/lib/paypal";

// Public system status: booleans only, never secrets or error internals.
// database  = a trivial query against profiles (head request, one column).
// paypal    = a real Sandbox OAuth token fetch (proves credentials + reachability).
// openai_*  = env presence only (cheap; no API call, no spend).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE_MS = 30_000;
const OP_TIMEOUT_MS = 5000;

type Checks = {
  database: boolean;
  paypal: boolean;
  openai_configured: boolean;
  webhook_configured: boolean;
};

type Cached = { at: number; checks: Checks };

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

async function runChecks(): Promise<Checks> {
  const [database, paypal] = await Promise.all([
    withTimeout(
      (async () => {
        const service = createServiceClient();
        const { error } = await service.from("profiles").select("id").limit(1);
        return !error;
      })(),
      false,
    ),
    withTimeout(getAccessToken().then(() => true), false),
  ]);

  return {
    database,
    paypal,
    openai_configured: Boolean(process.env.OPENAI_API_KEY),
    webhook_configured: Boolean(process.env.PAYPAL_WEBHOOK_ID),
  };
}

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    const checks = await runChecks();
    cached = { at: now, checks };
  }
  const c = cached.checks;
  const ok = c.database && c.paypal && c.openai_configured && c.webhook_configured;
  return NextResponse.json({ ok, checks: c });
}
