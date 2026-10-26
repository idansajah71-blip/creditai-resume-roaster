"use client";

import { useState } from "react";

const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL || "demo@creditai.local";
const demoPass = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "DemoPass123!";
const buyerEmail = process.env.NEXT_PUBLIC_PAYPAL_BUYER_EMAIL || "sb-buyer@example.com";
const buyerPass = process.env.NEXT_PUBLIC_PAYPAL_BUYER_PASSWORD || "placeholder";

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <code className="text-sm">{value}</code>
        <button onClick={copy} className="rounded border px-2 py-1 text-xs">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function JudgesPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="rounded border bg-amber-100 p-3 text-sm font-semibold text-amber-900">
        Sandbox mode — no real money is used.
      </div>
      <h1 className="text-3xl font-bold">Judge Quick-Start</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Demo app account</h2>
        <p className="text-sm">Starts with 5 free credits.</p>
        <CopyBox label="Email" value={demoEmail} />
        <CopyBox label="Password" value={demoPass} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">PayPal Sandbox buyer</h2>
        <CopyBox label="Email" value={buyerEmail} />
        <CopyBox label="Password" value={buyerPass} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Try it in 2 minutes</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Log in with the demo account.</li>
          <li>Click &quot;Use sample&quot; and run the analysis.</li>
          <li>Buy 10 credits with the sandbox buyer and watch the balance update.</li>
        </ol>
      </section>
    </main>
  );
}