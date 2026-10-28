import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { reserveCredit, consumeReservation, refundReservation } from "@/lib/credits";
import { analyzeResume, scoreResume } from "@/lib/openai";
import { analysisResultSchema } from "@/lib/ai-schema";
import { findUnverifiedDetails } from "@/lib/fabrication-guard";
import { compareCoverage, filterKeywordsAgainstJD } from "@/lib/coverage";
import { detectLanguage } from "@/lib/language";
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

  // call AI
  let raw: string;
  const language = detectLanguage(resumeText);
  try {
    raw = await analyzeResume(resumeText, jobDescription, { language });
  } catch {
    await service
      .from("ai_jobs")
      .update({
        status: "failed",
        error: "ai_request_failed",
        ...(retainInput ? {} : { input: redactedInput() }),
      })
      .eq("id", job.id);
    await refundReservation(reservationId);
    return NextResponse.json({ success: false, message: "ai request failed" }, { status: 502 });
  }

  // validate output
  let result;
  try {
    result = analysisResultSchema.parse(JSON.parse(raw));
  } catch {
    await service
      .from("ai_jobs")
      .update({
        status: "failed",
        error: "invalid_output",
        ...(retainInput ? {} : { input: redactedInput() }),
      })
      .eq("id", job.id);
    await refundReservation(reservationId);
    return NextResponse.json({ success: false, message: "invalid ai output" }, { status: 502 });
  }

  // fabrication guard (deterministic): flag details absent from the original
  let unverified = findUnverifiedDetails(resumeText, result.rewrittenResume, jobDescription);
  if (unverified.length > 2) {
    // One retry with stricter instructions, at no extra credit cost.
    try {
      const retryRaw = await analyzeResume(resumeText, jobDescription, {
        language,
        avoidDetails: unverified,
      });
      const retryResult = analysisResultSchema.parse(JSON.parse(retryRaw));
      result = retryResult;
      unverified = findUnverifiedDetails(resumeText, result.rewrittenResume, jobDescription);
    } catch {
      // Keep the first result and report the flagged details as-is.
    }
  }

  // Before/after estimate: cheap second scoring pass; omit silently on failure.
  try {
    result.estimatedAfterScore = await scoreResume(result.rewrittenResume, jobDescription);
  } catch {
    // no delta shown
  }

  result.language = language;
  result.unverifiedDetails = unverified;

  // Deterministic keyword coverage, computed by code from the job wording the
  // model extracted (keywords must exist in the JD itself; anti-hallucination
  // filter drops the rest). No extra model calls. Response-only for now:
  // nothing here is persisted.
  const keywords = filterKeywordsAgainstJD(result.jdKeywords ?? [], jobDescription).slice(0, 25);
  const cov = compareCoverage(resumeText, result.rewrittenResume, keywords);
  const coverage = {
    before: cov.before.score,
    after: cov.after.score,
    gain: cov.gain,
    addedTerms: cov.addedTerms,
    lostTerms: cov.lostTerms,
    matched: cov.after.matched,
    missing: cov.after.missing,
  };

  // persist result
  await service
    .from("ai_jobs")
    .update({
      status: "succeeded",
      result: JSON.stringify(result),
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

  return NextResponse.json({
    success: true,
    // coverage is attached for the response only; the stored job result stays
    // exactly the model output plus the server-derived flags.
    data: { jobId: job.id, status: "succeeded", result: { ...result, coverage } },
  });
}