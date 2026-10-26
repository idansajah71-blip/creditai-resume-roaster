# Security Review (Phase 4)

## Controls in place
- Supabase Auth with HTTP-only cookies; middleware refreshes sessions.
- RLS enabled on all app tables; users can only SELECT their own rows.
- Service role key used only in Route Handlers / scripts; never shipped to client.
- PayPal/OpenAI secrets server-only (env).
- Credit mutations only via SECURITY DEFINER RPCs with row locks.
- Webhook signature verified via PayPal API before processing.
- Idempotency keys on orders, captures, grants, webhook events.
- Input validation with Zod and size limits.

## Prioritized remaining issues
1. In-memory rate limiter resets on deploy/scale (use Redis/Upstash for production).
2. No CSRF token beyond SameSite cookies (acceptable for JSON API but review).
3. Service role key in .env; ensure not committed (gitignored).
4. Demo seed credentials printed to console (rotate after demo).
5. No automated E2E against live PayPal/OpenAI (manual verification required).
6. Next.js version mismatch warning (16.2.11 vs 16.4.3 swc) — cosmetic.
7. Middleware convention deprecated (proxy) — functional.

## Not tested (external dependencies)
- Live PayPal Sandbox capture (requires buyer account + ngrok).
- Live OpenAI inference (requires API key with quota).
- Deployment public URL (not deployed in this environment).