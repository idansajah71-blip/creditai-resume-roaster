"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

/* Public shell, "The Red Pen" edition. Client component only for the mobile
   disclosure menu; pages pass plain children elements, which serialize fine
   across the server/client boundary. */
/* The wordmark: serif italic "CreditAI" plus a small red-pen dot. */
function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex items-baseline gap-1.5 font-display text-[22px] italic leading-none text-ink"
    >
      CreditAI
      <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-red-pen" />
    </Link>
  );
}

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const close = () => setMenuOpen(false);
  const repoUrl = process.env.NEXT_PUBLIC_REPO_URL;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Announcement strip */}
      <div className="bg-paper-sunken py-1.5 text-center font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-ink-3">
        PayPal Sandbox. No real money is used.
      </div>

      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-[1140px] items-center justify-between gap-4 px-5 py-3 md:px-10">
          <Wordmark />

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            <Link href="/judges" className="btn btn-ghost px-3 text-sm">
              Judge guide
            </Link>
            <Link href="/login" className="btn btn-secondary px-3 text-sm">
              Log in
            </Link>
            <Link href="/register" className="btn btn-primary px-4 text-sm">
              Start free
            </Link>
          </nav>

          <button
            type="button"
            className="btn btn-secondary px-3 md:hidden"
            aria-expanded={menuOpen}
            aria-controls="public-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? "close" : "menu"} className="h-5 w-5" />
            <span className="sr-only">Menu</span>
          </button>
        </div>

        {/* Mobile disclosure menu */}
        <nav
          id="public-mobile-menu"
          aria-label="Mobile"
          className={`bg-sheet md:hidden ${menuOpen ? "border-t border-line" : "hidden"}`}
        >
          <div className="mx-auto flex w-full max-w-[1140px] flex-col px-5 py-2 md:px-10">
            <Link
              href="/judges"
              onClick={close}
              className="flex min-h-[44px] items-center border-b border-line text-sm text-ink"
            >
              Judge guide
            </Link>
            <Link
              href="/login"
              onClick={close}
              className="flex min-h-[44px] items-center border-b border-line text-sm text-ink"
            >
              Log in
            </Link>
            <Link href="/register" onClick={close} className="btn btn-primary my-2 w-full text-sm">
              Start free
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1140px] flex-1 px-5 py-8 md:px-10 md:py-12">{children}</main>

      <footer className="border-t border-line bg-paper">
        <div className="mx-auto w-full max-w-[1140px] px-5 py-8 md:px-10 md:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <Wordmark />
              <p className="mt-2 max-w-md text-sm leading-6 text-ink-3">
                AI resume analysis and rewriting with PayPal Sandbox credits.
              </p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/judges" className="min-h-[44px] py-1 text-ink-2 underline-offset-2 hover:underline">
                Judge guide
              </Link>
              <Link href="/privacy" className="min-h-[44px] py-1 text-ink-2 underline-offset-2 hover:underline">
                Privacy
              </Link>
              {repoUrl && (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[44px] py-1 text-ink-2 underline-offset-2 hover:underline"
                >
                  GitHub
                </a>
              )}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
