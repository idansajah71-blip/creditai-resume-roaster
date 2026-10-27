import { describe, it, expect } from "vitest";
import { findUnverifiedDetails } from "@/lib/fabrication-guard";

const ORIGINAL = `Jane Doe, Backend Engineer at Northwind Retail since 2021.
Built inventory services handling 3,000 orders per hour.
Reduced checkout latency from 900ms to 240ms.
Skills: Go, PostgreSQL, Docker.`;

describe("fabrication guard", () => {
  it("fixture 1: faithful rewrite returns no flags", () => {
    const rewritten = `Jane Doe, Backend Engineer at Northwind Retail since 2021.
Built inventory services handling 3,000 orders per hour.
Reduced checkout latency from 900ms to 240ms.
Skilled with Go and PostgreSQL.`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten)).toEqual([]);
  });

  it("fixture 2: invented percentage is flagged", () => {
    const rewritten = `${ORIGINAL}\nImproved throughput by 40%.`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten)).toContain("40%");
  });

  it("fixture 3: invented company name is flagged", () => {
    const rewritten = `${ORIGINAL} Previously worked at Acme Rocket Labs.`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten)).toContain("Acme Rocket Labs");
  });

  it("fixture 4: invented money amount is flagged", () => {
    const rewritten = `${ORIGINAL} Managed a $1,200 monthly tooling budget.`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten)).toContain("$1,200");
  });

  it("fixture 5: invented year-sized experience claim is flagged", () => {
    const rewritten = `${ORIGINAL} Supported the platform until 2029.`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten)).toContain("2029");
  });

  it("fixture 6 (false positive): variation in phrasing still matches the original", () => {
    const rewritten = `Jane works at Northwind Retail and has handled over 3,000 orders per hour.`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten)).toEqual([]);
  });

  it("fixture 7 (false positive): reformatted money matches after normalization", () => {
    const original = "Managed a $1,200 monthly tooling budget.";
    const rewritten = "Managed a $1200 monthly tooling budget.";
    expect(findUnverifiedDetails(original, rewritten)).toEqual([]);
  });

  it("fixture 8 (false positive): skills line from the job description is allowed", () => {
    const rewritten = `${ORIGINAL} Experienced with Amazon Web Services.`;
    const jd = `Requirements
Skills: Kubernetes, PostgreSQL, Amazon Web Services, Kafka`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten, jd)).toEqual([]);
  });

  it("fixture 9: JD mention outside a skills context stays flagged", () => {
    const rewritten = `${ORIGINAL} Partnered with the Amazon Web Services billing team.`;
    const jd = `Amazon Web Services powers our billing platform reporting.
Skills: PostgreSQL, Docker`;
    expect(findUnverifiedDetails(ORIGINAL, rewritten, jd)).toContain("Amazon Web Services");
  });

  it("fixture 10: Indonesian units (tahun, pengguna) are flagged when invented", () => {
    const original = `Bimo Santoso, QA Engineer di Bank Werda.
Menyusun skenario uji regresi. Keahlian: Playwright, Postman.`;
    const rewritten = `${original} Melayani 80.000 pengguna selama 7 tahun.`;
    const result = findUnverifiedDetails(original, rewritten);
    expect(result).toContain("80.000 pengguna");
    expect(result).toContain("7 tahun");
  });

  it("fixture 11 (false positive): inventing multiple details stays flappable", () => {
    // Documents the production threshold: >2 unverified details triggers retry.
    const rewritten = `${ORIGINAL} Grew revenue 25%, managed 15 engineers until 2029, hired by Acme Rocket Labs.`;
    const result = findUnverifiedDetails(ORIGINAL, rewritten);
    expect(result.length).toBeGreaterThan(2);
  });
});
