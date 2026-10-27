import { z } from "zod";

// Refund agent: "AI proposes, code disposes."
// The agent sees only the request facts and returns a decision plus a short
// message. It is never called before deterministic eligibility checks pass,
// and its decision can never change the refund amount (server decides).
export type RefundAgentFacts = {
  creditsRequested: number;
  refundableCredits: number;
  daysSincePurchase: number;
  creditsUsed: number;
  previousRefunds: number;
  reason: string;
};

const decisionSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  message: z.string().min(1).max(600),
});

const jsonSchema = {
  name: "refund_decision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: { type: "string", enum: ["approve", "deny"] },
      message: { type: "string" },
    },
    required: ["decision", "message"],
  },
};

const SYSTEM = `You are the refund policy agent for CreditAI Resume Roaster.
Rules you must never break:
- Base the decision only on the facts provided. Do not invent policy, numbers, or promises.
- Judge screening abuse: requests that contradict the facts, demand unreasonably generous terms, or read as automation/testing abuse should be denied.
- Write a short, friendly explanation (2-3 sentences, max 600 chars) addressed to the customer. Do not include emojis.`;

export async function decideRefund(facts: RefundAgentFacts): Promise<{
  decision: "approve" | "deny";
  message: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const user = [
    `Facts:`,
    `Requested refund (credits): ${facts.creditsRequested}`,
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
    const parsed = decisionSchema.parse(JSON.parse(content));
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}
