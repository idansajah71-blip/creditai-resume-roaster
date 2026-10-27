import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppNav from "@/components/AppNav";
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
    <div className="min-h-screen">
      {/* Sticky header on paper with a bottom rule; the desktop nav underline
          merges into this rule. */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-[1140px] items-stretch justify-between gap-4 px-5 md:px-10">
          <Link
            href="/dashboard"
            className="inline-flex items-baseline gap-1.5 self-center py-3 font-display text-[22px] italic leading-none text-ink"
          >
            CreditAI
            <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-red-pen" />
          </Link>

          <AppNav links={links} variant="desktop" className="hidden md:block" />

          <div className="flex items-center gap-2">
            {/* Credit balance as a mono stamp, linking to /credits */}
            <Link
              href="/credits"
              className="inline-flex min-h-[44px] items-center rounded-[6px] border-2 border-ink px-2 py-1 font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink hover:bg-ink hover:text-paper md:min-h-[36px]"
            >
              Credits {profile?.credit_balance ?? 0}
            </Link>
            <LogoutButton />
          </div>
        </div>

        {/* Mobile: horizontally scrollable nav row */}
        <AppNav links={links} variant="mobile" />
      </header>

      <main className="mx-auto w-full max-w-[1140px] px-5 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
