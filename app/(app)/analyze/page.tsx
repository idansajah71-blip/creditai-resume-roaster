"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SAMPLE_RESUME, SAMPLE_JOB } from "@/lib/samples";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { ScoreRing } from "@/components/ui/ScoreRing";
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

export default function AnalyzePage() {
  const router = useRouter();
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [history, setHistory] = useState<JobRow[]>([]);
  const [insufficient, setInsufficient] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [retainInput, setRetainInput] = useState(false);
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

  const badgeColor = (s: string) =>
    s === "met" ? "success" : s === "partial" ? "warning" : "danger";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
          Analyze
        </h1>
        <StarterCreditsBanner />
        <Card>
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Step 1</div>
            <h2 className="text-lg font-semibold text-ink">Your resume</h2>
          </div>
          <div
            className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed border-border-strong bg-surface-muted px-4 py-6 text-sm text-ink-muted"
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
            <span>Upload PDF (max 5MB)</span>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={onPdfChange} className="hidden" />
          </div>
          {fileName && (
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-ink-muted">{fileName}</span>
              <button className="text-accent hover:underline" onClick={() => { setFileName(null); setResumeText(""); }}>
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
          <div className="mt-1 text-right font-mono text-xs text-ink-faint">
            {resumeText.length}/20000
          </div>
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={retainInput}
              onChange={(e) => setRetainInput(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Save my resume text for history (unchecked by default; only character counts are stored).{" "}
              <a href="/privacy" className="font-medium text-accent hover:underline">
                Privacy notice
              </a>
            </span>
          </label>
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Step 2</div>
            <h2 className="text-lg font-semibold text-ink">The job</h2>
          </div>
          <Textarea
            required
            placeholder="Paste job description"
            aria-label="Job description"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            maxLength={10000}
          />
          <div className="mt-1 text-right font-mono text-xs text-ink-faint">
            {jobDescription.length}/10000
          </div>
          <button type="button" onClick={useSample} className="mt-3 text-sm text-accent hover:underline">
            Use sample data
          </button>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            Costs 1 credit. You have <span className="font-mono">{balance ?? "..."}</span> credits.
          </p>
          <Button onClick={() => onSubmit({ preventDefault: () => {} } as React.FormEvent)} loading={loading} size="lg">
            Analyze
          </Button>
        </div>

        {insufficient && (
          <div
            className="rounded-[10px] border border-warning/40 bg-warning-soft px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-medium text-warning">You are out of credits.</p>
            <a href="/credits" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
              Buy credits
            </a>
          </div>
        )}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        {loading && (
          <Card>
            <p className="text-sm text-ink-muted" aria-live="polite">
              {progress || "Running AI analysis..."}
            </p>
          </Card>
        )}
        {result && (
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-4">
                <ScoreRing score={result.matchScore} />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Match score</div>
                  <div className="font-mono text-2xl text-ink">{result.matchScore}/100</div>
                  {typeof result.estimatedAfterScore === "number" && (
                    <div className="mt-1 text-sm text-ink">
                      <span className="text-ink-muted">Rewritten estimate:</span>{" "}
                      <span className="font-mono">
                        {result.matchScore} -&gt; {result.estimatedAfterScore}
                      </span>
                      <div className="text-xs text-ink-faint">AI estimate, not a guarantee</div>
                    </div>
                  )}
                </div>
                {result.language && (
                  <Badge variant="neutral" className="ml-auto">
                    {result.language === "id" ? "Indonesian" : "English"}
                  </Badge>
                )}
              </div>
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Roast</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{result.roast}</p>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink">Fabrication check</h3>
              {result.unverifiedDetails && result.unverifiedDetails.length > 0 ? (
                <>
                  <p className="mt-1 text-sm text-warning">
                    {result.unverifiedDetails.length} detail(s) in the rewrite were not found in your original resume. Verify them yourself.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.unverifiedDetails.map((d, i) => (
                      <span key={i} className="rounded-full bg-warning-soft px-2.5 py-0.5 font-mono text-xs text-warning">
                        {d}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-success">No new facts were added.</p>
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink">Strengths</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {result.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink">Weaknesses</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {result.weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink">Requirement matches</h3>
              <ul className="mt-3 space-y-3">
                {result.requirementMatches.map((m, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge variant={badgeColor(m.status) as "success" | "warning" | "danger"}>
                      {m.status}
                    </Badge>
                    <div>
                      <div className="text-sm font-medium text-ink">{m.requirement}</div>
                      <div className="text-xs text-ink-muted">{m.evidence}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink">Missing keywords</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.missingKeywords.map((k, i) => (
                  <span key={i} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-ink-muted">
                    {k}
                  </span>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink">Recommendations</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {result.recommendations.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{r.section}:</span>{" "}
                    <span className="text-ink-muted">{r.advice}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink">Rewritten resume</h3>
              <pre className="mt-2 whitespace-pre-wrap rounded-[10px] bg-surface-muted p-3 text-sm text-ink">
                {result.rewrittenResume}
              </pre>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={copyRewritten}>
                  Copy
                </Button>
                <Button variant="secondary" onClick={downloadRewritten}>
                  Download
                </Button>
              </div>
            </Card>
            {jobId && <p className="text-xs text-ink-faint">Job ID: {jobId}</p>}
          </div>
        )}
        {!result && !loading && (
          <Card>
            <p className="text-sm text-ink-muted">Results will appear here after analysis.</p>
          </Card>
        )}
      </div>
    </div>
  );
}