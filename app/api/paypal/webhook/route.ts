import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/paypal";
import { grantCredits } from "@/lib/credits";

export async function POST(request: Request) {
  const raw = await request.text();
  let event: {
    id?: string;
    event_type?: string;
    resource?: {
      id?: string;
      amount?: { value?: string; currency_code?: string };
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const verifyHeaders: Record<string, string> = {
    "paypal-auth-algo": headers["paypal-auth-algo"] || "",
    "paypal-cert-url": headers["paypal-cert-url"] || "",
    "paypal-transmission-id": headers["paypal-transmission-id"] || "",
    "paypal-transmission-sig": headers["paypal-transmission-sig"] || "",
    "paypal-transmission-time": headers["paypal-transmission-time"] || "",
  };

  const ok = await verifyWebhookSignature(verifyHeaders, event);
  if (!ok) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const service = createServiceClient();
  const eventId = event?.id;
  if (!eventId) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  // Dedup: if already processed, skip.
  const { data: existing } = await service
    .from("paypal_webhook_events")
    .select("processed")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing?.processed) {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  if (!existing) {
    const { error: insertErr } = await service.from("paypal_webhook_events").insert({
      event_id: eventId,
      event_type: event.event_type,
      payload: event,
    });
    if (insertErr) {
      // Race: re-check.
      const { data: again } = await service
        .from("paypal_webhook_events")
        .select("processed")
        .eq("event_id", eventId)
        .maybeSingle();
      if (again?.processed) {
        return NextResponse.json({ success: true }, { status: 200 });
      }
    }
  }

  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const resource = event.resource || {};
    const captureId = resource.id;
    const orderId = resource?.supplementary_data?.related_ids?.order_id;
    const amount = resource?.amount?.value;
    const currency = resource?.amount?.currency_code;

    if (orderId) {
      const { data: order } = await service
        .from("paypal_orders")
        .select("*")
        .eq("paypal_order_id", orderId)
        .maybeSingle();

      if (order && order.status !== "captured") {
        if (
          amount !== undefined &&
          currency !== undefined &&
          Number(amount) === Number(order.amount_value) &&
          currency === order.currency
        ) {
          try {
            await grantCredits(
              order.user_id,
              order.credits_to_grant,
              captureId || eventId,
              "paypal_webhook",
              captureId || eventId,
            );
          } catch (e) {
            console.error("webhook grant failed", eventId, e instanceof Error ? e.message : e);
            return NextResponse.json({ success: false }, { status: 500 });
          }
          await service
            .from("paypal_orders")
            .update({ status: "captured", capture_id: captureId })
            .eq("paypal_order_id", orderId);
        }
      }
    }
  }

  await service
    .from("paypal_webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("event_id", eventId);

  return NextResponse.json({ success: true }, { status: 200 });
}