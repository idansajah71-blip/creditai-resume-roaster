"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PublicShell from "@/components/PublicShell";
import AuthSplit from "@/components/AuthSplit";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Highlight, RedUnderline } from "@/components/ui/annotations";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // When the project requires email confirmation, signup succeeds but no
    // session is created; sending the user to /dashboard would bounce them
    // back to /login. Tell them what to do instead.
    if (!data?.session) {
      setError(null);
      setConfirmEmail(true);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <PublicShell>
      <AuthSplit
        quote={
          <>
            <Highlight>Led a team</Highlight> is a claim. Three engineers, one quarter, one{" "}
            <RedUnderline>launch</RedUnderline> is a fact.
          </>
        }
      >
        <Sheet className="mx-auto max-w-[480px] p-6 md:p-8">
          <h1 className="type-display text-ink">Create account</h1>
          <p className="mt-1 text-sm text-ink-3">Three free starter credits to try the review.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-red-pen" role="alert">
                {error}
              </p>
            )}
            {confirmEmail && (
              <p
                className="rounded-[10px] border border-green/40 bg-green-soft px-3 py-2 text-sm leading-5 text-ink-2"
                role="status"
              >
                Account created. Check <span className="font-mono">{email}</span> for the confirmation link, then log
                in.
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full">
              Register
            </Button>
          </form>
          <p className="mt-6 text-sm text-ink-2">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-blue underline underline-offset-2 hover:no-underline">
              Log in
            </Link>
          </p>
        </Sheet>
      </AuthSplit>
    </PublicShell>
  );
}
