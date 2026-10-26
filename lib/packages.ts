export const CREDIT_PACKAGES = {
  credits_10: { credits: 10, amount: "1.00", currency: "USD" },
  credits_50: { credits: 50, amount: "4.00", currency: "USD" },
  credits_100: { credits: 100, amount: "7.00", currency: "USD" },
} as const;

export type PackageId = keyof typeof CREDIT_PACKAGES;

export function getPackage(id: string) {
  if (id in CREDIT_PACKAGES) {
    return CREDIT_PACKAGES[id as PackageId];
  }
  return null;
}