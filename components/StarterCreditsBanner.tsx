"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Highlight } from "@/components/ui/annotations";

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
      className="flex items-start justify-between gap-3 rounded-[10px] border border-line bg-paper-sunken px-4 py-3 text-sm leading-6 text-ink-2"
      role="status"
    >
      <span>
        You have <Highlight>{status.credits}</Highlight> free credits to try the analysis. Buy more any time on the{" "}
        <Link href="/credits" className="font-medium text-blue underline underline-offset-2">
          Credits page
        </Link>
        .
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 min-h-[44px] px-1 font-medium text-ink-3 hover:text-ink md:min-h-0 md:py-0"
        aria-label="Dismiss banner"
      >
        Dismiss
      </button>
    </div>
  );
}
