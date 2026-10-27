"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ConfirmDialog";

// Privacy control: deletes the user's analysis history (ai_jobs rows).
// Credit ledger and payment records are kept for financial integrity.
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
    <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-ink">Delete my analysis data</h2>
        <p className="text-sm text-ink-muted">
          Removes your analysis history. Credit and payment records are kept for accounting.
        </p>
        <a href="/privacy" className="mt-1 inline-block text-xs font-medium text-accent hover:underline">
          Privacy notice
        </a>
      </div>
      <div className="text-sm">
        {done !== null && !error && <span className="text-success">Deleted {done} analyses.</span>}
        {error && <p className="text-danger" role="alert">{error}</p>}
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete my analysis data
        </Button>
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
    </Card>
  );
}
