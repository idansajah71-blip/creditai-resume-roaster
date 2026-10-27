import crypto from "node:crypto";

export const DEMO_CREDITS = 5;

// Only used outside production; production must supply DEMO_IP_SALT.
const DEMO_FALLBACK_SALT = "change-me-in-production";

export function hashIp(ip: string): string {
  const salt = process.env.DEMO_IP_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DEMO_IP_SALT is required in production: set it to a long random string so demo rate limiting cannot be spoofed",
      );
    }
    // Development fallback keeps local runs working without configuration.
    return crypto.createHmac("sha256", DEMO_FALLBACK_SALT).update(ip).digest("hex");
  }
  return crypto.createHmac("sha256", salt).update(ip).digest("hex");
}

export function getClientIp(request: Request): string {
  // Vercel sets this to the client chain it observed (harder to spoof than
  // x-forwarded-for); prefer it when the deployment provides it.
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function generateDemoCredentials(): { email: string; password: string } {
  const rand = crypto.randomBytes(8).toString("hex");
  const email = `demo-${rand}@creditai.local`;
  const password = crypto.randomBytes(16).toString("base64url");
  return { email, password };
}

// Pure limit checks, kept separate for unit testing.
export function withinIpLimit(count: number, limit = 3): boolean {
  return count < limit;
}

export function withinDailyLimit(count: number, limit: number): boolean {
  return count < limit;
}
