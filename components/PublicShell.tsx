import Link from "next/link";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-accent-soft text-center text-sm font-medium text-accent" style={{ height: 36, lineHeight: "36px" }}>
        PayPal Sandbox mode. No real money is used.
      </div>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-2 font-bold text-ink">
            <span className="h-3 w-3 rounded-sm bg-accent" />
            CreditAI
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/judges" className="btn btn-ghost px-3 py-2 text-sm">
              Judge guide
            </Link>
            <Link href="/login" className="btn btn-secondary px-3 py-2 text-sm">
              Log in
            </Link>
            <Link href="/register" className="btn btn-primary px-3 py-2 text-sm">
              Get started
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1120px] px-5 py-8 md:px-8">{children}</main>
    </div>
  );
}