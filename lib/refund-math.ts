// Pure helpers for refund eligibility, allocation and money rounding.
// All amounts are handled in integer cents to avoid float drift.

export type OrderLike = {
  paypal_order_id: string;
  capture_id: string | null;
  amount_value: string | number;
  currency: string;
  credits_to_grant: number;
  refunded_credits: number;
  refunded_amount: string | number;
  created_at?: string;
};

export type Allocation = {
  order: OrderLike;
  credits: number;
  amountCents: number;
};

export function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function remainingCredits(o: OrderLike): number {
  return Math.max(0, o.credits_to_grant - o.refunded_credits);
}

// Per-credit unit price of an order, in cents (rounded).
export function unitCents(o: OrderLike): number {
  return Math.round(toCents(o.amount_value) / o.credits_to_grant);
}

// Cash left in the order that has not been refunded yet, in cents.
export function remainingCents(o: OrderLike): number {
  const left = toCents(o.amount_value) - Math.round(Number(o.refunded_amount) * 100);
  return Math.max(0, left);
}

// Refund amount for n credits on an order, capped by the cash left in the order.
export function refundAmountCents(o: OrderLike, credits: number): number {
  return Math.max(0, Math.min(unitCents(o) * credits, remainingCents(o)));
}

// Allocate credits across orders, newest first (orders must be pre-sorted).
// Returns null if the request cannot be fulfilled within refundable + balance.
export function allocateRefund(
  ordersNewestFirst: OrderLike[],
  credits: number,
  balance: number,
): Allocation[] | null {
  if (!Number.isInteger(credits) || credits <= 0) return null;
  if (credits > balance) return null;

  const segments: Allocation[] = [];
  let left = credits;
  for (const o of ordersNewestFirst) {
    if (left <= 0) break;
    const take = Math.min(left, remainingCredits(o));
    if (take <= 0) continue;
    const amountCents = refundAmountCents(o, take);
    if (amountCents <= 0) continue;
    segments.push({ order: o, credits: take, amountCents });
    left -= take;
  }
  if (left > 0) return null;
  return segments;
}

// Deterministic credit usage estimate for the AI agent facts.
export function estimateCreditsUsed(purchasedCredits: number, refundableCredits: number, balance: number): number {
  return Math.max(0, purchasedCredits - refundableCredits - balance);
}
