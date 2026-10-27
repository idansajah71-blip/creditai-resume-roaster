import crypto from "node:crypto";

export const DEMO_CREDITS = 5;

export function hashIp(ip: string): string {
  const salt = process.env.DEMO_IP_SALT || "change-me-in-production";
  return crypto.createHmac("sha256", salt).update(ip).digest("hex");
}

export function getClientIp(request: Request): string {
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
