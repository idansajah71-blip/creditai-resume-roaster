import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Badge } from "@/components/ui/Badge";


export default function Home() {
  return (
    <PublicShell>
      <main className="space-y-16">
        <section className="grid gap-10 md:grid-cols-2 md:items-center">
          <div className="space-y-5">
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
              AI Resume Review
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.02em] text-ink md:text-[40px] md:leading-[44px]">
              Find out exactly why your resume gets ignored.
            </h1>
            <p className="max-w-xl text-base leading-[26px] text-ink-muted">
              Paste your resume and a job description. Get a match score, a blunt roast,
              requirement-by-requirement evidence, and a rewrite that never invents experience.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/analyze" className="btn btn-primary px-5 py-3 text-base">
                Analyze my resume
              </Link>
              <Link href="/judges" className="btn btn-secondary px-5 py-3 text-base">
                Open judge guide
              </Link>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <ScoreRing score={72} />
              <div>
                <div className="text-sm font-semibold text-ink">Match score</div>
                <p className="text-sm text-ink-muted">Requirement breakdown</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">Node.js experience</span>
                <Badge variant="success">met</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">AWS / cloud</span>
                <Badge variant="warning">partial</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">Leadership</span>
                <Badge variant="danger">missing</Badge>
              </div>
            </div>
            <p className="mt-4 text-sm italic text-ink-muted">
              &quot;Solid backend, but your resume reads like a job description, not a story.&quot;
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-[28px] font-semibold leading-[34px] text-ink">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { n: "01", t: "Paste or upload", d: "Add your resume and a job description." },
              { n: "02", t: "Pay per analysis", d: "Buy credits with PayPal Sandbox." },
              { n: "03", t: "Get results", d: "Download or copy your rewrite." },
            ].map((s) => (
              <div key={s.n} className="card p-5">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent-soft font-mono text-sm font-semibold text-accent">
                  {s.n}
                </div>
                <h3 className="text-lg font-semibold text-ink">{s.t}</h3>
                <p className="text-sm text-ink-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-[28px] font-semibold leading-[34px] text-ink">Pricing</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { credits: 10, price: "$1.00", popular: false },
              { credits: 50, price: "$4.00", popular: true },
              { credits: 100, price: "$7.00", popular: false },
            ].map((p) => (
              <div
                key={p.credits}
                className={`card p-6 text-center ${p.popular ? "border-accent" : ""}`}
              >
                {p.popular && (
                  <div className="mb-2">
                    <Badge variant="accent">Most popular</Badge>
                  </div>
                )}
                <div className="text-2xl font-bold text-ink">{p.credits} credits</div>
                <div className="text-ink-muted">{p.price} USD</div>
                <div className="mt-1 font-mono text-xs text-ink-faint">
                  ${(parseFloat(p.price.replace("$", "")) / p.credits).toFixed(2)} per credit
                </div>
                <Link
                  href="/credits"
                  className="btn btn-primary mt-4 w-full px-4 py-2 text-sm"
                >
                  Buy credits
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[28px] font-semibold leading-[34px] text-ink">Built on</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {["Real OpenAI inference", "PayPal Sandbox payments", "Atomic credit ledger"].map((t) => (
              <div key={t} className="card p-4 text-sm text-ink-muted">
                {t}
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-border pt-6 text-sm text-ink-muted">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-bold text-ink">CreditAI</span>
            <div className="flex gap-4">
              <Link href="/judges" className="hover:text-ink">
                Judge guide
              </Link>
              <a href="#" className="hover:text-ink">
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </main>
    </PublicShell>
  );
}