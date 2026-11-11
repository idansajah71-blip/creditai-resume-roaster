# Evaluation

- Date: 2026-10-29
- Model: `gemini-3.5-flash-lite`

## Results

| Pair | Coverage before | Coverage after | Gain | Unverified details | Guarantee outcome | Tokens used (prompt / completion / total) | Estimated cost per analysis |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| `good-backend` | 75.0 | 100.0 | +25.0 | 1 | not met | 1,167 / 2,399 / 3,566 | $0.000000 |
| `good-data-analyst` | 62.5 | 91.7 | +29.2 | 0 | not met | 1,139 / 2,336 / 3,475 | $0.000000 |
| `good-frontend` | 90.5 | 90.5 | +0.0 | 0 | met | 1,083 / 2,091 / 3,174 | $0.000000 |
| `weak-marketing-to-data` | 0.0 | 0.0 | +0.0 | 0 | not met | 1,043 / 1,787 / 2,830 | $0.000000 |
| `weak-junior-to-senior` | 0.0 | 0.0 | +0.0 | 0 | not met | 995 / 1,848 / 2,843 | $0.000000 |
| `keyword-stuffing` | 70.8 | 70.8 | +0.0 | 2 | not met | 954 / 2,631 / 3,585 | $0.000000 |
| `very-short` | 0.0 | 0.0 | +0.0 | 0 | not met | 781 / 1,638 / 2,419 | $0.000000 |
| `indonesian-english-jd` | 52.9 | 82.4 | +29.5 | 0 | not met | 1,190 / 2,606 / 3,796 | $0.000000 |

## Summary

- Pairs completed: 8/8
- Guarantee met: 1/8
- Average coverage gain: 10.5 points
- Average estimated model cost per analysis: $0.000000

## Method

Each pair is run through the same `runAnalysisPipeline` used by `POST /api/ai/analyze`: real model calls, schema validation, the fabrication retry, deterministic keyword coverage, the guarantee retry, and the second scoring pass. Token counts are summed from the API `usage` field. Cost is a list-price estimate, not an invoice. The harness is never run in CI.

## What this does not prove

This is a small sample of fixture pairs, so the results describe these examples and are not a statistical estimate of performance on the population of resumes. Coverage is a heuristic lexical measure over model-extracted job keywords; it does not judge whether the rewrite is accurate, well written, or persuasive to a recruiter. The synonym map is intentionally short, so equivalent wording outside the map is scored as missing. A met guarantee means the deterministic bar passed for that fixture; it does not prove the rewrite is factually complete, that the model will behave the same on other inputs, or that any user will get an interview.
