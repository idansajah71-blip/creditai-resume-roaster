import { analysisJsonSchema } from "@/lib/ai-schema";

const TIMEOUT_MS = 60000;

export async function analyzeResume(resume: string, jobDescription: string): Promise<string> {
  // Note: resume/jobDescription are inserted into the user message at call time.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `You are an expert resume reviewer and rewriter. Return ONLY valid JSON matching the schema.
Include:
- matchScore: 0-100 integer
- roast: witty but constructive, 3-5 lines
- strengths: exactly 3 evidence-based strengths
- weaknesses: exactly 5 specific weaknesses
- requirementMatches: array of {requirement, status: met|partial|missing, evidence}
- missingKeywords: up to 5 missing keywords
- recommendations: array of {section, advice}
- rewrittenResume: rewritten resume preserving actual experience (never fabricate)`;

  const user = `Resume:\n${resume}\n\nJob Description:\n${jobDescription}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Try structured outputs first.
    let res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: analysisJsonSchema },
        temperature: 0.4,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Fallback to JSON mode.
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });
    }

    if (!res.ok) throw new Error("openai_http_error");
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("openai_empty");
    return content;
  } finally {
    clearTimeout(timer);
  }
}