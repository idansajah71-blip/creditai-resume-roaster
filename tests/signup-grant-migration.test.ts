import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0009_signup_grant.sql"), "utf8");

describe("0009_signup_grant.sql (starter credits trigger)", () => {
  it("grants via grant_credits with the signup idempotency key and reference type", () => {
    expect(sql).toContain("perform public.grant_credits(");
    expect(sql).toContain("'signup:' || new.id::text");
    expect(sql).toContain("'signup_grant',");
  });

  it("uses a constant starter amount of 3, easy to change", () => {
    expect(sql).toContain("v_starter int := 3");
  });

  it("fires after insert on public.profiles", () => {
    expect(sql).toContain("after insert on public.profiles");
    expect(sql).toContain("for each row execute function public.grant_signup_credits()");
  });

  it("is best effort: a failed grant must not fail user creation", () => {
    expect(sql).toContain("exception");
    expect(sql).toContain("Best effort: a failed grant must never block user creation");
  });

  it("locks the trigger function down like other SECURITY DEFINER functions", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke all on function public.grant_signup_credits() from public;");
    expect(sql).toContain("revoke all on function public.grant_signup_credits() from anon;");
    expect(sql).toContain("revoke all on function public.grant_signup_credits() from authenticated;");
  });
});
