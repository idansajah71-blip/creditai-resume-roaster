"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

type Package = { id: string; credits: number; amount: string };

const PACKAGES: Package[] = [
  { id: "credits_10", credits: 10, amount: "1.00" },
  { id: "credits_50", credits: 50, amount: "4.00" },
  { id: "credits_100", credits: 100, amount: "7.00" },
];

function CreditsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const capturedRef = useRef(false);

  async function refreshBalance() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("credit_balance").eq("id", user.id).single();
    setBalance(data?.credit_balance ?? 0);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshBalance();
  }, []);

  useEffect(() => {
    const token = params.get("token");
    const cancel = params.get("cancel");
    if (cancel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("Payment cancelled.");
      return;
    }
    if (token && !capturedRef.current) {
      capturedRef.current = true;
      setLoading(true);
      fetch(`/api/paypal/orders/${token}/capture`, { method: "POST" })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.message || "capture failed");
          setStatus(`Success. +${json.data.creditsGranted} credits added.`);
          setToast(`+${json.data.creditsGranted} credits added`);
          refreshBalance();
          router.refresh();
          setTimeout(() => router.push("/analyze"), 1500);
        })
        .catch((e) => {
          setError(String(e instanceof Error ? e.message : e));
          router.replace("/credits");
        })
        .finally(() => setLoading(false));
    }
  }, [params, router]);

  async function buy(packageId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/paypal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "create order failed");
      window.location.assign(json.data.approvalUrl);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "error";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[10px] border border-warning/30 bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
        PayPal Sandbox mode. No real money is used.
      </div>
      <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
        Buy credits
      </h1>
      <p className="text-ink-muted">
        Current balance: <span className="font-mono text-ink">{balance ?? "..."}</span>
      </p>
      {status && <p className="text-sm font-medium text-success">{status}</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Processing...</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {PACKAGES.map((p) => (
          <Card key={p.id}>
            <div className="text-2xl font-bold text-ink">{p.credits} credits</div>
            <div className="text-ink-muted">${p.amount} USD</div>
            <Button onClick={() => buy(p.id)} disabled={loading} className="mt-4 w-full">
              Buy
            </Button>
          </Card>
        ))}
      </div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading...</p>}>
      <CreditsInner />
    </Suspense>
  );
}