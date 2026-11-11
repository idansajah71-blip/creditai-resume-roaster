import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/redirect";

/* The auth callback builds its redirect as `${origin}${next}`, so any `next`
   that is not a plain absolute path can send a user off-site or produce a
   mangled host. These cases must all fall back to the dashboard. */
describe("safeNextPath", () => {
  it("keeps plain absolute paths", () => {
    expect(safeNextPath("/analyze")).toBe("/analyze");
    expect(safeNextPath("/dashboard?tab=credits")).toBe("/dashboard?tab=credits");
  });

  it("falls back on missing or empty values", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
  });

  it("falls back on protocol-relative and full URLs", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("http://evil.com/x")).toBe("/dashboard");
  });

  it("falls back on backslash tricks and non-path values", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNextPath("dashboard")).toBe("/dashboard");
  });

  it("uses the provided fallback", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
  });
});
