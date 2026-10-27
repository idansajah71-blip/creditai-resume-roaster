"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

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
    <Card>
      <h2 className="text-lg font-semibold text-ink">System status</h2>
      <p className="mt-1 text-sm text-ink-muted">Live health of the services this app depends on.</p>
      <ul className="mt-4 space-y-2 text-sm">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3">
            <span className="text-ink">{row.label}</span>
            {!checks ? (
              <Badge variant="neutral">Checking...</Badge>
            ) : checks[row.key] ? (
              <Badge variant="success">{row.ok}</Badge>
            ) : (
              <Badge variant="danger">{row.fail}</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
