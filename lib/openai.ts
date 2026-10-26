const TIMEOUT_MS = 60000;

export async function analyzeResume(resume: string, jobDescription: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_key");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `You are an expert resume reviewer and rewriter. Return ONLY valid JSON matching this schema:
{
  "matchScore": number 0-100,
  "strengths": string[3],
  "weaknesses": string[5],
  "recommendations": [{"section": string, "advice": string}],
  "rewrittenResume": string
}
Do not include markdown or extra text. Preserve the user's actual experience and qualifications in rewrittenResume; do not fabricate.`;

  const user = `Resume:\n${resume}\n\nJob Description:\n${jobDescription}`;

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
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
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