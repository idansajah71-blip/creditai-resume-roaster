import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "client";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  process.env.PAYPAL_WEBHOOK_ID = "wh_1";
  vi.restoreAllMocks();
});

describe("paypal lib", () => {
  it("getAccessToken returns token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok123" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getAccessToken } = await import("@/lib/paypal");
    const token = await getAccessToken();
    expect(token).toBe("tok123");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("createPayPalOrder returns id and approvalUrl", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "ORDER1", links: [{ rel: "approve", href: "https://approve" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { createPayPalOrder } = await import("@/lib/paypal");
    const res = await createPayPalOrder("1.00", "USD", "req-1");
    expect(res.id).toBe("ORDER1");
    expect(res.approvalUrl).toBe("https://approve");
  });

  it("capturePayPalOrder parses capture", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "COMPLETED",
          purchase_units: [
            { amount: { value: "1.00", currency_code: "USD" }, payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { value: "1.00", currency_code: "USD" } }] } },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { capturePayPalOrder } = await import("@/lib/paypal");
    const res = await capturePayPalOrder("ORDER1");
    expect(res.status).toBe("COMPLETED");
    expect(res.captureId).toBe("CAP1");
    expect(res.amount).toBe("1.00");
    expect(res.currency).toBe("USD");
  });

  it("verifyWebhookSignature returns true on SUCCESS", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: "SUCCESS" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { verifyWebhookSignature } = await import("@/lib/paypal");
    const ok = await verifyWebhookSignature(
      {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://cert",
        "paypal-transmission-id": "t1",
        "paypal-transmission-sig": "sig",
        "paypal-transmission-time": "2026-01-01T00:00:00Z",
      },
      { id: "evt1" },
    );
    expect(ok).toBe(true);
  });

  it("verifyWebhookSignature returns false on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "tok" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: "FAILURE" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { verifyWebhookSignature } = await import("@/lib/paypal");
    const ok = await verifyWebhookSignature(
      {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://cert",
        "paypal-transmission-id": "t1",
        "paypal-transmission-sig": "sig",
        "paypal-transmission-time": "2026-01-01T00:00:00Z",
      },
      { id: "evt1" },
    );
    expect(ok).toBe(false);
  });
});