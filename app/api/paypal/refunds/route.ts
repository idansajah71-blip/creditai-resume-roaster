import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { refundCapture } from "@/lib/paypal";
import { decideRefund } from "@/lib/refund-agent";
import {
  allocateRefund,
  fromCents,
  refundAmountCents,
  remainingCredits,
  estimateCreditsUsed,
  type OrderLike,
} from "@/lib/refund-math";

export const maxDuration = 60;

const bodySchema = z.object({
  credits: z.number().int().min(1).max(1000),
  reason: z.string().min(10).max(1000),
});
const RATE_LIMIT_30D = 3;

type RefundRow = {
  id: string;
  paypal_order_id: string;
  credits: number;
  amount: string | number;
  currency: string;
  status: string;
  ai_decision: { message?: string } | null;
  created_at: string;
};

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return failure("unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("invalid json", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return failure("invalid input", 400);
  }
  const { credits, reason } = parsed.data;

  const service = createServiceClient();
  const requestKey = request.headers.get("idempotency-key") || crypto.randomUUID();

  // Idempotent replay: same client key already has segments stored.
  const { data: replay } = await service
    .from("refund_requests")
    .select("*")
    .like("idempotency_key", `${requestKey}%`)
    .order("created_at", { ascending: true });
  const replayRows = (replay as RefundRow[] | null) || [];
  if (replayRows.length > 0) {
    if (replayRows.every((r) => r.status === "refunded")) {
      const first = replayRows[0];
      const total = replayRows.reduce((s, r) => s + Number(r.credits), 0);
      return NextResponse.json({
        success: true,
        data: {
          status: "refunded",
          message: first?.ai_decision?.message || "Refund processed.",
          credits: total,
          idempotent: true,
        },
      });
    }
    if (replayRows.some((r) => r.status === "failed")) {
      return failure("Refund attempt failed. You can try again.", 502);
    }
    return failure("Refund request is still processing.", 409);
  }

  // Deterministic rate limit: max 3 refund requests per 30 days.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await service
    .from("refund_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since30d);
  if ((recentCount ?? 0) >= RATE_LIMIT_30D) {
    return failure("Refund request limit reached (3 per 30 days).", 429);
  }

  // Eligible orders: captured, refundable remainder > 0, newest first.
  const { data: ordersRaw } = await service
    .from("paypal_orders")
    .select("paypal_order_id, capture_id, amount_value, currency, credits_to_grant, refunded_credits, refunded_amount, created_at")
    .eq("user_id", user.id)
    .eq("status", "captured")
    .order("created_at", { ascending: false });

  const orders = ((ordersRaw as (OrderLike & { created_at: string })[]) || []).filter(
    (o) => remainingCredits(o) > 0,
  );

  const { data: profile } = await service
    .from("profiles")
    .select("credit_balance")
    .eq("id", user.id)
    .single();
  const balance = Number(profile?.credit_balance ?? 0);

  // Deterministic eligibility: the AI is never called for ineligible requests.
  const segments = allocateRefund(orders, credits, balance);
  if (!segments || segments.length === 0) {
    const refundable = orders.reduce((s, o) => s + remainingCredits(o), 0);
    return NextResponse.json(
      {
        success: false,
        message:
          balance < credits
            ? "You no longer hold that many unused credits."
            : `Only ${refundable} unused credits are refundable. Request ${Math.min(credits, refundable)} or fewer.`,
        data: { status: "denied" },
      },
      { status: 400 },
    );
  }

  // AI agent facts (informational only; the server owns the amount).
  const oldest = segments.reduce(
    (min, s) => Math.min(min, new Date(s.order.created_at || new Date().toISOString()).getTime()),
    Date.now(),
  );
  const daysSincePurchase = Math.max(
    0,
    Math.floor((Date.now() - oldest) / (24 * 60 * 60 * 1000)),
  );
  const purchasedTotal = orders.reduce((s, o) => s + o.credits_to_grant, 0);
  const refundableTotal = orders.reduce((s, o) => s + remainingCredits(o), 0);

  let decision: { decision: "approve" | "deny"; message: string };
  try {
    decision = await decideRefund({
      creditsRequested: credits,
      refundableCredits: refundableTotal,
      daysSincePurchase,
      creditsUsed: estimateCreditsUsed(purchasedTotal, refundableTotal, balance),
      previousRefunds: recentCount ?? 0,
      reason,
    });
  } catch {
    // Fail safe: no AI decision, no money movement.
    return failure("Refund assistant is temporarily unavailable. Try again later.", 503);
  }

  if (decision.decision === "deny") {
    return NextResponse.json({
      success: true,
      data: { status: "denied", message: decision.message },
    });
  }

  // Reserve credits + counters per segment, then refund via PayPal.
  const results: { paypalOrderId: string; credits: number; amount: string; refundId?: string }[] = [];
  const errors: string[] = [];
  let anySuccess = false;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const idempotencyKey = `${requestKey}:${i}`;

    const { data: row, error: rowErr } = await service
      .from("refund_requests")
      .insert({
        user_id: user.id,
        paypal_order_id: seg.order.paypal_order_id,
        credits: seg.credits,
        amount: fromCents(seg.amountCents),
        currency: seg.order.currency,
        reason,
        ai_decision: decision,
        status: "pending",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();
    if (rowErr || !row) {
      errors.push("db error");
      continue;
    }

    let amountStr = fromCents(seg.amountCents);
    try {
      const { data: reserved, error: reserveErr } = await service.rpc("reserve_purchase_refund", {
        p_user_id: user.id,
        p_paypal_order_id: seg.order.paypal_order_id,
        p_credits: seg.credits,
        p_idempotency: idempotencyKey,
      });
      if (reserveErr) throw new Error("reserve_failed");
      const resRow = Array.isArray(reserved) ? reserved[0] : reserved;
      if (resRow?.amount != null) amountStr = Number(resRow.amount).toFixed(2);

      await service.from("refund_requests").update({ status: "approved" }).eq("id", row.id);
    } catch {
      // Nothing deducted; record the failed attempt.
      await service.from("refund_requests").update({ status: "failed" }).eq("id", row.id);
      errors.push("reservation failed");
      continue;
    }

    try {
      const refund = await refundCapture(
        seg.order.capture_id || seg.order.paypal_order_id,
        amountStr,
        seg.order.currency,
        idempotencyKey,
        `Refund for ${seg.credits} unused credits.`,
      );
      if (!refund.id || refund.status === "CANCELLED" || refund.status === "FAILED") {
        throw new Error("refund_not_completed");
      }
      await service
        .from("refund_requests")
        .update({ status: "refunded", paypal_refund_id: refund.id })
        .eq("id", row.id);
      results.push({
        paypalOrderId: seg.order.paypal_order_id,
        credits: seg.credits,
        amount: amountStr,
        refundId: refund.id,
      });
      anySuccess = true;
    } catch {
      // Compensate: restore credits and counters, mark failed.
      try {
        await service.rpc("revert_purchase_refund", { p_refund_request_id: row.id });
      } catch (revertErr) {
        console.error("revert failed", row.id, revertErr instanceof Error ? revertErr.message : revertErr);
      }
      await service.from("refund_requests").update({ status: "failed" }).eq("id", row.id);
      errors.push("paypal refund failed");
    }
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "Refund could not be completed. No credits were deducted.",
        data: { status: "failed" },
      },
      { status: 502 },
    );
  }

  const totalCredits = results.reduce((s, r) => s + r.credits, 0);
  const totalAmount = results.reduce((s, r) => s + Number(r.amount), 0);
  const partial = results.length < segments.length;
  const message = partial
    ? `${decision.message} Partial refund: ${errors.length} segment(s) failed.`
    : decision.message;

  return NextResponse.json({
    success: true,
    data: {
      status: anySuccess && !partial ? "refunded" : "partial",
      message,
      credits: totalCredits,
      amount: totalAmount.toFixed(2),
      refunds: results,
    },
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return failure("unauthorized", 401);
  }
  const service = createServiceClient();

  const { data: ordersRaw } = await service
    .from("paypal_orders")
    .select("paypal_order_id, amount_value, currency, credits_to_grant, refunded_credits, refunded_amount, created_at")
    .eq("user_id", user.id)
    .eq("status", "captured")
    .order("created_at", { ascending: false });

  const orders = ((ordersRaw as OrderLike[]) || []).filter((o) => remainingCredits(o) > 0);
  const refundableCredits = orders.reduce((s, o) => s + remainingCredits(o), 0);
  const refundableCents = orders.reduce(
    (s, o) => s + refundAmountCents(o, remainingCredits(o)),
    0,
  );

  const { data: profile } = await service
    .from("profiles")
    .select("credit_balance")
    .eq("id", user.id)
    .single();

  const { data: requests } = await service
    .from("refund_requests")
    .select("id, paypal_order_id, credits, amount, currency, status, ai_decision, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    success: true,
    data: {
      balance: Number(profile?.credit_balance ?? 0),
      refundableCredits,
      refundableAmount: fromCents(refundableCents),
      requests: (requests as RefundRow[] | null) || [],
    },
  });
}
