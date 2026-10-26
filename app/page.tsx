import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6">
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

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">How it works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { step: "1", title: "Analyze", body: "Paste resume + job description. AI returns score and rewrite." },
            { step: "2", title: "Pay with PayPal", body: "Buy credits in Sandbox. No real money." },
            { step: "3", title: "Get results", body: "Download or copy your rewritten resume." },
          ].map((s) => (
            <div key={s.step} className="rounded border bg-white p-4">
              <div className="text-sm font-semibold text-gray-500">Step {s.step}</div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-gray-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Pricing</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { credits: 10, price: "$1.00" },
            { credits: 50, price: "$4.00" },
            { credits: 100, price: "$7.00" },
          ].map((p) => (
            <div key={p.credits} className="rounded border bg-white p-4 text-center">
              <div className="text-2xl font-bold">{p.credits} credits</div>
              <div className="text-gray-600">{p.price} USD</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}