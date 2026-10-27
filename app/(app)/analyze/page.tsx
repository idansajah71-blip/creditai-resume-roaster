"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SAMPLE_RESUME, SAMPLE_JOB } from "@/lib/samples";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { Highlight, RedUnderline, MarginNote, Stamp, Rule } from "@/components/ui/annotations";
import { Icon } from "@/components/icons";
import StarterCreditsBanner from "@/components/StarterCreditsBanner";

type Match = { requirement: string; status: "met" | "partial" | "missing"; evidence: string };

type AnalysisResult = {
  matchScore: number;
  roast: string;
  strengths: string[];
  weaknesses: string[];
  requirementMatches: Match[];
  missingKeywords: string[];
  recommendations: { section: string; advice: string }[];
  rewrittenResume: string;
  estimatedAfterScore?: number;
  unverifiedDetails?: string[];
  language?: "en" | "id";
};

type JobRow = { id: string; status: string; result: string | null; created_at: string };

const PROOF_STEPS = ["Reading your resume", "Matching requirements", "Writing the roast", "Rewriting"];

function bandStamp(score: number): { label: string; tone: "red" | "ink" } {
  if (score >= 75) return { label: "Strong match", tone: "ink" };
  if (score >= 50) return { label: "Partial match", tone: "ink" };
  return { label: "Weak match", tone: "red" };
}

function scoreOf(row: JobRow): number | null {
  if (!row.result) return null;
  try {
    const parsed = JSON.parse(row.result) as { matchScore?: number };
    return typeof parsed.matchScore === "number" ? parsed.matchScore : null;
  } catch {
    return null;
  }
}

function relTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* Wrap each unverified detail occurrence in the rewritten resume with a
   red-pen underline. Plain string matching only (case-insensitive), no
   regex on user input; falls back to unmarked text on any failure. */
function markUnverified(text: string, details: string[]): React.ReactNode[] {
  try {
    const lower = text.toLowerCase();
    type Hit = { at: number; len: number; raw: string };
    const hits: Hit[] = [];
    for (const d of details) {
      const needle = d.toLowerCase();
      if (!needle || !needle.trim()) continue;
      let from = 0;
      for (;;) {
        const at = lower.indexOf(needle, from);
        if (at < 0) break;
        hits.push({ at, len: needle.length, raw: text.slice(at, at + needle.length) });
        from = at + needle.length;
      }
    }
    if (hits.length === 0) return [text];
    hits.sort((a, b) => a.at - b.at || b.len - a.len);
    const parts: React.ReactNode[] = [];
    let pos = 0;
    let key = 0;
    for (const h of hits) {
      if (h.at < pos) continue;
      if (h.at > pos) parts.push(text.slice(pos, h.at));
      parts.push(<RedUnderline key={key++}>{h.raw}</RedUnderline>);
      pos = h.at + h.len;
    }
    if (pos < text.length) parts.push(text.slice(pos));
    return parts;
  } catch {
    return [text];
  }
}

