// Token accounting and a deliberately simple cost estimate.
//
// OpenAI returns usage on every Chat Completions response. We aggregate it per
// analysis and persist the prompt/completion counters on ai_jobs, so the
// public system-status card can show an average estimated cost instead of a
// hand-written claim. Prices are env-configurable because list prices change;
// the defaults match the documented gpt-4o-mini list price.
export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export const EMPTY_USAGE: TokenUsage = Object.freeze({
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
});

function nonNegative(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* Normalize an API usage object without trusting its shape. Missing counters
   become zero; total_tokens is derived when the API omits it. */
export function normalizeUsage(value: unknown): TokenUsage {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const prompt = nonNegative(raw.prompt_tokens);
  const completion = nonNegative(raw.completion_tokens);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: nonNegative(raw.total_tokens) || prompt + completion,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  };
}

export function openaiChatUrl(env: Record<string, string | undefined> = process.env): string {
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

export function currentModel(env: Record<string, string | undefined> = process.env): string {
  return env.OPENAI_MODEL || "gpt-4o-mini";
}

export function inputPricePerMTok(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.OPENAI_INPUT_USD_PER_MTOK);
  return Number.isFinite(n) && n >= 0 ? n : 0.15;
}

export function outputPricePerMTok(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.OPENAI_OUTPUT_USD_PER_MTOK);
  return Number.isFinite(n) && n >= 0 ? n : 0.6;
}

/* Estimated USD for one model call (or an aggregated analysis). This is a
   list-price estimate, not an invoice: cached-token discounts and price
   changes are out of scope. */
export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  env: Record<string, string | undefined> = process.env,
): number {
  const prompt = nonNegative(promptTokens);
  const completion = nonNegative(completionTokens);
  return (
    (prompt / 1_000_000) * inputPricePerMTok(env) +
    (completion / 1_000_000) * outputPricePerMTok(env)
  );
}
