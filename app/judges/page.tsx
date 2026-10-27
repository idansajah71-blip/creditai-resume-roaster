"use client";

import { useRouter } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import { CopyField } from "@/components/ui/CopyField";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const buyerEmail = process.env.NEXT_PUBLIC_PAYPAL_BUYER_EMAIL || "sb-buyer@example.com";
const buyerPass = process.env.NEXT_PUBLIC_PAYPAL_BUYER_PASSWORD || "placeholder";

export default function JudgesPage() {
  const router = useRouter();

  async function startDemo() {
    router.push("/login?next=%2Fdashboard");
  }

  return (
    <PublicShell>
      <div className="space-y-8">
        <div className="rounded-[10px] border border-warning/30 bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          PayPal Sandbox mode. No real money is used.
        </div>
        <h1 className="text-[32px] font-semibold leading-[38px] text-ink md:text-[40px] md:leading-[44px]">
          Judge quick-start
        </h1>

        <Card>
          <h2 className="text-lg font-semibold text-ink">Demo app account</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Each judge gets a fresh, ephemeral account with 5 free credits. Accounts expire after 24
            hours. No shared password is required.
          </p>
          <div className="mt-4">
            <Button onClick={startDemo}>Start a fresh demo session</Button>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">PayPal Sandbox buyer</h2>
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Email</div>
              <CopyField value={buyerEmail} />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Password</div>
              <CopyField value={buyerPass} />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">Try it in 2 minutes</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>Log in with the demo account.</li>
            <li>Click Use sample and run the analysis.</li>
            <li>Buy 10 credits with the sandbox buyer and watch the balance update.</li>
          </ol>
        </Card>
      </div>
    </PublicShell>
  );
}