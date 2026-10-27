import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { starterBannerStatus, SIGNUP_REFERENCE_TYPE, PURCHASE_REFERENCE_TYPES } from "@/lib/starter";

// GET /api/account/starter
// Tells the client whether to show the free-starter-credits banner: active
// only while the account holds a signup grant and has not purchased credits.
// Returns no ledger internals, just { active, credits }.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("credit_transactions")
    .select("amount, reference_type")
    .eq("user_id", user.id)
    .in("reference_type", [SIGNUP_REFERENCE_TYPE, ...PURCHASE_REFERENCE_TYPES]);
  if (error) {
    return NextResponse.json({ success: false, message: "db error" }, { status: 500 });
  }

  const status = starterBannerStatus(rows ?? []);
  return NextResponse.json({
    success: true,
    data: { active: status.active, credits: status.credits },
  });
}
