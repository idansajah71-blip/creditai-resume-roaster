# Evaluation

The claim we make on the README is "the resume tool that proves its claims".
This harness produces the two numbers behind that claim:

- **average unverified details** reported by the deterministic fabrication guard
  (`lib/fabrication-guard.ts`) across the fixture set.
- **average score delta**: match score of the original resume vs a real second
  OpenAI scoring pass on the rewritten resume (`scoreResume`).

## How to run

Requires `OPENAI_API_KEY` in `.env.local` (same file the app uses):

```
npm run eval
```

- 5 fixture pairs live in `tests/fixtures/` (`resume1..5.txt`, `job1..5.txt`).
  Three are English, two are Indonesian.
- Each fixture makes 2 model calls (analysis + scoring): roughly 15k-25k tokens.
- Not run in CI. Fill in the OpenAI cloud spend limit before running.

## Interpretation

- `unverified` counts heuristic flags; the guard is deterministic but wobbly on
  sentence-capitalization noise, so small counts (0-1) are practically "clean".
- The delta is an AI estimate measured twice on the same rubric; it varies
  between runs. Report ranges, never point guarantees.
- If a fixture fails (rate limit, timeout) it is skipped and the summary uses
  completed rows only.

## Method notes

- The eval calls the same `lib/openai.ts` prompt code (loaded through
  `scripts/lib-loader.mjs`, which transpiles the TS at runtime), so numbers
  track what the product actually does.
- Nothing in this file is committed as a result set. Run it yourself to
  reproduce current numbers before writing claims.
