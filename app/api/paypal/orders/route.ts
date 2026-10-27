import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createPayPalOrder, getApprovalUrl } from "@/lib/paypal";
import { getPackage } from "@/lib/packages";
import { createOrderSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "invalid json" }, { status: 400 });
  }
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "invalid package" }, { status: 400 });
  }
  const pkg = getPackage(parsed.data.packageId);
  if (!pkg) {
    return NextResponse.json({ success: false, message: "unknown package" }, { status: 400 });
  }

  const service = createServiceClient();
  const idempotencyKey = request.headers.get("idempotency-key") || crypto.randomUUID();

  const { data: existing } = await service
    .from("paypal_orders")
    .select("paypal_order_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      success: true,
      data: {
        paypalOrderId: existing.paypal_order_id,
        approvalUrl: getApprovalUrl(existing.paypal_order_id),
      },
    });
  }

  // Per-user daily order cap (only for new orders; retries above still resolve)
  const maxOrders = Number(process.env.PAYPAL_MAX_ORDERS_PER_DAY || 10);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: orderCount } = await service
    .from("paypal_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since24h);
  if ((orderCount ?? 0) >= maxOrders) {
    return NextResponse.json(
      { success: false, message: "Daily purchase limit reached. Try again tomorrow." },
      { status: 429 },
    );
  }

  let paypalOrder;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    paypalOrder = await createPayPalOrder(
      pkg.amount,
      pkg.currency,
      idempotencyKey,
      `${appUrl}/credits`,
      `${appUrl}/credits?cancel=1`,
    );
  } catch {
    return NextResponse.json({ success: false, message: "paypal create failed" }, { status: 502 });
  }

  const { error } = await service.from("paypal_orders").insert({
    user_id: user.id,
    paypal_order_id: paypalOrder.id,
    amount_value: pkg.amount,
    currency: pkg.currency,
    credits_to_grant: pkg.credits,
    status: "created",
    idempotency_key: idempotencyKey,
  });

  if (error) {
    return NextResponse.json({ success: false, message: "db error" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { paypalOrderId: paypalOrder.id, approvalUrl: paypalOrder.approvalUrl },
  });
}