/* Same-origin redirect targets for auth flows.
   The `next` query parameter is user-controlled, so every consumer must pass
   it through this allowlist before building a redirect URL. Only absolute
   same-origin paths survive: a missing, relative, protocol-relative,
   full-URL, or backslash-containing value falls back to `fallback`. */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}
