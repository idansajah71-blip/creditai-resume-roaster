// Starter-credits banner decision: shown when the ledger contains a signup
// grant (reference_type 'signup_grant') and no purchase yet (any PayPal
// ledger entry, capture or webhook grant).
//
// Demo credits (reference_type 'demo_grant') are NOT a signup grant and are
// filtered out before this helper runs, so ephemeral demo sessions with a
// purchased package do not trigger the banner.
export const SIGNUP_REFERENCE_TYPE = "signup_grant";
export const PURCHASE_REFERENCE_TYPES = ["paypal_capture", "paypal_webhook"] as const;

export type StartupLedgerRow = {
  amount: string | number;
  reference_type: string | null;
};

export type StarterStatus = {
  active: boolean;
  credits: number;
};

export function starterBannerStatus(rows: StartupLedgerRow[]): StarterStatus {
  const credits = rows
    .filter((r) => r.reference_type === SIGNUP_REFERENCE_TYPE)
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const purchased = rows.some(
    (r) => typeof r.reference_type === "string" && (PURCHASE_REFERENCE_TYPES as readonly string[]).includes(r.reference_type),
  );
  return { active: credits > 0 && !purchased, credits };
}
