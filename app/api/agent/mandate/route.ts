import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPackage } from "@/lib/packages";

// PUT/GET /api/agent/mandate
//
// The user's spending mandate is the only thing an agent can ask for, and it
// is written exclusively here: the user id always comes from the session, and
// the service role performs the write. The agent has no tool that reaches this
// route, so it cannot grant itself a larger limit or a wider package list.
export const dynamic = "force-dynamic";

const MAX_USD = 50;

const bodySchema = z.object({
  enabled: z.boolean(),
  maxWeeklyUsd: z.number().finite(),
  maxPackUsd: z.number().finite(),
  allowedPackageIds: z.array(z.string().min(1).max(64)).max(20).default([]),
  expiresAt: z.string().nullable().optional(),
});

type MandateRow = {
  enabled: boolean;
  max_weekly_usd: number | string;
  max_pack_usd: number | string;
  allowed_package_ids: string[] | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const EMPTY_ROW: MandateRow = {
  enabled: false,
  max_weekly_usd: 0,
  max_pack_usd: 0,
  allowed_package_ids: [],
  expires_at: null,
  created_at: null,
  updated_at: null,
};

function clampUsd(value: number): number {
  const clamped = Math.min(MAX_USD, Math.max(0, value));
  return Math.round(clamped * 100) / 100;
}

function toApiMandate(row: MandateRow) {
  return {
    enabled: Boolean(row.enabled),
    maxWeeklyUsd: Number(row.max_weekly_usd ?? 0),
    maxPackUsd: Number(row.max_pack_usd ?? 0),
    allowedPackageIds: Array.isArray(row.allowed_package_ids)
      ? row.allowed_package_ids
      : [],
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function parseExpiry(value: string | null | undefined) {
  if (value === null || value === undefined) return { ok: true as const, iso: null };
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return { ok: false as const };
  return { ok: true as const, iso: new Date(ms).toISOString() };
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return failure("unauthorized", 401);

  const service = createServiceClient();
  const { data: row, error: rowError } = await service
    .from("spend_mandates")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (rowError) return failure("db error", 500);

  const { data: spent, error: spendError } = await service.rpc("agent_spend_7d", {
    p_user_id: user.id,
  });
  if (spendError) return failure("db error", 500);

  return NextResponse.json({
    success: true,
    data: {
      mandate: toApiMandate((row ?? EMPTY_ROW) as MandateRow),
      spent7d: Number(spent ?? 0),
    },
  });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return failure("unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("invalid json", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return failure("invalid input", 400);

  const expires = parseExpiry(parsed.data.expiresAt);
  if (!expires.ok) return failure("invalid expiresAt", 400);

  // Exact package ids only: no trimming or case folding is done, so a trick
  // like " credits_10 " or "Credits_10" is rejected rather than silently
  // accepted.
  const uniqueIds = Array.from(new Set(parsed.data.allowedPackageIds));
  if (uniqueIds.some((id) => !getPackage(id))) {
    return failure("unknown package", 400);
  }

  const service = createServiceClient();
  const { data: saved, error: saveError } = await service
    .from("spend_mandates")
    .upsert(
      {
        user_id: user.id,
        enabled: parsed.data.enabled,
        max_weekly_usd: clampUsd(parsed.data.maxWeeklyUsd),
        max_pack_usd: clampUsd(parsed.data.maxPackUsd),
        allowed_package_ids: uniqueIds,
        expires_at: expires.iso,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (saveError || !saved) return failure("db error", 500);

  return NextResponse.json({
    success: true,
    data: { mandate: toApiMandate(saved as MandateRow) },
  });
}
