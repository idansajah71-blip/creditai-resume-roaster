"use client";

import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import { Button } from "@/components/ui/Button";
import { Stamp } from "@/components/ui/annotations";

/* Runtime error fallback: honest heading, a retry, a way home, and an
   optional digest line in mono so a bug report is actionable. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PublicShell>
      <div className="mx-auto max-w-[560px] py-10 text-center md:py-20" role="alert">
        <div className="inline-block">
          <Stamp tone="red">Error</Stamp>
        </div>
        <h1 className="mt-6 type-display text-ink">
          Something tore the page.
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          The request failed while loading this view. Try again; if it keeps failing, check the{" "}
          <Link href="/judges" className="font-medium text-blue underline underline-offset-2 hover:no-underline">
            system status
          </Link>
          .
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className="btn btn-secondary px-5 text-sm">
            Go home
          </Link>
        </div>
        {error?.digest && <p className="mt-8 font-mono text-xs text-ink-3">Digest {error.digest}</p>}
      </div>
    </PublicShell>
  );
}
