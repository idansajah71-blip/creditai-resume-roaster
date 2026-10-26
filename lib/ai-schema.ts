import { z } from "zod";

export const analysisResultSchema = z.object({
  matchScore: z.number().int().min(0).max(100),
  strengths: z.array(z.string().min(1)).length(3),
  weaknesses: z.array(z.string().min(1)).length(5),
  recommendations: z.array(
    z.object({
      section: z.string().min(1),
      advice: z.string().min(1),
    }),
  ).min(1),
  rewrittenResume: z.string().min(1),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;