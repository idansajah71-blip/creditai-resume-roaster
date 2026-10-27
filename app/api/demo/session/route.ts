import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/credits";
import {
  hashIp,
  getClientIp,
  generateDemoCredentials,
  withinIpLimit,
  withinDailyLimit,
  DEMO_CREDITS,
} from "@/lib/demo";

export async function POST(request: Request) {
  let ipHash: string;
  try {
    const ip = getClientIp(request);
    ipHash = hashIp(ip);
  } catch (e) {
    // Missing DEMO_IP_SALT in production lands here instead of silently
    // falling back to a public salt.
    console.error("[demo] session refused:", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, message: "demo session unavailable" }, { status: 500 });
  }
  const service = createServiceClient();

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Per-IP hourly cap
  const { count: ipCount } = await service
    .from("demo_sessions")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", hourAgo);
  if (!withinIpLimit(ipCount ?? 0)) {
    return NextResponse.json(
      { success: false, message: "Too many demo sessions from this network. Try again later." },
      { status: 429 },
    );
  }

  // Global daily cap
  const { count: dayCount } = await service
    .from("demo_sessions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayAgo);
  if (!withinDailyLimit(dayCount ?? 0, Number(process.env.DEMO_SESSIONS_DAILY_LIMIT || 200))) {
    return NextResponse.json(
      { success: false, message: "Demo capacity reached for today." },
      { status: 503 },
    );
  }

  const { email, password } = generateDemoCredentials();

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return NextResponse.json({ success: false, message: "demo session failed" }, { status: 500 });
  }

  const userId = created.user.id;
  const idempotencyKey = `demo:${userId}`;
  try {
    await grantCredits(userId, DEMO_CREDITS, idempotencyKey, "demo_grant", userId);
  } catch {
    // Non-fatal: user exists, credits grant can be retried via admin.
  }

  await service.from("demo_sessions").insert({ user_id: userId, ip_hash: ipHash });

  return NextResponse.json({ success: true, data: { email, password } });
}
