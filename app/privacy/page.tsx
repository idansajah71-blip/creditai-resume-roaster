import Link from "next/link";
import PublicShell from "@/components/PublicShell";

export const metadata = {
  title: "Privacy notice | CreditAI",
  description: "What CreditAI stores, for how long, and how to delete your data.",
};

export default function PrivacyPage() {
  return (
    <PublicShell>
      <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
        Privacy notice
      </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Plain language, no surprises. This is a demo application for evaluation purposes.
        </p>

        <div className="mt-8 space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-ink">What we store</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-muted">
              <li>Your account email (auth via Supabase).</li>
              <li>
                Your resume and job description text <strong>only if</strong> you check &quot;Save my
                resume text for history&quot; on the Analyze page. By default, that box is unchecked and
                we store just the character counts of each text, e.g.{" "}
                <span className="font-mono text-ink">{`{"resumeChars": 1234, "jobChars": 500}`}</span>.
              </li>
              <li>
                Analysis results (match score, strengths, weaknesses, rewritten resume) so you can
                view them again in your history.
              </li>
              <li>
                Credit transactions and PayPal payment references, which we keep for accounting and
                dispute handling.
              </li>
            </ul>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold text-ink">How long we keep it</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-muted">
              <li>Resume text you opted to save: kept until you delete it.</li>
              <li>
                Even saved text is nulled automatically when older than 30 days (scheduled database
                job).
              </li>
              <li>Credit and payment records: kept for financial integrity.</li>
            </ul>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold text-ink">Who sees your data</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-muted">
              <li>
                PDFs are processed <strong>in memory</strong> to extract text and are never stored
                as files.
              </li>
              <li>
                Your resume and job description text are sent to the OpenAI API for analysis. OpenAI
                does not train on data sent through the API. Analysis outputs are stored in our
                database as described above.
              </li>
              <li>
                Payments use <strong>PayPal Sandbox</strong> (test mode). No real money moves, and we
                never see your PayPal credentials.
              </li>
            </ul>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold text-ink">How to delete your data</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-muted">
              <li>
                Go to your Dashboard and click <strong>&quot;Delete my analysis data&quot;</strong>.
                This removes your analysis history permanently.
              </li>
              <li>
                Credit transactions and payment records are kept for accounting and cannot be
                deleted.
              </li>
              <li>Your account can be deleted via Supabase auth if you need full removal.</li>
            </ol>
          </section>

          <p className="text-sm text-ink-muted">
            Questions? The code is public: check{" "}
            {process.env.NEXT_PUBLIC_REPO_URL ? (
              <a href={process.env.NEXT_PUBLIC_REPO_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                the GitHub repository
              </a>
            ) : (
              "the repository"
            )}
            . <Link href="/analyze" className="text-accent hover:underline">Back to Analyze</Link>
          </p>
        </div>
    </PublicShell>
  );
}
