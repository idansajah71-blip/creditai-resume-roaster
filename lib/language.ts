// Simple heuristic language detection for resumes: Indonesian (id) vs English (en).
// No dependency: counts occurrences of common function/content words and compares.
// Ties and short/ambiguous inputs default to English (the historical behavior).

export type Lang = "en" | "id";

const ID_MARKERS = [
  "dan", "yang", "dengan", "untuk", "pada", "dalam", "akan", "telah",
  "dari", "saya", "kami", "pengalaman", "tanggung", "jawab",
  "kerja", "perusahaan", "klien", "tahun", "bulan", "mengembangkan",
  "melakukan", "berpengalaman", "bertanggung", "mempunyai", "karyawan",
  "desain", "membuat", "proyek",
];

const EN_MARKERS = [
  "the", "and", "with", "for", "from", "our", "have", "has",
  "work", "experience", "project", "team", "managed", "developed",
  "responsible", "using", "years", "company", "client", "designed",
  "built", "drove", "across", "improved",
];

export function detectLanguage(text: string): Lang {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2);

  let idHits = 0;
  let enHits = 0;
  for (const t of tokens) {
    if (ID_MARKERS.includes(t)) idHits++;
    if (EN_MARKERS.includes(t)) enHits++;
  }
  return idHits > enHits ? "id" : "en";
}

export function languageName(lang: Lang): string {
  return lang === "id" ? "Indonesian" : "English";
}
