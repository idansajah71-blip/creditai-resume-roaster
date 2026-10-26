import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <section className="space-y-3">
        <div className="inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
          PayPal Sandbox mode — no real money is used
        </div>
        <h1 className="text-4xl font-bold">CreditAI Resume Roaster</h1>
        <p className="text-gray-600">
          Paste your resume and a job description. Get an AI match score, strengths, weaknesses,
          recommendations, and a rewritten resume. Pay only for what you use with Sandbox credits.
        </p>
        <div className="flex gap-3">
          <Link href="/register" className="rounded bg-black px-4 py-2 text-white">
            Get started
          </Link>
          <Link href="/login" className="rounded border px-4 py-2">
            Login
          </Link>
          <Link href="/judges" className="rounded border px-4 py-2">
            Judge quick-start
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { title: "AI analysis", body: "Real OpenAI inference with structured output." },
          { title: "Atomic credits", body: "Reserve, finalize, or refund credits safely." },
          { title: "Auditable ledger", body: "Every balance change is recorded." },
        ].map((f) => (
          <div key={f.title} className="rounded border bg-white p-4">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-gray-600">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}