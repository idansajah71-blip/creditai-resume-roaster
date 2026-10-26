"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PublicShell from "@/components/PublicShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

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
      <div className="mx-auto max-w-[420px]">
        <div className="card p-8">
          <h1 className="text-[28px] font-semibold leading-[34px] text-ink">Log in</h1>
          <p className="mt-1 text-sm text-ink-muted">Welcome back.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
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
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full">
              Log in
            </Button>
          </form>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-[0.06em] text-ink-faint">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={async () => {
              setLoading(true);
              const supabase = createClient();
              const e = process.env.NEXT_PUBLIC_DEMO_EMAIL || "demo@creditai.local";
              const p = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "DemoPass123!";
              const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
              setLoading(false);
              if (error) setError(error.message);
              else {
                router.push(next);
                router.refresh();
              }
            }}
          >
            Log in as demo judge
          </Button>
          <p className="mt-2 text-xs text-ink-muted">Pre-funded demo account for reviewers.</p>
          <p className="mt-4 text-sm text-ink-muted">
            No account?{" "}
            <Link href="/register" className="text-accent hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
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