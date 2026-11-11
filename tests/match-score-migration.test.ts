import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0012_match_score.sql"), "utf8");

describe("0012_match_score.sql (first-class match score)", () => {
  it("adds the column idempotently", () => {
    expect(sql).toContain("add column if not exists match_score integer");
  });

  it("constrains the score to 0-100 or null", () => {
    expect(sql).toContain("ai_jobs_match_score_check");
    expect(sql).toContain("check (match_score is null or (match_score >= 0 and match_score <= 100))");
  });

  it("backfills only from existing results without destroying data", () => {
    expect(sql).toContain("where match_score is null and result is not null");
    expect(sql).toContain("->> 'matchScore')::int");
    // One bad blob must not abort the backfill.
    expect(sql).toContain("exception when others then");
  });

  it("never rewrites the result column", () => {
    expect(sql).not.toContain("set result");
  });
});
