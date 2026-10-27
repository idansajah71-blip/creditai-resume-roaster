import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import { Stamp } from "@/components/ui/annotations";

/* On-brand 404: a rejected page stamp, minimal copy, two links. */
export default function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-[560px] py-10 text-center md:py-20">
        <div className="inline-block">
          <Stamp tone="red">404</Stamp>
        </div>
        <h1 className="mt-6 type-display text-ink">
          Cut from the manuscript.
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-2">
          The editor marked this page for removal. It never made it to print.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary px-5 text-sm">
            Go home
          </Link>
          <Link href="/judges" className="btn btn-secondary px-5 text-sm">
            Judge guide
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