function HistoryRows({ rows }: { rows: JobRow[] }) {
  return (
    <Sheet className="p-5">
      <h2 className="type-h3 text-ink">History</h2>
      <ul className="mt-3">
        {rows.slice(0, 5).map((j) => {
          const score = scoreOf(j);
          return (
            <li key={j.id} className="flex items-center gap-2 border-b border-line py-2 text-sm last:border-b-0">
              <span className="font-mono text-xs text-ink-3">{j.id.slice(0, 8)}</span>
              <Badge variant={j.status === "failed" ? "missing" : "neutral"}>{j.status}</Badge>
              <span className="ml-auto font-mono text-xs text-ink">
                {score !== null ? `${score}/100` : "-"}
              </span>
              <span className="font-mono text-[11px] leading-4 text-ink-3">{relTime(j.created_at)}</span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function LoadingPanel({ step, text }: { step: number; text: string }) {
  return (
    <Sheet>
      <p aria-live="polite" className="text-sm text-ink-2">
        {text}
      </p>
      <ol className="relative mt-4 space-y-3 border-l border-line pl-7">
        {PROOF_STEPS.map((s, i) => (
          <li key={s} className="relative text-sm">
            <span
              aria-hidden="true"
              className="absolute -left-[33px] top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-sheet"
            >
              {i < step && <Icon name="check" className="h-3 w-3 text-green" />}
              {i === step && <span className="spinner" aria-hidden="true" />}
            </span>
            <span className={i <= step ? "text-ink" : "text-ink-3"}>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 space-y-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </Sheet>
  );
}

function EmptySpecimen() {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong p-8">
      <div className="space-y-2.5 opacity-70">
        <div className="h-2.5 w-1/3 rounded bg-line" />
        <div className="h-2 w-full rounded bg-line" />
        <div className="h-2 w-full rounded bg-line" />
        <div className="h-2 w-3/4 rounded bg-line" />
        <div className="h-2 w-full rounded bg-line" />
        <div className="h-2 w-2/3 rounded bg-line" />
      </div>
      <h2 className="mt-8 font-display text-[20px] italic leading-7 text-ink-3">
        Your marked-up review appears here.
      </h2>
    </div>
  );
}

export default function AnalyzePage() {
  const router = useRouter();
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<JobRow[]>([]);
  const [insufficient, setInsufficient] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [retainInput, setRetainInput] = useState(false);
  const [proofStep, setProofStep] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadHistory() {
    const supabase = createClient();
    const { data } = await supabase
      .from("ai_jobs")
      .select("id, status, result, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory((data as JobRow[]) || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("credit_balance").eq("id", user.id).single();
      setBalance(data?.credit_balance ?? 0);
    })();
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t = window.setInterval(() => {
      setProofStep((s) => Math.min(PROOF_STEPS.length - 1, s + 1));
    }, 4000);
    return () => window.clearInterval(t);
  }, [loading]);

  async function onPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProgress("Extracting PDF...");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/ai/extract-pdf", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) {
      setError(json.message || "PDF extraction failed");
      setProgress("");
      return;
    }
    setResumeText(json.data.text);
    setFileName(file.name);
    setProgress("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setProofStep(0);
    setProgress("Reserving credit...");
    setError(null);
    setResult(null);
    setInsufficient(false);
    const idempotencyKey = crypto.randomUUID();
    try {
      setProgress("Running AI analysis...");
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ resumeText, jobDescription, idempotencyKey, retainInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 402) setInsufficient(true);
        setError(json.message || "Analysis failed");
        setLoading(false);
        setProgress("");
        return;
      }
      setInsufficient(false);
      setJobId(json.data.jobId);
      setResult(json.data.result);
      setBalance((b) => (b !== null ? Math.max(0, b - 1) : b));
      loadHistory();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  function useSample() {
    setResumeText(SAMPLE_RESUME);
    setJobDescription(SAMPLE_JOB);
  }

  async function copyRewritten() {
    if (!result) return;
    await navigator.clipboard.writeText(result.rewrittenResume);
    setToast("Copied to clipboard.");
  }

  function downloadRewritten() {
    if (!result) return;
    const blob = new Blob([result.rewrittenResume], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rewritten-resume.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const band = result ? bandStamp(result.matchScore) : null;
  const metCount = result ? result.requirementMatches.filter((m) => m.status === "met").length : 0;
  const dly = (i: number) => ({ animationDelay: `${i * 60}ms` });

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
      {/* LEFT: review desk inputs */}
      <div className="space-y-6 lg:col-span-5">
        <div className="space-y-2">
          <div className="type-label">Review desk</div>
          <h1 className="type-display text-ink">Review a resume</h1>
          <p className="font-mono text-[13px] leading-5 text-ink-3">
            1 credit per analysis. You have <span className="text-ink">{balance ?? "..."}</span> credits.
          </p>
        </div>

        <StarterCreditsBanner />

        {/* Step 1: resume */}
        <Sheet className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[34px] leading-none text-ink">1</span>
            <h2 className="type-h3 text-ink">Your resume</h2>
          </div>

          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed border-line-strong bg-paper-sunken px-4 py-6 text-sm text-ink-2"
            role="button"
            tabIndex={0}
            aria-label="Upload PDF (max 5MB)"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
          >
            <Icon name="upload" className="mb-1.5 h-5 w-5 text-ink-3" />
            <span>Upload PDF (max 5MB)</span>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={onPdfChange} className="hidden" />
          </div>
          {!loading && progress && (
            <p className="text-sm text-ink-2" aria-live="polite">
              {progress}
            </p>
          )}
          {fileName && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-mono text-xs text-ink-2">{fileName}</span>
              <button
                type="button"
                className="min-h-[44px] shrink-0 text-sm font-medium text-blue underline-offset-2 hover:underline md:min-h-0 md:py-0"
                onClick={() => {
                  setFileName(null);
                  setResumeText("");
                }}
              >
                Remove
              </button>
            </div>
          )}

          <Textarea
            required
            placeholder="Paste resume text"
            aria-label="Resume text"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="min-h-[220px]"
            maxLength={20000}
          />
          <div className="text-right font-mono text-xs text-ink-3">{resumeText.length}/20000</div>

          <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-ink-2">
            <input type="checkbox" checked={retainInput} onChange={(e) => setRetainInput(e.target.checked)} className="mt-0.5" />
            <span>
              Save my resume text for history (unchecked by default; only character counts are stored).{" "}
              <a href="/privacy" className="font-medium text-blue underline-offset-2 hover:underline">
                Privacy notice
              </a>
            </span>
          </label>
        </Sheet>

        {/* Step 2: job description */}
        <Sheet className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[34px] leading-none text-ink">2</span>
            <h2 className="type-h3 text-ink">The job</h2>
          </div>
          <Textarea
            required
            placeholder="Paste job description"
            aria-label="Job description"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            maxLength={10000}
          />
          <div className="text-right font-mono text-xs text-ink-3">{jobDescription.length}/10000</div>
          <Button type="button" variant="ghost" onClick={useSample} className="min-h-[44px] md:min-h-0">
            Use sample data
          </Button>
        </Sheet>

        {/* Step 3: run the review */}
        <div className="space-y-3">
          {insufficient ? (
            <div
              className="rounded-[10px] border-2 border-red-pen bg-sheet px-4 py-4"
              role="status"
              aria-live="polite"
            >
              <p className="text-base font-semibold leading-6 text-red-pen">You are out of credits</p>
              <a href="/credits" className="btn btn-primary mt-3 inline-flex px-4 text-sm">
                Buy credits
              </a>
            </div>
          ) : (
            <Button onClick={() => onSubmit({ preventDefault: () => {} } as React.FormEvent)} loading={loading} size="lg" className="w-full">
              Review resume
            </Button>
          )}
          {error && (
            <p className="text-sm font-medium text-red-pen" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* History sits under the form on desktop */}
        {history.length > 0 && (
          <div className="hidden lg:block">
            <HistoryRows rows={history} />
          </div>
        )}
      </div>

      {/* RIGHT: results column, sticky on desktop */}
      <div className="self-start space-y-6 lg:col-span-7 lg:sticky lg:top-24">
        {loading && <LoadingPanel step={proofStep} text={progress || PROOF_STEPS[proofStep]} />}

        {result && (
          <div className="space-y-6">
            {/* 1. Verdict */}
            <Sheet className="reveal" style={dly(0)}>
              <h3 className="type-h3 text-ink">Verdict</h3>
              <div className="mt-3 flex items-center gap-5">
                <ScoreRing score={result.matchScore} />
                <div className="min-w-0">
                  <div className="font-mono text-[22px] leading-7 text-ink">
                    {result.matchScore}
                    <span className="text-ink-3">/100</span>
                  </div>
                  <div className="mt-1.5">
                    {band && <Stamp tone={band.tone}>{band.label}</Stamp>}
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-ink-3">
                    {metCount}/{result.requirementMatches.length} requirements met
                  </div>
                  {typeof result.estimatedAfterScore === "number" && (
                    <div className="mt-1.5 text-sm text-ink-2">
                      <span className="font-mono">
                        {result.matchScore} -&gt; {result.estimatedAfterScore}
                      </span>{" "}
                      <span className="text-xs text-ink-3">AI estimate, not a guarantee</span>
                    </div>
                  )}
                  {jobId && <div className="mt-1.5 font-mono text-[11px] text-ink-3">Job ID {jobId}</div>}
                </div>
              </div>
            </Sheet>

            {/* 2. The roast */}
            <div className="reveal" style={dly(1)}>
              <h3 className="type-label">The roast</h3>
              <p className="mt-2 whitespace-pre-wrap border-l-2 border-red-pen pl-4 font-display text-[22px] italic leading-8 text-ink-2 md:text-[26px] md:leading-9">
                {result.roast}
              </p>
            </div>

            <Rule />

            {/* 3. Requirements */}
            <div className="reveal" style={dly(2)}>
              <h3 className="type-label">Requirements</h3>
              <ul className="mt-3 space-y-4">
                {result.requirementMatches.map((m, i) => (
                  <li key={i} className="space-y-1.5">
                    <div className="flex items-start gap-2.5">
                      <Badge variant={m.status}>{m.status}</Badge>
                      <span className="text-sm font-medium leading-5 text-ink">{m.requirement}</span>
                    </div>
                    {m.evidence ? (
                      <p className="text-sm leading-5 text-ink-2">
                        {m.status === "missing" ? <RedUnderline>{m.evidence}</RedUnderline> : <Highlight>{m.evidence}</Highlight>}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <Rule />

            {/* 4. Fabrication check */}
            <div className="reveal" style={dly(3)}>
              <h3 className="type-label">Fabrication check</h3>
              {result.unverifiedDetails && result.unverifiedDetails.length > 0 ? (
                <div className="mt-3 rounded-[10px] border-2 border-red-pen bg-red-soft/60 p-4">
                  <div className="flex flex-wrap gap-2">
                    {result.unverifiedDetails.map((d, i) => (
                      <Stamp key={i}>{d}</Stamp>
                    ))}
                  </div>
                  <p className="mt-3 text-sm font-medium leading-5 text-red-pen">Verify these before sending</p>
                </div>
              ) : (
                <p className="mt-3 rounded-[10px] border border-green/40 bg-green-soft p-4 text-sm font-medium leading-5 text-green">
                  No new facts were added by the rewrite.
                </p>
              )}
            </div>

            {/* 5. Missing keywords */}
            {result.missingKeywords.length > 0 && (
              <div className="reveal" style={dly(4)}>
                <h3 className="type-label">Missing keywords</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.missingKeywords.map((k, i) => (
                    <Badge key={i} variant="neutral">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Rule />

            {/* 6. Strengths and weaknesses */}
            <div className="reveal">
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="type-label">Strengths</h3>
                  <ul className="mt-3 space-y-2">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm leading-5 text-ink-2">
                        <svg width="8" height="8" viewBox="0 0 8 8" className="mt-1.5 shrink-0" aria-hidden="true">
                          <circle cx="4" cy="4" r="3.5" fill="#2F6B4F" />
                        </svg>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="type-label">Weaknesses</h3>
                  <ul className="mt-3 space-y-2">
                    {result.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm leading-5 text-ink-2">
                        <svg width="8" height="8" viewBox="0 0 8 8" className="mt-1.5 shrink-0" aria-hidden="true">
                          <circle cx="4" cy="4" r="3.5" fill="#C2331F" />
                        </svg>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <Rule />

            {/* 7. Rewritten resume */}
            <div className="reveal">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="type-h3 text-ink">Rewritten resume</h3>
                <div className="flex items-center gap-2">
                  {result.language && <Badge variant="neutral">{result.language === "id" ? "Indonesian" : "English"}</Badge>}
                  <Button variant="ghost" onClick={copyRewritten} className="min-h-[44px] md:min-h-0">
                    Copy
                  </Button>
                  <Button variant="ghost" onClick={downloadRewritten} className="min-h-[44px] md:min-h-0">
                    Download .txt
                  </Button>
                </div>
              </div>
              <div className="mt-3 rounded-[10px] border border-line bg-paper-sunken p-4 md:p-5">
                <pre className="max-h-[480px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                  {markUnverified(result.rewrittenResume, result.unverifiedDetails ?? [])}
                </pre>
              </div>
            </div>

            {/* 8. Recommendations */}
            <div className="reveal" style={dly(5)}>
              <h3 className="type-label">Recommendations</h3>
              <ul className="mt-3 space-y-3">
                {result.recommendations.map((r, i) => (
                  <li key={i}>
                    <div className="type-label">{r.section}</div>
                    <MarginNote className="mt-1.5">{r.advice}</MarginNote>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {!result && !loading && <EmptySpecimen />}

        {/* History sits below results on mobile */}
        {history.length > 0 && (
          <div className="lg:hidden">
            <HistoryRows rows={history} />
          </div>
        )}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
