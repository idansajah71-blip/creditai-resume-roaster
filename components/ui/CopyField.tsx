"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded-[10px] border border-border bg-surface-muted px-3 py-2 font-mono text-sm">
        {value}
      </code>
      <button onClick={copy} className="btn btn-secondary px-3 py-2 text-sm">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}