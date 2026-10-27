# AI Tools Used

## In the product (runtime)

- OpenAI Chat Completions API, model configurable via `OPENAI_MODEL` (default `gpt-4o-mini`):
  - Resume analysis and rewrite (`lib/openai.ts` -> `analyzeResume`): structured JSON output via a strict JSON schema, validated with Zod (`lib/ai-schema.ts`).
  - Rewrite scoring (`scoreResume`): second, cheap pass (temperature 0, max_tokens 20) that estimates the after score for the "X -> Y" display.
  - Refund agent (`lib/refund-agent.ts` -> `decideRefund`): proposes only a decision + message inside deterministic guardrails; amounts and eligibility are pure TypeScript (`lib/refund-math.ts`).
- The fabrication guard (`lib/fabrication-guard.ts`) and language detection (`lib/language.ts`) are deterministic code, not AI.

No AI-generated content reaches end users except the validated model output above (schema-parsed; free-text fields render as written by the model per its prompt contract).

## In development (build time)

- OpenCode assistant (GLM): code scaffolding, refactors, test generation (62 vitest tests), migration/SQL drafting under review, and documentation drafting for README/DEVPOST/security docs.
- No CI automation depends on AI at build time; tests and builds are deterministic.

## Operational notes

- The eval harness (`npm run eval`, 5 fixtures) calls the same `lib/openai.ts` code path with a real key; it is manual, costs real API money, and is not wired into CI.
- Model identity and prompts are documented in README "How AI is used" so reviewers can audit the exact instructions.
