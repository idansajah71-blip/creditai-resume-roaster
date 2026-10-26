import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { capturePayPalOrder, getPayPalOrder } from "@/lib/paypal";
import { grantCredits } from "@/lib/credits";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: order } = await service
    .from("paypal_orders")
    .select("*")
    .eq("paypal_order_id", id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ success: false, message: "order not found" }, { status: 404 });
  }
  if (order.user_id !== user.id) {
    return NextResponse.json({ success: false, message: "forbidden" }, { status: 403 });
  }

  if (order.status === "captured") {
    const { data: profile } = await service
      .from("profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();
    return NextResponse.json({
      success: true,
      data: {
        status: "captured",
        creditsGranted: order.credits_to_grant,
        balance: profile?.credit_balance ?? 0,
        idempotent: true,
      },
    });
  }

  let capture;
  try {
    capture = await capturePayPalOrder(id);
  } catch {
    // Possibly already captured (by webhook or prior request). Fetch order details.
    try {
      capture = await getPayPalOrder(id);
    } catch {
      await service.from("paypal_orders").update({ status: "failed" }).eq("paypal_order_id", id);
      return NextResponse.json({ success: false, message: "paypal capture failed" }, { status: 502 });
    }
    if (!capture || capture.status !== "COMPLETED") {
      await service.from("paypal_orders").update({ status: "failed" }).eq("paypal_order_id", id);
      return NextResponse.json({ success: false, message: "paypal capture failed" }, { status: 502 });
    }
  }

  if (capture.status !== "COMPLETED" || capture.captureStatus !== "COMPLETED") {
    await service.from("paypal_orders").update({ status: "failed" }).eq("paypal_order_id", id);
    return NextResponse.json({ success: false, message: "capture not completed" }, { status: 409 });
  }

  if (
    capture.amount === null ||
    Number(capture.amount) !== Number(order.amount_value) ||
    capture.currency !== order.currency
  ) {
    await service.from("paypal_orders").update({ status: "failed" }).eq("paypal_order_id", id);
    return NextResponse.json({ success: false, message: "amount mismatch" }, { status: 400 });
  }

  const captureId = capture.captureId || id;
  let balance = 0;
  try {
    const result = await grantCredits(
      user.id,
      order.credits_to_grant,
      captureId,
      "paypal_capture",
      captureId,
    );
    balance = result.balance;
  } catch {
    return NextResponse.json({ success: false, message: "credit grant failed" }, { status: 500 });
  }

  await service
    .from("paypal_orders")
    .update({ status: "captured", capture_id: capture.captureId })
    .eq("paypal_order_id", id);

  return NextResponse.json({
    success: true,
    data: { status: "captured", creditsGranted: order.credits_to_grant, balance },
  });
}