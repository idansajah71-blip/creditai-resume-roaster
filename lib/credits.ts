import { createServiceClient } from "@/lib/supabase/server";

export type GrantResult = { granted: boolean; balance: number };

export async function grantCredits(
  userId: string,
  amount: number,
  idempotencyKey: string,
  referenceType: string,
  referenceId: string,
): Promise<GrantResult> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("grant_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_idempotency: idempotencyKey,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { granted: Boolean(row?.granted), balance: Number(row?.balance ?? 0) };
}

export type ReserveResult = { reservationId: string; balance: number; reserved: number };

export async function reserveCredit(userId: string, amount: number, idempotencyKey: string): Promise<ReserveResult> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_idempotency: idempotencyKey,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.reservation_id) throw new Error("reserve_failed");
  return {
    reservationId: row.reservation_id,
    balance: Number(row.balance ?? 0),
    reserved: Number(row.reserved ?? 0),
  };
}

export async function consumeReservation(reservationId: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.rpc("consume_reservation", { p_reservation_id: reservationId });
  if (error) throw error;
}

export async function refundReservation(reservationId: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.rpc("refund_reservation", { p_reservation_id: reservationId });
  if (error) throw error;
}

export { createServiceClient };