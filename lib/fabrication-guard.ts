// Fabrication guard (deterministic, never calls the AI).
// "The resume tool that proves its claims": find details in the rewritten
// resume that do not exist in the original.
//
// What counts as a detail:
//   - numbers with units ("3 years", "5 tahun", "12 people")
//   - percentages ("40%"), money ("$1,200"), multipliers ("2x")
//   - years ("2019"), and capitalized multi-word tokens
//     (company / product / institution names, e.g. "Acme Corp",
//     "Real Time Dashboards").
//
// Job description exception (documented, deliberately simple):
//   a detail that also appears in the job description is NOT reported when it
//   occurs on a "skills context" line, i.e. a line mentioning skills,
//   requirements, technologies, stack, "must have", "proficient in",
//   "experience with", "familiar with" or "tools". Elsewhere in the JD
//   (e.g. inside company names, titles or prose) it stays flagged.

export type DetailKind = "number" | "percent" | "money" | "year" | "name";

type Candidate = { text: string; kind: DetailKind };

const SKILLS_CONTEXT_LINE =
  /\bskills?\b|\brequirements?\b|\btechnolog|\bstack\b|\bmust[- ]have\b|\bproficient\b|\bexperience with\b|\bfamiliar\b|\btools\b/i;

// Leading words that often start capitalized sentences, not proper names.
const GENERIC_WORDS = new Set([
  "the", "this", "we", "our", "i", "it", "in", "as", "at", "for",
  "with", "during", "not", "but", "and", "if", "while", "when",
]);

// A capitalized run is too long to be a product/institution name.
const MAX_NAME_WORDS = 6;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // 1,200 -> 1200
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of cands) {
    const key = normalize(c.text) + "|" + c.kind;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

function extractCandidates(rewritten: string): Candidate[] {
  const cands: Candidate[] = [];

  const percent = rewritten.match(/\b\d+(?:[.,]\d+)?\s*%/g) || [];
  for (const m of percent) cands.push({ text: m.replace(/\s+/g, ""), kind: "percent" });

  const money = rewritten.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || [];
  for (const m of money) cands.push({ text: m.replace(/\s+/g, ""), kind: "money" });

  const unit =
    String.raw`(?:years?|yrs|months?|days?|weeks?|hours?|people|users?|customers?|clients?|members?|engineers?|teams?|projects?|tahun|bulan|hari|jam|orang|pengguna|klien|anggota|proyek)`;
  const quantity = rewritten.match(new RegExp(String.raw`\b\d+(?:[.,]\d+)?\s*` + unit + String.raw`\b`, "gi")) || [];
  for (const m of quantity) cands.push({ text: m.replace(/\s+/g, " "), kind: "number" });

  const multipliers = rewritten.match(/\b\d+\s?[x]\b/gi) || [];
  for (const m of multipliers) cands.push({ text: m.replace(/\s+/g, ""), kind: "number" });

  const years = rewritten.match(/\b(?:19|20)\d{2}\b/g) || [];
  for (const m of years) cands.push({ text: m, kind: "year" });

  const names = rewritten.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+\b/g) || [];
  for (const originalText of names) {
    const words = originalText.split(/\s+/);
    // Drop leading generic words (sentence starts), keep at least 2 words.
    const trimmed = [...words];
    while (trimmed.length > 2 && GENERIC_WORDS.has(trimmed[0].toLowerCase())) trimmed.shift();
    if (GENERIC_WORDS.has(trimmed[0].toLowerCase())) continue;
    if (trimmed.length < 2 || trimmed.length > MAX_NAME_WORDS) continue;
    cands.push({ text: trimmed.join(" "), kind: "name" });
  }

  return cands;
}

export function findUnverifiedDetails(
  original: string,
  rewritten: string,
  jobDescription?: string,
): string[] {
  const normOriginal = normalize(original);
  if (!normOriginal) return [];

  const jdLines = (jobDescription || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const unverified: string[] = [];
  for (const cand of dedupe(extractCandidates(rewritten))) {
    const key = normalize(cand.text);
    if (normOriginal.includes(key)) continue; // present in the original resume

    if (jobDescription) {
      const jdLine = jdLines.find(
        (l) => normalize(l).includes(key) || normalize(l).includes(key.replace(/\$/g, "")),
      );
      if (jdLine && SKILLS_CONTEXT_LINE.test(jdLine)) continue; // skills echo, allowed
    }

    unverified.push(cand.text);
  }
  return unverified;
}
