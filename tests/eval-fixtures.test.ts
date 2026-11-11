import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "tests", "fixtures", "guarantee");
const manifest = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, "manifest.json"), "utf8"),
) as {
  pairs: { id: string; category: string; resume: string; job: string }[];
};

const REQUIRED_CATEGORIES: Record<string, number> = {
  good: 3,
  weak: 2,
  "keyword-stuffing": 1,
  "very-short": 1,
  "indonesian-english-jd": 1,
};

describe("guarantee evaluation fixtures", () => {
  it("has at least eight pairs covering every required category", () => {
    expect(manifest.pairs.length).toBeGreaterThanOrEqual(8);
    for (const [category, count] of Object.entries(REQUIRED_CATEGORIES)) {
      expect(
        manifest.pairs.filter((pair) => pair.category === category),
        `category ${category}`,
      ).toHaveLength(count);
    }
  });

  it("every pair points at a non-empty resume and job file", () => {
    for (const pair of manifest.pairs) {
      for (const relative of [pair.resume, pair.job]) {
        const full = path.join(fixturesDir, relative);
        expect(fs.existsSync(full), `${pair.id}: ${relative}`).toBe(true);
        expect(fs.readFileSync(full, "utf8").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("the Indonesian resume is paired with an English job description", () => {
    const pair = manifest.pairs.find((item) => item.category === "indonesian-english-jd");
    expect(pair).toBeTruthy();
    const resume = fs.readFileSync(path.join(fixturesDir, pair!.resume), "utf8");
    const job = fs.readFileSync(path.join(fixturesDir, pair!.job), "utf8");
    expect(resume).toMatch(/PENGALAMAN|KEAHLIAN/);
    expect(job).toMatch(/Requirements|Responsibilities/);
  });
});
