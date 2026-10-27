"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";

type Checks = {
  database: boolean;
  paypal: boolean;
  openai_configured: boolean;
  webhook_configured: boolean;
};

const ROWS: { key: keyof Checks; label: string; ok: string; fail: string }[] = [
  { key: "database", label: "Database (Supabase)", ok: "Connected", fail: "Down" },
  { key: "paypal", label: "PayPal Sandbox API", ok: "Connected", fail: "Down" },
  { key: "openai_configured", label: "OpenAI API key", ok: "Configured", fail: "Missing" },
  { key: "webhook_configured", label: "PayPal webhook", ok: "Configured", fail: "Missing" },
];

/* Rubber-stamp status rows: OK stamps green, DOWN stamps red-pen, all in
   monospaced uppercase like a print proof sheet. */
export default function SystemStatusCard() {
  const [checks, setChecks] = useState<Checks | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setChecks(j.checks ?? null);
      })
      .catch(() => {
        if (alive) setChecks(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Sheet className="p-5">
      <h2 className="type-h3 text-ink">System status</h2>
      <p className="mt-1 text-sm leading-6 text-ink-2">Live health of the services this app depends on.</p>
      <ul className="mt-4 space-y-0 text-sm">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
            <span className="text-ink-2">{row.label}</span>
            {!checks ? (
              <span className="font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-ink-3">
                Checking...
              </span>
            ) : checks[row.key] ? (
              <span className="font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-green">
                {row.ok}
              </span>
            ) : (
              <span className="font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-red-pen">
                {row.fail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
