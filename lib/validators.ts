import { z } from "zod";

export const createOrderSchema = z.object({
  packageId: z.enum(["credits_10", "credits_50", "credits_100"]),
});

export const captureSchema = z.object({}).passthrough();