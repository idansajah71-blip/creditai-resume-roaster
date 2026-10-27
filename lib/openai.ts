import { analysisJsonSchema } from "@/lib/ai-schema";
import { languageName, type Lang } from "@/lib/language";

const TIMEOUT_MS = 60000;

export type AnalyzeOptions = {
  language?: Lang;
  // Retry instruction: details the rewrite must not introduce.
  avoidDetails?: string[];
};

export async function analyzeResume(
  resume: string,
  jobDescription: string,
  options: AnalyzeOptions = {},
): Promise<string> {
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
- rewrittenResume: rewritten resume preserving actual experience (never fabricate)
Every fact in the rewritten resume must come from the original resume. Do not invent companies, dates, numbers, or achievements.`;

  const langLine = options.language
    ? `Write every free-text field (roast, strengths, weaknesses, evidence, advice, rewrittenResume) in ${languageName(options.language)}.`
    : "";

  const avoidLine =
    options.avoidDetails && options.avoidDetails.length > 0
      ? `STRICT rewrite: your previous draft introduced facts that do not exist in the original resume. Remove them and any similar inventions. Never mention: ${options.avoidDetails.join("; ")}.`
      : "";

  const systemPrompt = [system, langLine, avoidLine].filter(Boolean).join("\n");

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
          { role: "system", content: systemPrompt },
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
            { role: "system", content: systemPrompt },
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

const scoreJsonSchema = {
  name: "resume_score",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      matchScore: { type: "integer", minimum: 0, maximum: 100 },
    },
    required: ["matchScore"],
  },
};

// Cheap second pass: score the rewritten resume with the same rubric.
// Throws on failure; callers decide whether to omit the delta silently.
export async function scoreResume(rewritten: string, jobDescription: string): Promise<number> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `You score a resume against a job description from 0 to 100 (100 = perfect fit every requirement met with strong evidence). Judge only the resume text itself. Return only {"matchScore": <int>}.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
          { role: "system", content: system },
          { role: "user", content: `Resume:\n${rewritten}\n\nJob Description:\n${jobDescription}` },
        ],
        response_format: { type: "json_schema", json_schema: scoreJsonSchema },
        temperature: 0,
        max_tokens: 20,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("openai_http_error");
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("openai_empty");
    const parsed = JSON.parse(content) as { matchScore?: unknown };
    const score = Number(parsed.matchScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("openai_bad_score");
    return Math.round(score);
  } finally {
    clearTimeout(timer);
  }
}
