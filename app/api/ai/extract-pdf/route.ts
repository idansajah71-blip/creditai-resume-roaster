import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ success: false, message: "invalid form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "file required" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ success: false, message: "file too large (max 5MB)" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ success: false, message: "pdf required" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  try {
    // @ts-expect-error pdf-parse types may be unavailable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("pdf-parse");
    const pdfParse = mod.default || mod;
    const data = await pdfParse(buf);
    const text = String(data?.text || "").trim();
    if (!text) {
      return NextResponse.json({ success: false, message: "no text extracted" }, { status: 422 });
    }
    return NextResponse.json({ success: true, data: { text } });
  } catch {
    return NextResponse.json(
      { success: false, message: "pdf extraction unavailable" },
      { status: 501 },
    );
  }
}