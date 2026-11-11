import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { reserveCredit, consumeReservation, refundReservation } from "@/lib/credits";
import {
  AnalysisPipelineError,
  runAnalysisPipeline,
  type AnalysisPipelineResult,
} from "@/lib/analysis-pipeline";
import {
  guaranteeThresholds,
  reasonsForLedger,
  reconcileStaleGuarantees,
  type ReconcileService,
} from "@/lib/guarantee";
export const maxDuration = 60;

import { checkRateLimitDb } from "@/lib/rate-limit";

const bodySchema = z.object({
  resumeText: z.string().min(1).max(20000),
  jobDescription: z.string().min(1).max(10000),
  idempotencyKey: z.string().min(8).max(128).optional(),
  retainInput: z.boolean().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "invalid json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "invalid input" }, { status: 400 });
  }
  const { resumeText, jobDescription } = parsed.data;
  const retainInput = parsed.data.retainInput === true;

  // Privacy default: raw resume text is not stored. When the user does not opt
  // in, input is replaced by a length-only summary before the job is finalized.
  const redactedInput = () => JSON.stringify({ resumeChars: resumeText.length, jobChars: jobDescription.length });

  const service = createServiceClient();

  // The quality bar and its refund decision are decided by code (and SQL),
  // never by the model. Thresholds come from env with defaults in code.
  const guaranteeTh = guaranteeThresholds();

  // Best-effort reconcile: jobs that succeeded in a previous request but
  // never got their guarantee stamped/refunded get a deterministic check now.
  // Never allowed to break this request.
  await reconcileStaleGuarantees(
    service as unknown as ReconcileService,
    user.id,
    guaranteeTh,
  );

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Per-user daily cap
  const userLimit = Number(process.env.AI_DAILY_LIMIT_PER_USER || 20);
  const { count: userCount } = await service
    .from("ai_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since24h);
  if ((userCount ?? 0) >= userLimit) {
    return NextResponse.json({ success: false, message: "Daily analysis limit reached." }, { status: 429 });
  }

  // Global daily cap
  const globalLimit = Number(process.env.AI_GLOBAL_DAILY_LIMIT || 500);
  const { count: globalCount } = await service
    .from("ai_jobs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since24h);
  if ((globalCount ?? 0) >= globalLimit) {
    return NextResponse.json({ success: false, message: "Demo capacity reached for today." }, { status: 503 });
  }

  if (!(await checkRateLimitDb(service, user.id, 5, 60))) {
    return NextResponse.json({ success: false, message: "rate limited" }, { status: 429 });
  }

  // Opportunistic cleanup of stale reservations for this user.
  try {
    await service.rpc("release_stale_reservations", {
      p_user_id: user.id,
      p_older_than: "5 minutes",
    });
  } catch {
    // ignore cleanup errors
  }

  const idempotencyKey = parsed.data.idempotencyKey || crypto.randomUUID();

  // idempotency: existing job
  const { data: existing } = await service
    .from("ai_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.status === "succeeded") {
      let result = null;
      try {
        result = JSON.parse(existing.result);
      } catch {
        result = null;
      }
      return NextResponse.json({
        success: true,
        data: { jobId: existing.id, status: "succeeded", result },
      });
    }
    if (existing.status === "failed") {
      return NextResponse.json(
        { success: false, message: existing.error || "analysis failed", data: { jobId: existing.id, status: "failed" } },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { success: true, data: { jobId: existing.id, status: existing.status } },
      { status: 202 },
    );
  }

  // reserve credit
  let reservationId: string;
  try {
    const r = await reserveCredit(user.id, 1, idempotencyKey);
    reservationId = r.reservationId;
  } catch {
    return NextResponse.json({ success: false, message: "insufficient credits" }, { status: 402 });
  }

  // create job
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const { data: job, error: jobErr } = await service
    .from("ai_jobs")
    .insert({
      user_id: user.id,
      status: "running",
      input: JSON.stringify({ resumeText, jobDescription }),
      model,
      credits_cost: 1,
      reservation_id: reservationId,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    await refundReservation(reservationId);
    return NextResponse.json({ success: false, message: "db error" }, { status: 500 });
  }

  /* Real analysis pipeline (shared with the eval harness): model call,
     validation, fabrication retry, deterministic coverage, guarantee retry,
     second scoring pass and token aggregation. */
  let analysis: AnalysisPipelineResult;
  try {
    analysis = await runAnalysisPipeline(resumeText, jobDescription, {
      thresholds: guaranteeTh,
    });
  } catch (e) {
    const invalid = e instanceof AnalysisPipelineError && e.code === "invalid_output";
    await service
      .from("ai_jobs")
      .update({
        status: "failed",
        error: invalid ? "invalid_output" : "ai_request_failed",
        ...(retainInput ? {} : { input: redactedInput() }),
      })
      .eq("id", job.id);
    await refundReservation(reservationId);
    return NextResponse.json(
      { success: false, message: invalid ? "invalid ai output" : "ai request failed" },
      { status: 502 },
    );
  }

  const { result, coverage, guarantee: verdict, usage } = analysis;

  // persist result. The coverage columns are stamped here too so a crash
  // between this update and the guarantee RPC can still be reconciled later.
  // match_score is stored alongside the JSON so /history and /dashboard can
  // render the score without shipping the full result blob.
  await service
    .from("ai_jobs")
    .update({
      status: "succeeded",
      result: JSON.stringify(result),
      match_score: result.matchScore,
      coverage_before: coverage.before,
      coverage_after: coverage.after,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      completed_at: new Date().toISOString(),
      ...(retainInput ? {} : { input: redactedInput() }),
    })
    .eq("id", job.id);

  // finalize reservation
  try {
    await consumeReservation(reservationId);
  } catch (e) {
    console.error("consumeReservation failed", job.id, e instanceof Error ? e.message : e);
  }

  /* "AI proposes, code disposes": the model wrote the rewrite; the bar and
     the refund are decided here and in SQL. A stamp or refund failure must
     never fail the request - the user keeps the result and a later analyze
     call reconciles the state. */
  let guaranteeStatus: string;
  let creditsRefunded = 0;

  if (verdict.met) {
    guaranteeStatus = "met";
    try {
      const { error: metError } = await service.rpc("mark_guarantee_met", {
        p_job_id: job.id,
        p_before: coverage.before,
        p_after: coverage.after,
      });
      if (metError) throw new Error("mark_guarantee_met_rpc_error");
    } catch (e) {
      console.error("guarantee_met_stamp_failed", job.id, e instanceof Error ? e.message : e);
    }
  } else {
    // Not met: the credit is refunded automatically unless the RPC cannot
    // confirm it (logged, no secrets); the user still keeps this result.
    guaranteeStatus = "not_applicable";
    try {
      const { data: refundData, error: refundError } = await service.rpc("apply_guarantee_refund", {
        p_job_id: job.id,
        p_reason: reasonsForLedger(verdict),
        p_daily_limit: guaranteeTh.dailyRefundLimit,
      });
      if (refundError) throw new Error("apply_guarantee_refund_rpc_error");
      const row = (Array.isArray(refundData) ? refundData[0] : refundData) as
        | { status?: unknown; credits_refunded?: unknown }
        | null;
      if (!row || typeof row.status !== "string") throw new Error("apply_guarantee_refund_unverified");
      guaranteeStatus = row.status;
      creditsRefunded = Number(row.credits_refunded) || 0;
    } catch (e) {
      console.error("guarantee_refund_failed", job.id, e instanceof Error ? e.message : e);
    }
  }

  const guarantee = {
    status: guaranteeStatus,
    reasons: verdict.reasons,
    creditsRefunded,
  };

  return NextResponse.json({
    success: true,
    // coverage + guarantee are attached for the response only; the stored job
    // result stays exactly the model output plus the server-derived flags,
    // while the guarantee columns carry the auditable decision.
    data: { jobId: job.id, status: "succeeded", result: { ...result, coverage, guarantee } },
  });
}