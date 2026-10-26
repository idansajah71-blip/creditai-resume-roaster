import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currentUser = user;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, credit_balance, credit_reserved")
    .eq("id", currentUser.id)
    .single();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/analyze", label: "Analyze" },
    { href: "/credits", label: "Credits" },
    { href: "/history", label: "History" },
    { href: "/transactions", label: "Transactions" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3 md:px-8">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-ink">
            <span className="h-3 w-3 rounded-sm bg-accent" />
            CreditAI
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-[10px] px-3 py-2 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/credits"
              className="rounded-full border border-border bg-surface-muted px-3 py-1.5 font-mono text-sm text-ink"
            >
              {profile?.credit_balance ?? 0} credits
            </Link>
            <LogoutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-5 py-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-[10px] px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-muted"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1120px] px-5 py-8 md:px-8">{children}</main>
    </div>
  );
}