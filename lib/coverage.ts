// Deterministic keyword coverage engine: pure functions, no I/O, no model.
// "Computed by code, not an AI opinion." It measures how much of the job
// description's own wording the resume (or the rewritten resume) actually
// touches, using word-boundary matching with a small documented synonym map
// and simple suffix tolerance. Every step is explainable and reproducible.
import { SYNONYMS } from "@/lib/coverage-synonyms";

export type Term = { term: string; weight: 1 | 2 | 3 };

export type CoverageResult = {
  // Weight-weighted percentage, 1 decimal. 0 when no usable keywords exist.
  score: number;
  matched: Term[];
  missing: Term[];
};

const SUFFIXES = ["es", "s", "ing", "ed"];

// A suffix tolerantly added/removed only on plain alphanumeric tokens:
// "node.js" gains a plural form ("node.jses") that nobody writes, and "c++"
// pluralization would be noise. Documented deliberately.
function suffixable(word: string): boolean {
  return /^[a-z0-9]+$/.test(word) && word.length >= 3;
}

/* Lowercase, unicode-normalize (combining marks stripped so "cafe" works),
   keep alphanumerics plus + # . as token characters (c++, c#, node.js), and
   collapse every other character and whitespace runs to single spaces.
   A trailing "." strips as sentence punctuation ("experience." -> "experience",
   and ellipses vanish) while inner dots stay ("node.js", "2.5").
   "1,200" becomes "1200"; "State-of-the-art" splits into four tokens. */
export function normalizeText(text: string): string {
  const stripped = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  return stripped
    .split(" ")
    .map((w) => w.replace(/\.+$/, ""))
    .filter(Boolean)
    .join(" ");
}

/* Synonym canonicalization at token level, so "JS" and "JavaScript" compare
   equal while "java" and "javascript" never merge. Only used inside the
   matching pipeline; the public normalizeText output stays raw tokens. */
function canonicalTokens(text: string): string[] {
  return text.split(" ").filter(Boolean).map((w) => SYNONYMS[w] ?? w);
}

function canonicalize(text: string): string {
  return canonicalTokens(text).join(" ");
}

function escapeRe(word: string): string {
  return word.replace(/[^a-z0-9]/g, (c) => "\\" + c);
}

// Base form of a keyword token: strip one plural/gerund/past suffix if the
// remainder stays meaningful ("databases" -> "database", "engineering" ->
// "engineer"). The optional suffix group in the pattern adds the tolerance
// back for both directions ("engineer" matches "engineering" and vice versa).
function baseOf(word: string): string {
  for (const s of SUFFIXES) {
    if (word.length - s.length >= 3 && word.endsWith(s)) return word.slice(0, word.length - s.length);
  }
  return word;
}

/* Build the word-boundary pattern for one canonical keyword entry: every
   token anchors to token boundaries (^| sp |$), so "java" never matches
   inside "javascript" and "react" never matches "reactive". */
function patternFor(term: string): RegExp {
  const words = canonicalize(normalizeText(term)).split(" ").filter(Boolean);
  if (words.length === 0) return /$^/; // empty keyword never matches anything
  const parts = words.map((w) => {
    const base = suffixable(w) ? baseOf(w) : w;
    const suffix = suffixable(w) ? "(?:es|s|ing|ed)?" : "";
    return `${escapeRe(base)}${suffix}`;
  });
  return new RegExp(`(?:^| )${parts.join(" ")}(?:$| )`);
}

/* Word-boundary match of a term inside an ALREADY-NORMALIZED text, with
   plural/suffix tolerance and the documented synonym map. */
export function matchesTerm(normalizedText: string, term: string): boolean {
  return patternFor(term).test(" " + canonicalize(normalizedText) + " ");
}

/* Anti-hallucination: drop every keyword whose normalized form does not
   occur in the normalized job description, dedupe (case/punct-insensitive),
   cap at 25. The keyword terms must be copied from the JD wording anyway;
   this is the deterministic backstop. */
export function filterKeywordsAgainstJD(keywords: Term[], jdText: string): Term[] {
  if (keywords.length === 0) return [];
  const canonJd = " " + canonicalize(normalizeText(jdText)) + " ";
  const out: Term[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    if (out.length >= 25) break;
    const key = canonicalize(normalizeText(k.term));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (patternFor(k.term).test(canonJd)) out.push(k);
  }
  return out;
}

/* Weight-weighted coverage percentage of how many keywords the resume text
   touches. Zero keywords -> score 0, no NaN ever. */
export function computeCoverage(resumeText: string, keywords: Term[]): CoverageResult {
  const canonResume = " " + canonicalize(normalizeText(resumeText)) + " ";
  const matched: Term[] = [];
  const missing: Term[] = [];
  let numerator = 0;
  let denominator = 0;
  for (const k of keywords) {
    if (!canonicalize(normalizeText(k.term))) continue; // empty keyword: not scored at all
    const weight = k.weight;
    denominator += weight;
    if (patternFor(k.term).test(canonResume)) {
      numerator += weight;
      matched.push(k);
    } else {
      missing.push(k);
    }
  }
  const score = denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
  return { score, matched, missing };
}

/* Before/after comparison for a rewrite: which keywords the rewrite added,
   which it lost (same matching rules on both sides), and the gain. */
export function compareCoverage(originalText: string, rewrittenText: string, keywords: Term[]) {
  const before = computeCoverage(originalText, keywords);
  const after = computeCoverage(rewrittenText, keywords);
  const beforeKeys = new Set(before.matched.map(termKeyOf));
  const afterKeys = new Set(after.matched.map(termKeyOf));
  const addedTerms = after.matched.filter((t) => !beforeKeys.has(termKeyOf(t)));
  const lostTerms = before.matched.filter((t) => !afterKeys.has(termKeyOf(t)));
  const gain = Math.round((after.score - before.score) * 10) / 10;
  return { before, after, gain, addedTerms, lostTerms };
}

function termKeyOf(t: Term): string {
  return canonicalize(normalizeText(t.term));
}
