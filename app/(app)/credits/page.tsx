"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Package = { id: string; credits: number; amount: string };

const PACKAGES: Package[] = [
  { id: "credits_10", credits: 10, amount: "1.00" },
  { id: "credits_50", credits: 50, amount: "4.00" },
  { id: "credits_100", credits: 100, amount: "7.00" },
];

function CreditsInner() {
  const params = useSearchParams();
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshBalance() {
    const supabase = (await import("@/lib/supabase/client")).createClient();
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
    if (token) {
      // capture
      setLoading(true);
      fetch(`/api/paypal/orders/${token}/capture`, { method: "POST" })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.message || "capture failed");
          setStatus(`Captured: +${json.data.creditsGranted} credits. New balance: ${json.data.balance}`);
          refreshBalance();
        })
        .catch((e) => setError(String(e.message || e)))
        .finally(() => setLoading(false));
    }
  }, [params]);

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
      <div className="inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
        Sandbox mode — no real money
      </div>
      <h1 className="text-2xl font-bold">Buy Credits</h1>
      <p className="text-gray-600">Current balance: {balance ?? "..."}</p>
      {status && <p className="text-green-600">{status}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {loading && <p>Loading...</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {PACKAGES.map((p) => (
          <div key={p.id} className="rounded border bg-white p-4">
            <h3 className="font-semibold">{p.credits} credits</h3>
            <p className="text-gray-600">${p.amount} USD</p>
            <button
              onClick={() => buy(p.id)}
              disabled={loading}
              className="mt-3 rounded bg-black px-3 py-2 text-white disabled:opacity-50"
            >
              Buy
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CreditsInner />
    </Suspense>
  );
}