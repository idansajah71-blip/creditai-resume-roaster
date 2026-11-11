import { describe, it, expect } from "vitest";
import {
  addUsage,
  estimateCostUsd,
  normalizeUsage,
  type TokenUsage,
} from "@/lib/model-cost";

describe("token usage accounting", () => {
  it("normalizes a missing or malformed API usage object to zeros", () => {
    expect(normalizeUsage(undefined)).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
    expect(normalizeUsage({ prompt_tokens: -5, completion_tokens: "oops" })).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
  });

  it("derives total_tokens when the API omits it", () => {
    expect(normalizeUsage({ prompt_tokens: 120, completion_tokens: 30 })).toEqual({
      prompt_tokens: 120,
      completion_tokens: 30,
      total_tokens: 150,
    });
  });

  it("aggregates multiple calls without losing counters", () => {
    const a: TokenUsage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
    const b: TokenUsage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    expect(addUsage(a, b)).toEqual({
      prompt_tokens: 110,
      completion_tokens: 25,
      total_tokens: 135,
    });
  });
});

describe("estimated model cost", () => {
  it("uses the documented gpt-4o-mini defaults when env is absent", () => {
    expect(estimateCostUsd(1_000_000, 1_000_000, {})).toBeCloseTo(0.75, 10);
  });

  it("honors env price overrides", () => {
    expect(
      estimateCostUsd(1_000_000, 1_000_000, {
        OPENAI_INPUT_USD_PER_MTOK: "1",
        OPENAI_OUTPUT_USD_PER_MTOK: "2",
      }),
    ).toBeCloseTo(3, 10);
  });

  it("never returns a negative or NaN cost", () => {
    expect(estimateCostUsd(-10, Number.NaN, {})).toBe(0);
  });
});
