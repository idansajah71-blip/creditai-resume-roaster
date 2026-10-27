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
      <code className="flex-1 truncate rounded-[6px] border border-line bg-paper-sunken px-3 py-2.5 font-mono text-sm text-ink">
        {value}
      </code>
      <button
        onClick={copy}
        aria-live="polite"
        className={`btn btn-secondary min-w-[88px] px-3 text-sm ${copied ? "text-green" : ""}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
