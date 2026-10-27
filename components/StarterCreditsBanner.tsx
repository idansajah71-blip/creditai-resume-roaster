"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "starter-banner-dismissed";

// Free starter credits notice. Shown on pages where a first analysis happens
// while the account only holds the signup grant and has not purchased yet.
type StarterPayload = { active: boolean; credits: number };

export default function StarterCreditsBanner() {
  const [status, setStatus] = useState<StarterPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/starter");
        const json = await res.json();
        if (!cancelled && json.success && json.data?.active) {
          setStatus({ active: true, credits: Number(json.data.credits) });
        }
      } catch {
        // Banner is optional; ignore lookup failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage unavailable (private mode): keep it hidden for this view only.
    }
  }, []);

  if (dismissed || !status?.active) return null;

  return (
    <div
      className="flex items-start justify-between gap-3 rounded-[10px] border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success"
      role="status"
    >
      <span>
        You have {status.credits} free credits to try the analysis. Buy more any time on the{" "}
        <Link href="/credits" className="underline underline-offset-2">
          Credits page
        </Link>
        .
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded px-1 text-sm font-semibold text-success hover:opacity-80"
        aria-label="Dismiss banner"
      >
        Dismiss
      </button>
    </div>
  );
}
