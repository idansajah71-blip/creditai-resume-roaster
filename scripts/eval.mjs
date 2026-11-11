// Evaluation harness: runs the REAL analysis pipeline on fixture resume/job
// pairs and writes docs/EVALUATION.md from the measured output.
//
// Usage: npm run eval   (requires OPENAI_API_KEY; reads the same .env.local)
// Cost note: one real analysis per fixture (the pipeline may make a retry and
// a scoring call). Never run this in CI. The generated file is the only place
// where evaluation numbers should be quoted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLib } from "./lib-loader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "docs", "EVALUATION.md");
const fixturesDir = path.join(root, "tests", "fixtures", "guarantee");
const manifestPath = path.join(fixturesDir, "manifest.json");

// Minimal .env.local loader so `npm run eval` works without extra deps.
try {
  const envPath = path.join(root, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  }
} catch {
  // ignore
}

const date = new Date().toISOString().slice(0, 10);
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const hasKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());

const NOT_PROVEN = `## What this does not prove

This is a small sample of fixture pairs, so the results describe these examples and are not a statistical estimate of performance on the population of resumes. Coverage is a heuristic lexical measure over model-extracted job keywords; it does not judge whether the rewrite is accurate, well written, or persuasive to a recruiter. The synonym map is intentionally short, so equivalent wording outside the map is scored as missing. A met guarantee means the deterministic bar passed for that fixture; it does not prove the rewrite is factually complete, that the model will behave the same on other inputs, or that any user will get an interview.`;

const METHOD = `## Method

Each pair is run through the same \`runAnalysisPipeline\` used by \`POST /api/ai/analyze\`: real model calls, schema validation, the fabrication retry, deterministic keyword coverage, the guarantee retry, and the second scoring pass. Token counts are summed from the API \`usage\` field. Cost is a list-price estimate, not an invoice. The harness is never run in CI.`;

function writePending() {
  const content = `# Evaluation

- Date: ${date}
- Model: \`${model}\`
- Status: Evaluation pending

The harness has not been run against the OpenAI API in this environment. Set \`OPENAI_API_KEY\` and run \`npm run eval\` to replace this file with measured results.

${METHOD}

${NOT_PROVEN}
`;
  fs.writeFileSync(outPath, content, "utf8");
  console.log(`No OPENAI_API_KEY set; wrote pending evaluation to ${path.relative(root, outPath)}.`);
}

function fmtInt(n) {
  return Number(n).toLocaleString("en-US");
}

function fmtUsd(n) {
  return `$${Number(n).toFixed(6)}`;
}

function writeFailure(rows, errors) {
  const content = `# Evaluation

- Date: ${date}
- Model: \`${model}\`
- Status: Evaluation failed

The harness ran, but no fixture completed. This file intentionally contains no result numbers.

## Errors

${errors.map((e) => `- \`${e}\`: ${e.message}`).join("\n")}

${METHOD}

${NOT_PROVEN}
`;
  fs.writeFileSync(outPath, content, "utf8");
  console.log(`No fixture completed; wrote failure report to ${path.relative(root, outPath)}.`);
  console.log(`Pairs attempted: ${rows.length}`);
}

if (!hasKey) {
  writePending();
  process.exit(0);
}

const { runAnalysisPipeline } = loadLib("analysis-pipeline");
const { guaranteeThresholds } = loadLib("guarantee");
const { estimateCostUsd } = loadLib("model-cost");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const pairs = Array.isArray(manifest.pairs) ? manifest.pairs : [];
if (pairs.length < 8) {
  console.error(`Expected at least 8 fixture pairs, found ${pairs.length}.`);
  process.exit(1);
}

const thresholds = guaranteeThresholds();
const rows = [];

for (const pair of pairs) {
  process.stdout.write(`${pair.id}... `);
  try {
    const resume = fs.readFileSync(path.join(fixturesDir, pair.resume), "utf8");
    const job = fs.readFileSync(path.join(fixturesDir, pair.job), "utf8");
    const analysis = await runAnalysisPipeline(resume, job, { thresholds });
    const { coverage, usage, guarantee, result } = analysis;
    const cost = estimateCostUsd(usage.prompt_tokens, usage.completion_tokens);
    rows.push({
      pair,
      coverage,
      usage,
      guarantee,
      unverified: Array.isArray(result.unverifiedDetails) ? result.unverifiedDetails.length : 0,
      cost,
    });
    console.log(
      `coverage ${coverage.before} -> ${coverage.after} (${coverage.gain >= 0 ? "+" : ""}${coverage.gain}), ` +
        `unverified ${rows[rows.length - 1].unverified}, ${guarantee.met ? "met" : "not met"}, ${fmtUsd(cost)}`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const usage = e && typeof e === "object" && "usage" in e ? e.usage : null;
    const cost = usage ? estimateCostUsd(usage.prompt_tokens, usage.completion_tokens) : null;
    rows.push({ pair, error: message, usage, cost });
    console.log(`failed: ${message}`);
  }
}

const completed = rows.filter((r) => !r.error);
if (completed.length === 0) {
  writeFailure(
    rows,
    rows.map((r) => ({ name: r.pair.id, message: r.error })),
  );
  process.exit(1);
}

const metCount = completed.filter((r) => r.guarantee.met).length;
const avgGain =
  completed.reduce((sum, r) => sum + r.coverage.gain, 0) / completed.length;
const avgCost = completed.reduce((sum, r) => sum + r.cost, 0) / completed.length;

const tableRows = rows
  .map((r) => {
    if (r.error) {
      return `| \`${r.pair.id}\` | — | — | — | — | error | — | — |`;
    }
    const { coverage, usage, guarantee, unverified, cost } = r;
    const gain = `${coverage.gain >= 0 ? "+" : ""}${coverage.gain.toFixed(1)}`;
    return `| \`${r.pair.id}\` | ${coverage.before.toFixed(1)} | ${coverage.after.toFixed(1)} | ${gain} | ${unverified} | ${
      guarantee.met ? "met" : "not met"
    } | ${fmtInt(usage.prompt_tokens)} / ${fmtInt(usage.completion_tokens)} / ${fmtInt(
      usage.total_tokens,
    )} | ${fmtUsd(cost)} |`;
  })
  .join("\n");

const errorSection =
  completed.length === rows.length
    ? ""
    : `\n## Failed pairs\n\n${rows
        .filter((r) => r.error)
        .map((r) => `- \`${r.pair.id}\`: ${r.error}`)
        .join("\n")}\n`;

const content = `# Evaluation

- Date: ${date}
- Model: \`${model}\`

## Results

| Pair | Coverage before | Coverage after | Gain | Unverified details | Guarantee outcome | Tokens used (prompt / completion / total) | Estimated cost per analysis |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
${tableRows}

## Summary

- Pairs completed: ${completed.length}/${rows.length}
- Guarantee met: ${metCount}/${completed.length}
- Average coverage gain: ${avgGain.toFixed(1)} points
- Average estimated model cost per analysis: ${fmtUsd(avgCost)}
${errorSection}
${METHOD}

${NOT_PROVEN}
`;

fs.writeFileSync(outPath, content, "utf8");
console.log(`\nWrote ${path.relative(root, outPath)}.`);
console.log(
  `Pairs ${completed.length}/${rows.length}; guarantee met ${metCount}/${completed.length}; average cost ${fmtUsd(avgCost)}.`,
);
