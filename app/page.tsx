import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import { Badge } from "@/components/ui/Badge";
import { Highlight, RedUnderline, MarginNote, Stamp, Rule } from "@/components/ui/annotations";

function HowStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="font-display text-[44px] leading-none text-ink md:text-[56px]">{n}</div>
      <h3 className="type-h3 mt-3 text-ink">{title}</h3>
      <p className="mt-2 max-w-xs text-[15px] leading-6 text-ink-2">{body}</p>
    </div>
  );
}

function LedgerRow({ kind, amount, note, tone }: { kind: string; amount: string; note: string; tone?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${tone ?? ""}`}>
      <span>
        {kind} <span className="text-ink-3">{amount}</span>
      </span>
      <span className="text-ink-3">{note}</span>
    </div>
  );
}

function Specimen() {
  return (
    <div className="relative mx-auto w-full max-w-[460px] -rotate-1">
      <div className="rounded-[10px] border border-line bg-sheet p-5 shadow-[0_1px_0_rgba(23,20,15,0.04),0_1px_2px_rgba(23,20,15,0.06),0_24px_48px_-24px_rgba(23,20,15,0.28)] md:p-7">
        {/* Verdict stamp pinned at the corner */}
        <div className="absolute -right-2 -top-3 md:-right-3">
          <Stamp tone="ink">Match 72</Stamp>
        </div>

        {/* Document header */}
        <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
          <div>
            <div className="font-display text-[22px] leading-7 text-ink">Adi Pratama</div>
            <div className="text-xs leading-4 text-ink-3">Backend engineer, Jakarta</div>
          </div>
          <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-ink-3">Sample</span>
        </div>

        {/* Marked-up resume lines */}
        <div className="mt-4 space-y-2.5 font-display text-[16px] leading-6 text-ink">
          <p className="type-label">Experience</p>
          <p>
            <Highlight>Built payment REST APIs with Node.js and PostgreSQL</Highlight>.
          </p>
          <p>
            <Highlight>Automated release pipelines with GitHub Actions</Highlight>.
          </p>
          <p>
            <RedUnderline>Improved performance a lot.</RedUnderline>
          </p>
          <p className="flex flex-wrap items-center justify-between gap-2">
            <span>Migrated billing events to Kafka; cut latency 10x.</span>
            <Stamp>Unverified</Stamp>
          </p>
          <p className="hidden md:block">Skills: Node.js, TypeScript, PostgreSQL, Docker, AWS.</p>
          <p className="hidden md:block">Education: B.Eng, Universitas Indonesia, 2020.</p>
        </div>

        {/* Editor margin note */}
        <MarginNote className="mt-4">No metrics. What did this change?</MarginNote>
      </div>
    </div>
  );
}

export default function Home() {
  const packs = [
    { credits: 10, price: "$1.00", flagged: false },
    { credits: 50, price: "$4.00", flagged: true },
    { credits: 100, price: "$7.00", flagged: false },
  ];

  return (
    <PublicShell>
      <div className="space-y-14 md:space-y-24">
        {/* Hero */}
        <section className="grid items-center gap-12 md:grid-cols-2 md:gap-10">
          <div className="space-y-5">
            <div className="type-label">AI resume review</div>
            <h1 className="type-display text-ink">
              Your resume, marked up by a <em className="italic">harsh but fair</em> editor.
            </h1>
            <p className="max-w-xl text-base leading-[26px] text-ink-2">
              Paste a resume and a job description. Get a match score, evidence per requirement, a rewrite, and a
              check that flags every fact the AI added.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/analyze" className="btn btn-primary px-5 text-base">
                Review my resume
              </Link>
              <Link href="/judges" className="btn btn-secondary px-5 text-base">
                Open judge guide
              </Link>
            </div>
            <p className="pt-1 font-mono text-[13px] leading-5 text-ink-3">
              3 free credits on sign-up. Pay per analysis with PayPal Sandbox.
            </p>
          </div>
          <Specimen />
        </section>

        <Rule />

        {/* How it works */}
        <section className="space-y-8">
          <h2 className="type-h2 text-ink">How it works</h2>
          <div className="grid gap-10 md:grid-cols-3 md:gap-8">
            <HowStep n="01" title="Paste" body="Add your resume and the job description. Upload a PDF or paste text." />
            <HowStep n="02" title="Review" body="Every requirement is marked met, partial, or missing, with evidence quoted from your resume." />
            <HowStep n="03" title="Rewrite and verify" body="Get a rewrite, then a list of every fact the AI added so you can verify each one." />
          </div>
        </section>

        <Rule />

        {/* Proof, not vibes */}
        <section className="space-y-8">
          <h2 className="type-h2 text-ink">Proof, not vibes</h2>
          <div className="grid gap-10 md:grid-cols-3 md:gap-8">
            <div className="space-y-3">
              <p className="min-h-8 font-display text-[17px] leading-7 text-ink">
                <Highlight>Designed REST APIs in Node.js</Highlight>
              </p>
              <div>
                <Badge variant="met">Met</Badge>
              </div>
              <p className="text-[15px] leading-6 text-ink-2">
                Every requirement gets evidence quoted from your resume, not a vague percentage.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex min-h-8 items-start gap-3">
                <Stamp>Unverified</Stamp>
                <ul className="space-y-1 pt-0.5 font-mono text-[11px] leading-4 text-ink-3">
                  <li>cut latency 10x</li>
                  <li>led a 12-person team</li>
                </ul>
              </div>
              <p className="text-[15px] leading-6 text-ink-2">
                A fabrication check flags facts the AI added that your resume does not support.
              </p>
            </div>

            <div className="space-y-3">
              <div className="min-h-8 rounded-[6px] border border-line bg-paper-sunken p-3 font-mono text-[11px] leading-5 text-ink-2">
                <LedgerRow kind="purchase" amount="+10 credits" note="$4.00" />
                <LedgerRow kind="analyze" amount="-1 credit" note="ok" />
                <LedgerRow kind="refund" amount="+1 credit" note="ai error" tone="text-green" />
              </div>
              <p className="text-[15px] leading-6 text-ink-2">
                Credits live in an atomic ledger. A failed analysis refunds itself.
              </p>
            </div>
          </div>
        </section>

        <Rule />

        {/* Pricing */}
        <section className="space-y-8">
          <h2 className="type-h2 text-ink">Pricing</h2>
          <div className="grid gap-6 md:grid-cols-3 md:gap-8">
            {packs.map((p) => (
              <div
                key={p.credits}
                className={`relative p-6 text-center ${p.flagged ? "card sheet-hero md:-mt-2 md:pb-8" : "card"}`}
              >
                {p.flagged && (
                  <div className="absolute -top-3 right-4">
                    <Stamp>Best value</Stamp>
                  </div>
                )}
                <div className="type-label">{p.credits} credits</div>
                <div className="mt-3 font-mono text-[32px] leading-9 text-ink">{p.price}</div>
                <div className="mt-1 font-mono text-xs leading-4 text-ink-3">
                  ${(parseFloat(p.price.replace("$", "")) / p.credits).toFixed(2)} per credit
                </div>
                <Link href="/credits" className={`btn mt-5 w-full px-4 text-sm ${p.flagged ? "btn-primary" : "btn-secondary"}`}>
                  Buy credits
                </Link>
              </div>
            ))}
          </div>
        </section>

        <Rule />

        {/* Stack line */}
        <p className="font-mono text-[13px] leading-5 text-ink-3">
          OpenAI analysis. PayPal Sandbox payments. Atomic credit ledger.
        </p>

        {/* Closing band */}
        <section className="space-y-6 text-center">
          <p className="mx-auto max-w-2xl font-display text-[32px] leading-9 text-ink md:text-[44px] md:leading-[50px]">
            Stop guessing why your resume gets ignored.
          </p>
          <div>
            <Link href="/analyze" className="btn btn-primary px-6 text-base">
              Review my resume
            </Link>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
