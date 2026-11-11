import { describe, it, expect, vi, beforeEach } from "vitest";

/* Route tests for POST /api/ai/extract-pdf. Supabase auth and pdf-parse are
   mocked; the magic-byte, MIME, size and rate-limit checks run for real.
   Each test uses a distinct user id because the rate limiter is a module-level
   in-memory map shared across the suite. */

const { mockAuth } = vi.hoisted(() => ({
  // Intentionally loose: each test swaps the authenticated user.
  mockAuth: {
    getUser: vi.fn(
      async (): Promise<{ data: { user: { id: string } | null } }> => ({ data: { user: null } }),
    ),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: mockAuth }),
  createServiceClient: () => ({}),
}));

const pdfParse = vi.hoisted(() => vi.fn());
vi.mock("pdf-parse", () => ({ default: pdfParse }));

const { POST } = await import("@/app/api/ai/extract-pdf/route");

function formDataRequest(file: { name: string; type: string; bytes: Uint8Array }): Request {
  const form = new FormData();
  form.append("file", new File([file.bytes as BlobPart], file.name, { type: file.type }));
  return new Request("http://localhost/api/ai/extract-pdf", { method: "POST", body: form });
}

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 minimal");
const NOT_PDF = new TextEncoder().encode("PK-03-04 definitely not a pdf");

function authAs(userId: string | null) {
  mockAuth.getUser.mockImplementation(async () => ({
    data: { user: userId ? { id: userId } : null },
  }));
}

function nextUser(): string {
  return `u-${Math.random().toString(36).slice(2)}`;
}

beforeEach(() => {
  pdfParse.mockReset();
});

describe("extract-pdf route", () => {
  it("requires authentication", async () => {
    authAs(null);
    const res = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: PDF_BYTES }));
    expect(res.status).toBe(401);
  });

  it("rejects content that is not a pdf regardless of declared type", async () => {
    authAs(nextUser());
    const res = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: NOT_PDF }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe("invalid pdf content");
  });

  it("rejects non-pdf mime types before parsing", async () => {
    authAs(nextUser());
    const res = await POST(formDataRequest({ name: "a.pdf", type: "text/plain", bytes: PDF_BYTES }));
    expect(res.status).toBe(400);
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it("rejects oversized files without parsing", async () => {
    authAs(nextUser());
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PDF_BYTES, 0);
    const res = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: big }));
    expect(res.status).toBe(400);
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it("extracts bounded text on a valid pdf", async () => {
    authAs(nextUser());
    pdfParse.mockResolvedValue({ text: "Hello resume" });
    const res = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: PDF_BYTES }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.text).toBe("Hello resume");
    expect(json.data.truncated).toBe(false);
  });

  it("caps extracted text at the resume input limit", async () => {
    authAs(nextUser());
    pdfParse.mockResolvedValue({ text: "x".repeat(20001) });
    const res = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: PDF_BYTES }));
    const json = await res.json();
    expect(json.data.text).toHaveLength(20000);
    expect(json.data.truncated).toBe(true);
  });

  it("returns 422 when the pdf has no extractable text", async () => {
    authAs(nextUser());
    pdfParse.mockResolvedValue({ text: "   " });
    const res = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: PDF_BYTES }));
    expect(res.status).toBe(422);
  });

  it("reports a malformed pdf as a client input problem (422), not 501", async () => {
    authAs(nextUser());
    pdfParse.mockRejectedValue(new Error("parse failure"));
    const res = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: PDF_BYTES }));
    expect(res.status).toBe(422);
  });

  it("rate limits repeated uploads for the same user", async () => {
    const userId = nextUser();
    authAs(userId);
    pdfParse.mockResolvedValue({ text: "ok" });
    let last = null;
    for (let i = 0; i < 12; i++) {
      last = await POST(formDataRequest({ name: "a.pdf", type: "application/pdf", bytes: PDF_BYTES }));
    }
    expect(last?.status).toBe(429);
  });
});
