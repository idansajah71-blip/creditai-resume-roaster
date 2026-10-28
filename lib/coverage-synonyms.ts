// Reviewable synonym map for the deterministic coverage engine (lib/coverage.ts).
// Key: the normalized token, value: the canonical words it stands for.
// Keep it intentionally short: only pairs a resume and a job description
// actually use interchangeably. Java and JavaScript stay distinct on purpose -
// the matcher must never confuse related-but-different technologies, and
// "go" (the English word) is excluded so skill matching cannot hit prose.
export const SYNONYMS: Record<string, string> = {
  js: "javascript",
  nodejs: "node.js",
  k8s: "kubernetes",
  postgres: "postgresql",
  ml: "machine learning",
  ai: "artificial intelligence",
};
