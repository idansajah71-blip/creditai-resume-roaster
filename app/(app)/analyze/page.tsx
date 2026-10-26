"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SAMPLE_RESUME, SAMPLE_JOB } from "@/lib/samples";

type AnalysisResult = {
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: { section: string; advice: string }[];
  rewrittenResume: string;
};

type JobRow = { id: string; status: string; result: string | null; created_at: string };

export default function AnalyzePage() {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<JobRow[]>([]);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ resumeText, jobDescription, idempotencyKey }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "Analysis failed");
        setLoading(false);
        return;
      }
      setJobId(json.data.jobId);
      setResult(json.data.result);
      loadHistory();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resume Roaster & Rewriter</h1>
      <button type="button" onClick={useSample} className="rounded border px-3 py-1 text-sm">
        Use sample
      </button>
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

      {loading && <p className="text-gray-600">Running AI analysis...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {result && (
        <div className="space-y-4 rounded border bg-white p-4">
          <h2 className="text-xl font-semibold">Match Score: {result.matchScore}/100</h2>
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