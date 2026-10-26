# Deployment

## Vercel
1. Push repo to GitHub.
2. Import in Vercel.
3. Set all env vars from `.env.example` (including `NEXT_PUBLIC_APP_URL` to your domain).
4. Deploy.

## Database
- Run `supabase/migrations/0001_init.sql`, `0002_paypal_grant.sql`, `0003_ai_reservations.sql` in Supabase SQL editor.

## PayPal Sandbox
- Create Sandbox app, set webhook URL to `https://<domain>/api/paypal/webhook`.
- Subscribe to `PAYMENT.CAPTURE.COMPLETED`.
- Copy Webhook ID into `PAYPAL_WEBHOOK_ID`.

## Verify
- `npm run build` must pass.
- `npm run test` must pass.
- Public URL not verified in this environment (no deployment performed).