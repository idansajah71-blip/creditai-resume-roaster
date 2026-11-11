import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0011_agent_policy.sql"), "utf8");

describe("0011_agent_policy.sql (spending mandate)", () => {
  it("adds source column to paypal_orders with default and check", () => {
    expect(sql).toContain("add column if not exists source text not null default 'user'");
    expect(sql).toContain("check (source in ('user','agent'))");
  });

  it("creates spend_mandates with the documented caps", () => {
    expect(sql).toContain("create table if not exists public.spend_mandates");
    expect(sql).toContain("user_id uuid primary key references auth.users(id) on delete cascade");
    expect(sql).toContain("max_weekly_usd numeric(10,2) not null default 0");
    expect(sql).toContain("check (max_weekly_usd >= 0 and max_weekly_usd <= 50)");
    expect(sql).toContain("max_pack_usd numeric(10,2) not null default 0");
    expect(sql).toContain("check (max_pack_usd >= 0 and max_pack_usd <= 50)");
    expect(sql).toContain("allowed_package_ids text[] not null default '{}'");
    expect(sql).toContain("expires_at timestamptz");
  });

  it("enables RLS and a select-own policy on spend_mandates with no writes", () => {
    expect(sql).toContain("alter table public.spend_mandates enable row level security");
    expect(sql).toContain('create policy "spend_mandates_select_own"');
    expect(sql).toContain("for select using (auth.uid() = user_id)");
  });

  it("creates agent_actions with the documented shape and verdict check", () => {
    expect(sql).toContain("create table if not exists public.agent_actions");
    expect(sql).toContain("id uuid primary key default gen_random_uuid()");
    expect(sql).toContain("conversation_id uuid");
    expect(sql).toContain("args jsonb not null default '{}'::jsonb");
    expect(sql).toContain("check (policy_verdict in ('allowed','blocked','needs_approval'))");
    expect(sql).toContain("amount_usd numeric(10,2)");
    expect(sql).toContain("paypal_order_id text");
    expect(sql).toContain("created_at timestamptz not null default now()");
  });

  it("enables RLS and a select-own policy on agent_actions", () => {
    expect(sql).toContain("alter table public.agent_actions enable row level security");
    expect(sql).toContain('create policy "agent_actions_select_own"');
    expect(sql).toContain("for select using (auth.uid() = user_id)");
  });

  it("defines agent_spend_7d as SECURITY DEFINER with search_path and revoke", () => {
    expect(sql).toContain("create or replace function public.agent_spend_7d(p_user_id uuid)");
    expect(sql).toContain("returns numeric");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("and o.source = 'agent'");
    expect(sql).toContain("and o.status <> 'failed'");
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("revoke all on function public.agent_spend_7d(uuid) from public, anon, authenticated");
  });
});
