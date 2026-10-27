export type CaptureResult = {
  status: string;
  captureId: string | null;
  amount: string | null;
  currency: string | null;
  captureStatus: string | null;
};

// Every PayPal API call gets one chance to finish inside this window; the
// request is aborted and a descriptive "paypal_timeout" error is thrown so
// callers never hang silently waiting for PayPal.
export const PAYPAL_FETCH_TIMEOUT_MS = 15_000;

export async function paypalFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAYPAL_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error("paypal_timeout");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function base() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function authHeader() {
  const id = process.env.PAYPAL_CLIENT_ID!;
  const secret = process.env.PAYPAL_CLIENT_SECRET!;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function getAccessToken(): Promise<string> {
  const res = await paypalFetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("paypal_token_failed");
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function createPayPalOrder(
  amount: string,
  currency: string,
  requestId: string,
  returnUrl?: string,
  cancelUrl?: string,
): Promise<{ id: string; approvalUrl: string }> {
  const token = await getAccessToken();
  const res = await paypalFetch(`${base()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: currency, value: amount } }],
      application_context: returnUrl
        ? { return_url: returnUrl, cancel_url: cancelUrl || returnUrl }
        : undefined,
    }),
  });
  if (!res.ok) throw new Error("paypal_create_failed");
  const data = (await res.json()) as {
    id: string;
    links?: { rel: string; href: string }[];
  };
  const approve = data.links?.find((l) => l.rel === "approve")?.href;
  const approvalUrl = approve || `${sandboxApproveBase()}/checkoutnow?token=${data.id}`;
  return { id: data.id, approvalUrl };
}

export function getApprovalUrl(orderId: string): string {
  const base = process.env.PAYPAL_ENV === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
  return `${base}/checkoutnow?token=${orderId}`;
}

function sandboxApproveBase() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://www.paypal.com"
    : "https://www.sandbox.paypal.com";
}

export async function getPayPalOrder(orderId: string): Promise<{
  status: string;
  captureId: string | null;
  amount: string | null;
  currency: string | null;
  captureStatus: string | null;
}> {
  const token = await getAccessToken();
  const res = await paypalFetch(`${base()}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("paypal_get_failed");
  const data = (await res.json()) as {
    status: string;
    purchase_units?: {
      amount?: { value: string; currency_code: string };
      payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] };
    }[];
  };
  const pu = data.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0];
  return {
    status: data.status,
    captureId: capture?.id ?? null,
    amount: capture?.amount?.value ?? pu?.amount?.value ?? null,
    currency: capture?.amount?.currency_code ?? pu?.amount?.currency_code ?? null,
    captureStatus: capture?.status ?? null,
  };
}

export async function capturePayPalOrder(orderId: string): Promise<CaptureResult> {
  const token = await getAccessToken();
  const res = await paypalFetch(`${base()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error("paypal_capture_failed");
  const data = (await res.json()) as {
    status: string;
    purchase_units?: {
      amount?: { value: string; currency_code: string };
      payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] };
    }[];
  };
  const pu = data.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0];
  return {
    status: data.status,
    captureId: capture?.id ?? null,
    amount: capture?.amount?.value ?? pu?.amount?.value ?? null,
    currency: capture?.amount?.currency_code ?? pu?.amount?.currency_code ?? null,
    captureStatus: capture?.status ?? null,
  };
}

export type RefundResult = { id: string; status: string };

export async function refundCapture(
  captureId: string,
  amount: string,
  currency: string,
  requestId: string,
  note: string,
): Promise<RefundResult> {
  const token = await getAccessToken();
  const res = await paypalFetch(`${base()}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify({
      amount: { value: amount, currency_code: currency },
      note_to_payer: note,
    }),
  });
  if (!res.ok) throw new Error("paypal_refund_failed");
  const data = (await res.json()) as { id: string; status: string };
  return { id: data.id, status: data.status };
}

export async function verifyWebhookSignature(
  headers: Record<string, string>,
  event: unknown,
): Promise<boolean> {
  const token = await getAccessToken();
  const payload = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  };
  const res = await paypalFetch(`${base()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status: string };
  return data.verification_status === "SUCCESS";
}