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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-bold">
              CreditAI
            </Link>
            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
              Sandbox
            </span>
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
              Dashboard
            </Link>
            <Link href="/analyze" className="text-sm text-gray-600 hover:text-black">
              Analyze
            </Link>
            <Link href="/credits" className="text-sm text-gray-600 hover:text-black">
              Credits
            </Link>
            <Link href="/history" className="text-sm text-gray-600 hover:text-black">
              History
            </Link>
            <Link href="/transactions" className="text-sm text-gray-600 hover:text-black">
              Transactions
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded bg-gray-100 px-2 py-1">
              Balance: {profile?.credit_balance ?? 0} (reserved {profile?.credit_reserved ?? 0})
            </span>
            <LogoutButton />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}