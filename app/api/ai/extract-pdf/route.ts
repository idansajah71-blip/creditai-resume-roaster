import { NextResponse } from "next/server";
export const maxDuration = 60;

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

/* Per-user sliding window on PDF extraction. Parsing a 5MB PDF is CPU-bound,
   so the endpoint is the most expensive per-request API after /analyze.
   Limitation: this limiter is per server instance (in-memory); horizontal
   scale needs a shared store for exactness. Documented in SECURITY.md. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(`pdf:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { success: false, message: "Too many PDF uploads. Try again in a few minutes." },
      { status: 429 },
    );
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

  // Validate actual file content, not just the declared MIME type / extension.
  if (buf.length < 4 || buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) {
    return NextResponse.json({ success: false, message: "invalid pdf content" }, { status: 400 });
  }

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
    // Bound extracted text to the same limit as resume input.
    const capped = text.slice(0, 20000);
    return NextResponse.json({ success: true, data: { text: capped, truncated: text.length > 20000 } });
  } catch {
    // pdf-parse threw on a malformed or encrypted document the magic-byte
    // check could not catch. That is a client-side input problem (422), not
    // a server capability problem (501).
    return NextResponse.json(
      { success: false, message: "this pdf could not be parsed; try another file or paste the text" },
      { status: 422 },
    );
  }
}
