// Client-side fetch helper: never let a purchase call hang silently.
// Aborts after 20 seconds and always surfaces a message usable in the UI.
export const CLIENT_HTTP_TIMEOUT_MS = 20_000;

export const PAYPAL_UNREACHABLE_MESSAGE =
  "Could not reach PayPal. Check your connection and try again.";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = CLIENT_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(PAYPAL_UNREACHABLE_MESSAGE);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// UI callers wrap this around server messages; when there is no usable
// message (network failure, timeout, non-JSON), the fallback keeps the
// user informed instead of showing nothing.
export function clientErrorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : PAYPAL_UNREACHABLE_MESSAGE;
}
