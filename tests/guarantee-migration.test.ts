import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0010_guarantee_refund.sql"), "utf8");

describe("0010_guarantee_refund.sql (outcome guarantee)", () => {
  it("adds the guarantee columns to ai_jobs, idempotently", () => {
    expect(sql).toContain("add column if not exists coverage_before numeric(5,1)");
    expect(sql).toContain("add column if not exists coverage_after numeric(5,1)");
    expect(sql).toContain("add column if not exists guarantee_status text not null default 'not_applicable'");
    expect(sql).toContain("add column if not exists guarantee_reason jsonb");
    expect(sql).toContain("add column if not exists guarantee_checked_at timestamptz");
    expect(sql).toContain("add column if not exists prompt_tokens integer");
    expect(sql).toContain("add column if not exists completion_tokens integer");
  });

  it("keeps every pre-existing ledger type and adds guarantee_refund to the check", () => {
    expect(sql).toContain("drop constraint if exists credit_transactions_type_check");
    expect(sql).toContain(
      "check (type in ('purchase','reservation','consumption','refund','adjustment','purchase_refund','guarantee_refund'))",
    );
  });

  it("constrains guarantee_status to the four documented states", () => {
    expect(sql).toContain("ai_jobs_guarantee_status_check");
    expect(sql).toContain("check (guarantee_status in ('not_applicable','met','refunded','waived'))");
  });

  it("apply_guarantee_refund is SECURITY DEFINER with a pinned search path", () => {
    expect(sql).toContain("create or replace function public.apply_guarantee_refund(");
    expect(sql).toContain("security definer");
    // Both definer functions set search_path = public.
    expect((sql.match(/set search_path = public/g) || []).length).toBe(2);
  });

  it("locks rows and only refunds succeeded jobs with a consumed reservation", () => {
    expect(sql).toContain("select * into v_job from public.ai_jobs where id = p_job_id for update");
    expect(sql).toContain("from public.profiles where id = v_job.user_id for update");
    expect(sql).toContain("if v_job.status <> 'succeeded' then");
    expect(sql).toContain("is distinct from 'consumed'");
  });

  it("is fully idempotent on the guarantee ledger key", () => {
    expect(sql).toContain("'guarantee:' || p_job_id::text");
    expect(sql).toContain("-- Idempotent replay: a decided job never changes outcome.");
  });

  it("enforces the daily cap with a waived outcome and no refund", () => {
    expect(sql).toContain("type = 'guarantee_refund'");
    expect(sql).toContain("set guarantee_status = 'waived'");
    expect(sql).toContain("p_daily_limit");
  });

  it("writes exactly one ledger row per refunded job with after-balances", () => {
    expect(sql).toContain("insert into public.credit_transactions");
    expect(sql).toContain("balance_after, reserved_after");
    expect(sql).toContain("'guarantee', p_job_id::text");
    expect(sql).toContain("set guarantee_status = 'refunded'");
  });

  it("mark_guarantee_met only transitions from not_applicable (idempotent)", () => {
    expect(sql).toContain("create or replace function public.mark_guarantee_met(");
    expect(sql).toContain("set guarantee_status = 'met'");
    expect(sql).toContain("where id = p_job_id and guarantee_status = 'not_applicable'");
  });

  it("locks both definer functions down from public, anon and authenticated", () => {
    expect(sql).toContain(
      "revoke all on function public.apply_guarantee_refund(uuid, jsonb, int) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "revoke all on function public.mark_guarantee_met(uuid, numeric, numeric) from public, anon, authenticated;",
    );
  });

  it("indexes the reconcile scan so a stale-job lookup stays cheap", () => {
    expect(sql).toContain("idx_jobs_guarantee_pending");
    expect(sql).toContain("where status = 'succeeded' and guarantee_checked_at is null");
  });
});
