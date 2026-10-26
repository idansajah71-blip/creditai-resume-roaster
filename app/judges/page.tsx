export default function JudgesPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">Judge Quick-Start</h1>

      <section className="rounded border bg-amber-50 p-4">
        <h2 className="font-semibold">Sandbox mode</h2>
        <p className="text-sm">
          This app uses PayPal Sandbox only. No real money is charged. Use the provided Sandbox buyer
          account (see below) to complete a test purchase.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Demo account</h2>
        <p className="text-sm">
          Create via seed script: <code>npm run seed:demo</code> (requires service role key). Default
          credentials are printed by the script. The account receives 5 auditable demo credits.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Quick test flow</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Register or login with the demo account.</li>
          <li>Open Analyze, click &quot;Use sample&quot;, run analysis (costs 1 credit).</li>
          <li>Verify score, strengths, weaknesses, recommendations, rewritten resume.</li>
          <li>Use Copy and Download controls.</li>
          <li>Open Credits, buy a package, approve in PayPal Sandbox, capture.</li>
          <li>Check balance and Transactions page for the ledger entry.</li>
          <li>Open History for past analyses.</li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Security notes</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>PayPal and OpenAI secrets are server-only.</li>
          <li>Credit mutations use atomic DB functions with row locks.</li>
          <li>RLS ensures users only see their own records.</li>
          <li>Webhook signature is verified before processing.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Error scenarios covered</h2>
        <p className="text-sm">
          Insufficient credits returns 402. AI failure or malformed output refunds the reservation.
          Duplicate capture/webhook delivery is idempotent.
        </p>
      </section>
    </main>
  );
}