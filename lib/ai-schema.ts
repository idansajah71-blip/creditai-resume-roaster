import { z } from "zod";

// Shared keyword-entry contract with lib/coverage.ts (Term).
export const jdKeywordSchema = z.object({
  term: z.string().min(1).max(40),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const analysisResultSchema = z.object({
  matchScore: z.number().int().min(0).max(100),
  roast: z.string().min(1),
  strengths: z.array(z.string().min(1)).length(3),
  weaknesses: z.array(z.string().min(1)).length(5),
  requirementMatches: z.array(
    z.object({
      requirement: z.string().min(1),
      status: z.enum(["met", "partial", "missing"]),
      evidence: z.string().min(1),
    }),
  ).min(1),
  missingKeywords: z.array(z.string().min(1)).max(5),
  recommendations: z.array(
    z.object({
      section: z.string().min(1),
      advice: z.string().min(1),
    }),
  ).min(1),
  rewrittenResume: z.string().min(1),
  // The most important job-description terms, weight 1-3 by importance.
  // Consumed by lib/coverage.ts; scored deterministically by code afterwards.
  jdKeywords: z.array(jdKeywordSchema).max(25).optional(),
  // Server-derived optional fields (never produced by the model itself).
  estimatedAfterScore: z.number().int().min(0).max(100).optional(),
  unverifiedDetails: z.array(z.string()).optional(),
  language: z.enum(["en", "id"]).optional(),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const analysisJsonSchema = {
  name: "resume_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      matchScore: { type: "integer", minimum: 0, maximum: 100 },
      roast: { type: "string" },
      strengths: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      weaknesses: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 },
      requirementMatches: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            requirement: { type: "string" },
            status: { type: "string", enum: ["met", "partial", "missing"] },
            evidence: { type: "string" },
          },
          required: ["requirement", "status", "evidence"],
        },
      },
      missingKeywords: { type: "array", items: { type: "string" }, maxItems: 5 },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            section: { type: "string" },
            advice: { type: "string" },
          },
          required: ["section", "advice"],
        },
      },
      rewrittenResume: { type: "string" },
      jdKeywords: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            term: { type: "string" },
            weight: { type: "integer", enum: [1, 2, 3] },
          },
          required: ["term", "weight"],
        },
      },
    },
    required: [
      "matchScore",
      "roast",
      "strengths",
      "weaknesses",
      "requirementMatches",
      "missingKeywords",
      "recommendations",
      "rewrittenResume",
      "jdKeywords",
    ],
  },
};