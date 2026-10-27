"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ConfirmDialog";

// Privacy control: deletes the user's analysis history (ai_jobs rows).
// Credit ledger and payment records are kept for financial integrity.
// Rendered as a quiet bottom section: rule, no sheet, muted text.
export default function DeleteDataSection() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete-data", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "Delete failed");
      } else {
        setDone(json.data.deleted ?? 0);
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
      setOpen(false);
      window.location.reload();
    }
  }

  return (
    <section className="border-t border-line pt-8">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="type-h3 text-ink">Delete my analysis data</h2>
          <p className="mt-1 max-w-md text-sm leading-5 text-ink-3">
            Removes your analysis history. Credit and payment records are kept for accounting.{" "}
            <a href="/privacy" className="font-medium text-blue underline underline-offset-2">
              Privacy notice
            </a>
          </p>
        </div>
        <div className="shrink-0">
          {done !== null && !error && <span className="block text-sm font-medium text-green">Deleted {done} analyses.</span>}
          {error && (
            <p className="text-sm font-medium text-red-pen" role="alert">
              {error}
            </p>
          )}
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete my analysis data
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={open}
        title="Delete analysis data?"
        description="This permanently removes your analysis history. Your credit balance, transaction history, and payment records are not affected. This cannot be undone."
        confirmLabel="Delete data"
        busy={busy}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}
