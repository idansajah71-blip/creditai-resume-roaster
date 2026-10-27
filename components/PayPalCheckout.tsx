"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { fetchWithTimeout, clientErrorMessage, PAYPAL_UNREACHABLE_MESSAGE } from "@/lib/fetch-timeout";

type PackageItem = { id: string; credits: number; amount: string };

type ButtonsInstance = {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => void;
};

type PayPalApi = {
  Buttons: (options: {
    style?: Record<string, string>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => void;
    onCancel: () => void;
    onError: (err: unknown) => void;
  }) => ButtonsInstance;
};

declare global {
  interface Window {
    paypal?: PayPalApi;
  }
}

export type PayPalCheckoutStatus = "captured" | "cancelled" | "error";

export type CheckoutPayload = {
  creditsGranted?: number;
  balance?: number;
  message?: string;
};

function PackSheet({
  p,
  children,
}: {
  p: PackageItem;
  children: React.ReactNode;
}) {
  return (
    <Sheet className="flex flex-col">
      <div className="type-label">{p.credits} credits</div>
      <div className="mt-3 font-mono text-[32px] leading-9 text-ink">${p.amount}</div>
      <div className="mt-1 font-mono text-xs text-ink-3">
        ${(parseFloat(p.amount) / p.credits).toFixed(2)} per credit
      </div>
      <div className="mt-auto pt-4">{children}</div>
    </Sheet>
  );
}

export default function PayPalCheckout({
  packages,
  onStatus,
  onRedirect,
  redirectDisabled,
}: {
  packages: PackageItem[];
  onStatus: (status: PayPalCheckoutStatus, payload?: CheckoutPayload) => void;
  onRedirect: (packageId: string) => void;
  redirectDisabled?: boolean;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const containers = useRef<Record<string, HTMLDivElement | null>>({});

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const useSdk = Boolean(clientId) && sdkReady && !sdkFailed;

  useEffect(() => {
    if (!useSdk) return;
    const rendered: ButtonsInstance[] = [];
    (async () => {
      for (const p of packages) {
        const el = containers.current[p.id];
        if (!el || !window.paypal) continue;
        el.innerHTML = "";
        const buttons = window.paypal.Buttons({
          style: { layout: "vertical", shape: "pill", label: "paypal" },
          createOrder: async () => {
            setBusy(p.id);
            try {
              const res = await fetchWithTimeout("/api/paypal/orders", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "idempotency-key": crypto.randomUUID(),
                },
                body: JSON.stringify({ packageId: p.id }),
              });
              const json = await res.json();
              if (!json.success) {
                throw new Error(json.message || PAYPAL_UNREACHABLE_MESSAGE);
              }
              return json.data.paypalOrderId as string;
            } finally {
              // Always clear the busy state, even when the call hangs.
              setBusy(null);
            }
          },
          onApprove: async (data) => {
            setBusy(p.id);
            try {
              const res = await fetchWithTimeout(`/api/paypal/orders/${data.orderID}/capture`, {
                method: "POST",
              });
              const json = await res.json();
              if (!json.success) {
                throw new Error(json.message || PAYPAL_UNREACHABLE_MESSAGE);
              }
              onStatus("captured", {
                creditsGranted: json.data.creditsGranted,
                balance: json.data.balance,
              });
            } catch (e) {
              onStatus("error", { message: clientErrorMessage(e) });
            } finally {
              // Always clear the busy state, even when the call hangs.
              setBusy(null);
            }
          },
          onCancel: () => onStatus("cancelled"),
          onError: () => onStatus("error"),
        });
        rendered.push(buttons);
        await buttons.render(el).catch(() => onStatus("error"));
      }
    })();
    return () => {
      for (const b of rendered) {
        try {
          b.close?.();
        } catch {
          // ignore
        }
      }
    };
  }, [useSdk, packages, onStatus]);

  if (!clientId) {
    // Fallback: old redirect flow.
    return (
      <div className="grid gap-6 md:grid-cols-3 md:gap-8">
        {packages.map((p) => (
          <PackSheet key={`pack-${p.id}`} p={p}>
            <Button onClick={() => onRedirect(p.id)} disabled={redirectDisabled} className="w-full">
              Buy with PayPal
            </Button>
          </PackSheet>
        ))}
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`}
        onLoad={() => setSdkReady(true)}
        onError={() => setSdkFailed(true)}
      />
      <div className="grid gap-6 md:grid-cols-3 md:gap-8">
        {packages.map((p) => (
          <PackSheet key={`pack-${p.id}`} p={p}>
            {sdkFailed ? (
              <Button onClick={() => onRedirect(p.id)} disabled={redirectDisabled} className="w-full">
                Buy with PayPal
              </Button>
            ) : (
              <div className="relative flex min-h-[48px] items-center">
                {!useSdk && (
                  <p className="font-mono text-xs text-ink-3" aria-live="polite">
                    Loading PayPal...
                  </p>
                )}
                <div ref={(el) => { containers.current[p.id] = el; }} />
                {busy === p.id && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-sheet/80 font-mono text-xs text-ink-3">
                    Processing...
                  </div>
                )}
              </div>
            )}
          </PackSheet>
        ))}
      </div>
    </>
  );
}
