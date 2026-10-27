import Link from "next/link";
import PublicShell from "@/components/PublicShell";

export const metadata = {
  title: "Privacy notice | CreditAI",
  description: "What CreditAI stores, for how long, and how to delete your data.",
};

/* Long-form editorial page: narrow measure, serif section headings, no
   boxes, generous leading. Copy is deliberately plain. */
const li = "text-[15px] leading-7 text-ink-2";
const ul = "mt-3 list-disc space-y-2 pl-5";

export default function PrivacyPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-[680px]">
        <h1 className="type-display text-ink">Privacy notice</h1>
        <p className="mt-3 text-[15px] leading-7 text-ink-2">
          Plain language, no surprises. This is a demo application for evaluation purposes.
        </p>

        <div className="mt-10 space-y-10">
          <section>
            <h2 className="font-display text-[24px] leading-8 text-ink">What we store</h2>
            <ul className={ul}>
              <li className={li}>Your account email (auth via Supabase).</li>
              <li className={li}>
                Your resume and job description text <strong>only if</strong> you check &quot;Save my
                resume text for history&quot; on the Analyze page. By default, that box is unchecked and
                we store just the character counts of each text, e.g.{" "}
                <span className="font-mono text-ink">{`{"resumeChars": 1234, "jobChars": 500}`}</span>.
              </li>
              <li className={li}>
                Analysis results (match score, strengths, weaknesses, rewritten resume) so you can
                view them again in your history.
              </li>
              <li className={li}>
                Credit transactions and PayPal payment references, which we keep for accounting and
                dispute handling.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-[24px] leading-8 text-ink">How long we keep it</h2>
            <ul className={ul}>
              <li className={li}>Resume text you opted to save: kept until you delete it.</li>
              <li className={li}>
                Even saved text is nulled automatically when older than 30 days (scheduled database
                job).
              </li>
              <li className={li}>Credit and payment records: kept for financial integrity.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-[24px] leading-8 text-ink">Who sees your data</h2>
            <ul className={ul}>
              <li className={li}>
                PDFs are processed <strong>in memory</strong> to extract text and are never stored
                as files.
              </li>
              <li className={li}>
                Your resume and job description text are sent to the OpenAI API for analysis. OpenAI
                does not train on data sent through the API. Analysis outputs are stored in our
                database as described above.
              </li>
              <li className={li}>
                Payments use <strong>PayPal Sandbox</strong> (test mode). No real money moves, and we
                never see your PayPal credentials.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-[24px] leading-8 text-ink">How to delete your data</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li className={li}>
                Go to your Dashboard and click <strong>&quot;Delete my analysis data&quot;</strong>.
                This removes your analysis history permanently.
              </li>
              <li className={li}>
                Credit transactions and payment records are kept for accounting and cannot be
                deleted.
              </li>
              <li className={li}>Your account can be deleted via Supabase auth if you need full removal.</li>
            </ol>
          </section>

          <p className="text-[15px] leading-7 text-ink-2">
            Questions? The code is public: check{" "}
            {process.env.NEXT_PUBLIC_REPO_URL ? (
              <a
                href={process.env.NEXT_PUBLIC_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue underline underline-offset-2 hover:no-underline"
              >
                the GitHub repository
              </a>
            ) : (
              "the repository"
            )}
            .{" "}
            <Link href="/analyze" className="font-medium text-blue underline underline-offset-2 hover:no-underline">
              Back to Analyze
            </Link>
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
