import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

// Deletes the user's analysis history (ai_jobs).
// Ledger (credit_transactions) and payment records (paypal_orders,
// refund_requests) are kept for financial integrity.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("ai_jobs")
    .delete()
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ success: false, message: "delete failed" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { deleted: (data as unknown[] | null)?.length ?? 0 },
  });
}
