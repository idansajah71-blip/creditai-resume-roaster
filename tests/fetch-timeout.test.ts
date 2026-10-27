import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithTimeout, clientErrorMessage, PAYPAL_UNREACHABLE_MESSAGE, CLIENT_HTTP_TIMEOUT_MS } from "@/lib/fetch-timeout";

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts a hanging call after 20s with the fallback message", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_res, rej) => {
        signal.addEventListener("abort", () => rej(new Error("The operation was aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = fetchWithTimeout("http://localhost/api/paypal/orders", { method: "POST" });
    const assertion = expect(p).rejects.toThrow(/Could not reach PayPal/);
    await vi.advanceTimersByTimeAsync(CLIENT_HTTP_TIMEOUT_MS + 1);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates a server response untouched when the server answers in time", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ success: false, message: "paypal create failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithTimeout("http://localhost/api/paypal/orders", { method: "POST" });
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.message).toBe("paypal create failed");
  });

  it("clientErrorMessage: server message survives; anything else gets the fallback", () => {
    expect(clientErrorMessage(new Error("Daily purchase limit reached. Try again tomorrow."))).toBe(
      "Daily purchase limit reached. Try again tomorrow.",
    );
    expect(clientErrorMessage(new Error(PAYPAL_UNREACHABLE_MESSAGE))).toBe(PAYPAL_UNREACHABLE_MESSAGE);
    expect(clientErrorMessage("weird")).toBe(PAYPAL_UNREACHABLE_MESSAGE);
    expect(clientErrorMessage(null)).toBe(PAYPAL_UNREACHABLE_MESSAGE);
  });
});
