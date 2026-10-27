import { z } from "zod";

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
    ],
  },
};