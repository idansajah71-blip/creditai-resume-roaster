"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SAMPLE_RESUME, SAMPLE_JOB } from "@/lib/samples";

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
  const [history, setHistory] = useState<JobRow[]>([]);
  const [insufficient, setInsufficient] = useState(false);
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
        body: JSON.stringify({ resumeText, jobDescription, idempotencyKey }),
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
    s === "met" ? "bg-green-100 text-green-800" : s === "partial" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resume Roaster & Rewriter</h1>
      <button type="button" onClick={useSample} className="rounded border px-3 py-1 text-sm">
        Use sample
      </button>
      <div>
        <input ref={fileRef} type="file" accept="application/pdf" onChange={onPdfChange} className="text-sm" />
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <textarea
          required
          placeholder="Paste resume text"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          className="h-48 w-full rounded border p-3"
        />
        <textarea
          required
          placeholder="Paste job description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          className="h-32 w-full rounded border p-3"
        />
        <button
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze (1 credit)"}
        </button>
      </form>

      {loading && <p className="text-gray-600">{progress || "Running AI analysis..."}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {insufficient && (
        <a href="/credits" className="inline-block rounded bg-black px-3 py-2 text-white">
          Buy credits
        </a>
      )}

      {result && (
        <div className="space-y-4 rounded border bg-white p-4">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold">{result.matchScore}/100</div>
            <div className="h-3 flex-1 rounded bg-gray-200">
              <div className="h-3 rounded bg-black" style={{ width: `${result.matchScore}%` }} />
            </div>
          </div>
          <section>
            <h3 className="font-semibold">Roast</h3>
            <p className="whitespace-pre-wrap text-sm">{result.roast}</p>
          </section>
          <section>
            <h3 className="font-semibold">Strengths</h3>
            <ul className="list-disc pl-5">
              {result.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-semibold">Weaknesses</h3>
            <ul className="list-disc pl-5">
              {result.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-semibold">Requirement Matches</h3>
            <ul className="space-y-2">
              {result.requirementMatches.map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeColor(m.status)}`}>
                    {m.status}
                  </span>
                  <div>
                    <div className="font-medium">{m.requirement}</div>
                    <div className="text-sm text-gray-600">{m.evidence}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-semibold">Missing Keywords</h3>
            <div className="flex flex-wrap gap-2">
              {result.missingKeywords.map((k, i) => (
                <span key={i} className="rounded bg-gray-100 px-2 py-1 text-xs">
                  {k}
                </span>
              ))}
            </div>
          </section>
          <section>
            <h3 className="font-semibold">Recommendations</h3>
            <ul className="list-disc pl-5">
              {result.recommendations.map((r, i) => (
                <li key={i}>
                  <strong>{r.section}:</strong> {r.advice}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-semibold">Rewritten Resume</h3>
            <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm">{result.rewrittenResume}</pre>
            <div className="mt-2 flex gap-2">
              <button onClick={copyRewritten} className="rounded border px-3 py-1 text-sm">
                Copy
              </button>
              <button onClick={downloadRewritten} className="rounded border px-3 py-1 text-sm">
                Download .txt
              </button>
            </div>
          </section>
          {jobId && <p className="text-xs text-gray-400">Job ID: {jobId}</p>}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">History</h2>
        <ul className="divide-y rounded border bg-white">
          {history.map((h) => {
            let score: number | null = null;
            if (h.result) {
              try {
                score = JSON.parse(h.result).matchScore;
              } catch {
                score = null;
              }
            }
            return (
              <li key={h.id} className="flex justify-between px-3 py-2 text-sm">
                <span>{h.id.slice(0, 8)}…</span>
                <span>{h.status}</span>
                <span>{score !== null ? `${score}/100` : "-"}</span>
              </li>
            );
          })}
          {history.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No history yet.</li>}
        </ul>
      </section>
    </div>
  );
}