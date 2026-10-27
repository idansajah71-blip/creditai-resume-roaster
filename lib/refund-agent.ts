import { z } from "zod";

// Refund agent: "AI proposes, code disposes."
// Deterministic checks (limit, unused credits, 14-day window, allocation)
// have already approved the refund and set the amount before this runs, and
// denials are only ever deterministic. The model's only job is to write the
// short customer-facing message; it can never deny the request or change
// any amount (server rights own the decision and the numbers).
export type RefundAgentFacts = {
  creditsRequested: number;
  refundableCredits: number;
  daysSincePurchase: number;
  creditsUsed: number;
  previousRefunds: number;
  reason: string;
};

export const REFUND_FALLBACK_MESSAGE =
  "Your refund request has been approved and processed. The refunded " +
  "amount should appear on your PayPal account shortly.";

const messageSchema = z.object({
  message: z.string().min(1).max(600),
});

const jsonSchema = {
  name: "refund_message",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
  },
};

const SYSTEM = `You are the refund assistant for CreditAI Resume Roaster.
The refund has already been approved by deterministic checks; you only write the customer-facing explanation.
Rules you must never break:
- Base the message only on the facts provided. Do not invent policy, numbers, or promises.
- Write a short, friendly explanation (2-3 sentences, max 600 chars) addressed to the customer. Do not include emojis.`;

export async function refundAssistantMessage(facts: RefundAgentFacts): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const user = [
    `Facts:`,
    `Approved refund (credits): ${facts.creditsRequested}`,
    `Refundable credits (deterministic cap): ${facts.refundableCredits}`,
    `Days since purchase (oldest order involved): ${facts.daysSincePurchase}`,
    `Estimated credits used so far: ${facts.creditsUsed}`,
    `Refund requests in the last 30 days: ${facts.previousRefunds}`,
    ``,
    `Customer's reason: ${facts.reason}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: jsonSchema },
        temperature: 0.2,
        max_tokens: 300,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("openai_http_error");
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("openai_empty");
    const parsed = messageSchema.parse(JSON.parse(content));
    return parsed.message;
  } finally {
    clearTimeout(timer);
  }
}
