import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  process.env.PAYPAL_ENV = "sandbox";
  process.env.PAYPAL_CLIENT_ID = "client";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("paypal lib timeouts", () => {
  it("aborts a hanging token fetch after 15s and throws paypal_timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_res, rej) => {
        signal.addEventListener("abort", () => rej(new Error("The operation was aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("@/lib/paypal");
    const p = getAccessToken();
    const assertion = expect(p).rejects.toThrow("paypal_timeout");
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
  });

  it("passes the abort signal to every PayPal fetch (15s budget)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("@/lib/paypal");
    const token = await getAccessToken();
    expect(token).toBe("tok123");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not swallow non-timeout errors as paypal_timeout", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("@/lib/paypal");
    await expect(getAccessToken()).rejects.toThrow("ECONNRESET");
  });
});
