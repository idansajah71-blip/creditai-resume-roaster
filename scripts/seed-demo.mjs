import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const email = "demo@creditai.local";
const password = "DemoPass123!";

async function main() {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Demo Judge" },
  });

  let userId = created?.user?.id;
  if (createErr) {
    // maybe already exists; look up
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email === email);
    if (!existing) {
      console.error("create user failed:", createErr.message);
      process.exit(1);
    }
    userId = existing.id;
    console.log("Demo user already exists:", userId);
  } else {
    console.log("Created demo user:", userId);
  }

  // grant 5 credits via RPC
  const { error: grantErr } = await supabase.rpc("grant_credits", {
    p_user_id: userId,
    p_amount: 5,
    p_idempotency: `demo-seed-${userId}`,
    p_reference_type: "demo_seed",
    p_reference_id: "demo",
  });
  if (grantErr) console.error("grant error:", grantErr.message);
  else console.log("Granted 5 demo credits to", email);

  console.log("\nDemo credentials:");
  console.log("Email:", email);
  console.log("Password:", password);
}

main();