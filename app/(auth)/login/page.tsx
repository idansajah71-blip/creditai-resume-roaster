"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PublicShell from "@/components/PublicShell";
import AuthSplit from "@/components/AuthSplit";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { RedUnderline, Rule } from "@/components/ui/annotations";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <PublicShell>
      <AuthSplit
        quote={
          <>
            Your resume reads like the job description that wrote it. <RedUnderline>Show me numbers.</RedUnderline>
          </>
        }
      >
        <Sheet className="mx-auto max-w-[480px] p-6 md:p-8">
          <h1 className="font-display text-[34px] leading-10 text-ink">Log in</h1>
          <p className="mt-1 text-sm text-ink-3">Welcome back.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-red-pen" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full">
              Log in
            </Button>
          </form>

          <Rule label="or" className="my-6" />

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            loading={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const res = await fetch("/api/demo/session", { method: "POST" });
                const json = await res.json();
                if (!json.success) {
                  setError(json.message || "Demo session unavailable.");
                  setLoading(false);
                  return;
                }
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithPassword({
                  email: json.data.email,
                  password: json.data.password,
                });
                setLoading(false);
                if (error) setError(error.message);
                else {
                  router.push(next);
                  router.refresh();
                }
              } catch {
                setLoading(false);
                setError("Demo session unavailable.");
              }
            }}
          >
            Log in as demo judge
          </Button>
          <p className="mt-2 text-xs leading-5 text-ink-2">Pre-funded demo account for reviewers.</p>
          <p className="mt-1 font-mono text-[11px] leading-4 text-ink-3">
            Creates a fresh account with 5 free credits. Expires after 24 hours.
          </p>
          <p className="mt-6 text-sm text-ink-2">
            No account?{" "}
            <Link href="/register" className="font-medium text-blue underline underline-offset-2 hover:no-underline">
              Register
            </Link>
          </p>
        </Sheet>
      </AuthSplit>
    </PublicShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
