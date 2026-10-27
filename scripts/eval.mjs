// Evaluation harness: runs the REAL model on fixture resume/job pairs and
// reports the average unverified-detail count and the average score delta
// (rewritten score minus original match score).
//
// Usage: npm run eval   (requires OPENAI_API_KEY; reads the same .env.local)
// Cost note: 5 fixtures x 2 OpenAI calls. Not run in CI. See docs/EVALUATION.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader so `npm run eval` works without extra deps.
try {
  const envPath = path.join(root, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
} catch {
  // ignore
}

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. Fill .env.local first (never commit it).");
  process.exit(1);
}

const { analyzeResume, scoreResume } = await import("./lib-loader.mjs").then((m) => ({
  analyzeResume: m.loadLib("openai").analyzeResume,
  scoreResume: m.loadLib("openai").scoreResume,
}));
const { findUnverifiedDetails } = await import("./lib-loader.mjs").then((m) => ({
  findUnverifiedDetails: m.loadLib("fabrication-guard").findUnverifiedDetails,
}));

const FIXTURES = [1, 2, 3, 4, 5];
const fixturesDir = path.join(root, "tests", "fixtures");

async function runFixture(i) {
  const resume = fs.readFileSync(path.join(fixturesDir, `resume${i}.txt`), "utf8");
  const job = fs.readFileSync(path.join(fixturesDir, `job${i}.txt`), "utf8");
  const raw = await analyzeResume(resume, job);
  const parsed = JSON.parse(raw);
  const before = Number(parsed.matchScore);
  const rewritten = String(parsed.rewrittenResume || "");
  const unverified = findUnverifiedDetails(resume, rewritten, job);
  let after = null;
  let afterError = null;
  try {
    after = await scoreResume(rewritten, job);
  } catch (e) {
    afterError = String(e instanceof Error ? e.message : e);
  }
  return { i, before, after, afterError, unverified };
}

const rows = [];
for (const i of FIXTURES) {
  process.stdout.write(`fixture ${i}... `);
  try {
    const r = await runFixture(i);
    rows.push(r);
    console.log(
      `score ${r.before}${r.after != null ? ` -> ${r.after}` : ` (after unavailable: ${r.afterError})`}, unverified ${r.unverified.length}`,
    );
  } catch (e) {
    console.log(`failed: ${String(e instanceof Error ? e.message : e)}`);
  }
}

if (rows.length === 0) {
  console.error("No fixture completed; nothing to report.");
  process.exit(1);
}

const avgUnverified = rows.reduce((s, r) => s + r.unverified.length, 0) / rows.length;
const withAfter = rows.filter((r) => r.after != null);
const avgDelta =
  withAfter.length > 0
    ? withAfter.reduce((s, r) => s + (r.after - r.before), 0) / withAfter.length
    : null;

console.log("\nSummary");
console.log(`fixtures completed: ${rows.length}/${FIXTURES.length}`);
console.log(`average unverified details: ${avgUnverified.toFixed(2)}`);
if (avgDelta != null) console.log(`average score delta (rewritten vs original): ${avgDelta.toFixed(2)}`);
console.log(
  "\nInterpretation: the guard is a heuristic verifier; occasional false positives are expected.",
);
console.log("Do not commit per-run results as guarantees; numbers vary between model runs.");
