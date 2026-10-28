import { describe, it, expect } from "vitest";
import {
  normalizeText,
  filterKeywordsAgainstJD,
  matchesTerm,
  computeCoverage,
  compareCoverage,
  type Term,
} from "@/lib/coverage";

describe("normalizeText", () => {
  it.each([
    ["strips punctuation, keeps c++, node.js, splits number groups", "C++, Node.js, and (Go) 2,500 users!", "c++ node.js and go 2 500 users"],
    ["strips unicode diacritics", "Naïve résumé café", "naive resume cafe"],
    ["splits on internal punctuation", "Built state-of-the-art dashboards", "built state of the art dashboards"],
    ["keeps c# token", "Proficient with C# and .NET", "proficient with c# and .net"],
    ["strips sentence-final periods from tokens", "Experience. Shipping, daily...", "experience shipping daily"],
    ["collapses whitespace and lowercases", "  REACT   &   Redux  ", "react redux"],
  ])("%s", (_name, input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});

// Deterministic keyword matching table.
describe("matchesTerm", () => {
  it.each([
    ["exact single-token match", "built apis in node.js", "Node.js", true],
    ["punctuation keyword c++", "bun, c++, and golang services", "C++", true],
    ["plural noun stays a match", "relational databases for 3 years", "database", true],
    ["gerund tolerance (engineering/engineer)", "engineering the core platform", "engineer", true],
    ["past tense tolerance", "designed web ui components", "design", true],
    ["java does not match javascript", "wrote javascript and typescript", "Java", false],
    ["javascript does not match java", "began with plain java", "JavaScript", false],
    ["synonym js -> javascript", "5 years of js frontend work", "JavaScript", true],
    ["synonym k8s -> kubernetes", "deploy on k8s every friday", "Kubernetes", true],
    ["synonym ml -> machine learning", "worked in machine learning research", "ML", true],
    ["synonym reverse direction", "artificial intelligence research", "AI", true],
    ["word boundary protects reactive", "built reactive dashboards", "React", false],
    ["multi-word term matches phrase", "our man for machine learning", "machine learning", true],
    ["indonesian text matches", "pengalaman dengan golang dan postgres", "PostgreSQL", true],
    ["no substring match inside words", "categorization pipelines", "cat", false],
    ["numeric token with dot", "2.5 seconds faster", "2.5", true],
    ["nodejs alias equals node.js", "nodejs has been my stack", "Node.js", true],
  ])("%s", (_name, text, term, expected) => {
    expect(matchesTerm(normalizeText(text), term)).toBe(expected);
  });
});

describe("filterKeywordsAgainstJD", () => {
  const jd = "Seeking a backend engineer with Go, PostgreSQL, Docker and Kubernetes. C++ templates a plus.";

  it("keeps keywords present in the job description", () => {
    const kept = filterKeywordsAgainstJD(
      [
        { term: "PostgreSQL", weight: 3 },
        { term: "Docker", weight: 2 },
        { term: "C++", weight: 1 },
      ],
      jd,
    );
    expect(kept.map((k) => k.term).sort()).toEqual(["C++", "Docker", "PostgreSQL"]);
  });

  it("drops every keyword the job description does not contain", () => {
    const kept = filterKeywordsAgainstJD(
      [
        { term: "PostgreSQL", weight: 3 },
        { term: "GraphQL", weight: 1 },
        { term: "Teamwork", weight: 1 },
      ],
      jd,
    );
    expect(kept).toEqual([{ term: "PostgreSQL", weight: 3 }]);
  });

  it("dedupes case-insensitive duplicates", () => {
    const kept = filterKeywordsAgainstJD(
      [
        { term: "PostgreSQL", weight: 3 },
        { term: "postgresql", weight: 1 },
      ],
      jd,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].weight).toBe(3);
  });

  it("caps the surviving keywords at 25", () => {
    const words = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const keywords: Term[] = words.map((w) => ({ term: w, weight: 1 }));
    const kept = filterKeywordsAgainstJD(keywords, words.join(" "));
    expect(kept).toHaveLength(25);
    expect(kept[0].term).toBe("s0");
    expect(kept[24].term).toBe("s24");
  });

  it("returns an empty list rather than throwing on empty input", () => {
    expect(filterKeywordsAgainstJD([], jd)).toEqual([]);
  });
});

describe("computeCoverage", () => {
  const resume = "Portfolio: sharded PostgreSQL writes, 3-node Kubernetes clusters, C++ hot paths, node.js gateways.";

  it("weights required terms higher (weight 3 vs weight 1)", () => {
    const score = computeCoverage(resume, [
      { term: "PostgreSQL", weight: 3 },
      { term: "GraphQL", weight: 1 },
    ]);
    // 3 of 4 -> 75.
    expect(score.score).toBe(75);
    expect(score.matched.map((k) => k.term)).toEqual(["PostgreSQL"]);
    expect(score.missing.map((k) => k.term)).toEqual(["GraphQL"]);
  });

  it("rounds to one decimal place", () => {
    const score = computeCoverage(resume, [
      { term: "PostgreSQL", weight: 2 },
      { term: "GraphQL", weight: 1 },
    ]);
    // 2 of 3 -> 66.7.
    expect(score.score).toBe(66.7);
  });

  it("returns 100 with everything matched and 0 with nothing matched", () => {
    const all: Term[] = [{ term: "PostgreSQL", weight: 2 }, { term: "C++", weight: 1 }];
    expect(computeCoverage(resume, all).score).toBe(100);
    const none: Term[] = [{ term: "COBOL", weight: 2 }, { term: "Fortran", weight: 1 }];
    expect(computeCoverage(resume, none).score).toBe(0);
  });

  it("zero keywords gives score 0 without NaN", () => {
    const score = computeCoverage(resume, []);
    expect(score.score).toBe(0);
    expect(Number.isFinite(score.score)).toBe(true);
    expect(score.matched).toEqual([]);
    expect(score.missing).toEqual([]);
  });

  it("empty resume text scores 0", () => {
    const score = computeCoverage("", [{ term: "Docker", weight: 1 }]);
    expect(score.score).toBe(0);
    expect(score.missing).toHaveLength(1);
  });

  it("indonesian resume text scores by the same rules", () => {
    const id = "Pengalaman membangun API dengan Go dan memantau database PostgreSQL selama 4 tahun.";
    const score = computeCoverage(id, [
      { term: "Go", weight: 2 },
      { term: "PostgreSQL", weight: 2 },
      { term: "Docker", weight: 2 },
    ]);
    // 4 of 6 -> 66.7.
    expect(score.score).toBe(66.7);
  });
});

describe("compareCoverage", () => {
  const original = "Built internal tools with PostgreSQL and scripts.";
  const rewritten = "Built internal tools with PostgreSQL, Docker, and Kubernetes since 2019.";
  const keywords: Term[] = [
    { term: "PostgreSQL", weight: 1 },
    { term: "Docker", weight: 1 },
    { term: "Kubernetes", weight: 1 },
    { term: "GraphQL", weight: 1 },
  ];

  it("reports before, after and the gain", () => {
    const out = compareCoverage(original, rewritten, keywords);
    expect(out.before.score).toBe(25);
    expect(out.after.score).toBe(75);
    expect(out.gain).toBe(50);
  });

  it("lists added and lost terms using the same matching rules", () => {
    const out = compareCoverage(original, rewritten, keywords);
    expect(out.addedTerms.map((t) => t.term).sort()).toEqual(["Docker", "Kubernetes"]);
    expect(out.lostTerms).toEqual([]);
  });

  it("detects a rewrite that lost a term (negative gain)", () => {
    const before = "Shipped PostgreSQL, Docker and Kubernetes work.";
    const after = "Shipped PostgreSQL work.";
    const out = compareCoverage(before, after, [
      { term: "PostgreSQL", weight: 1 },
      { term: "Docker", weight: 1 },
      { term: "Kubernetes", weight: 1 },
    ]);
    expect(out.gain).toBe(-66.7);
    expect(out.addedTerms).toEqual([]);
    expect(out.lostTerms.map((t) => t.term).sort()).toEqual(["Docker", "Kubernetes"]);
  });
});

describe("determinism and performance", () => {
  const keywords: Term[] = [
    { term: "PostgreSQL", weight: 3 },
    { term: "Kubernetes", weight: 2 },
    { term: "C++", weight: 2 },
    { term: "Node.js", weight: 2 },
    { term: "GraphQL", weight: 1 },
  ];

  it("identical inputs produce identical output", () => {
    const a = computeCoverage("services on PostgreSQL and C++, deployed on k8s or kubernetes.", keywords);
    const b = computeCoverage("services on PostgreSQL and C++, deployed on k8s or kubernetes.", keywords);
    expect(a).toEqual(b);
    const wa = computeCoverage("services on PostgreSQL and C++", keywords);
    const wb = computeCoverage("services on PostgreSQL and C++", keywords);
    expect(wa).toEqual(wb);
  });

  it("20k chars stay under 50 ms", () => {
    const long = " Designed PostgreSQL services, C++ engines, node.js gateways and Kubernetes clusters. ".repeat(255);
    expect(long.length).toBeGreaterThanOrEqual(20000);
    const t1 = performance.now();
    const run1 = computeCoverage(long, keywords);
    const t2 = performance.now();
    const run2 = computeCoverage(long, keywords);
    const t3 = performance.now();
    expect(t2 - t1).toBeLessThan(50);
    expect(t3 - t2).toBeLessThan(50);
    // And it is stable across runs.
    expect(run2).toEqual(run1);
  });
});
