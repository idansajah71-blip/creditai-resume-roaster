import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://www.sandbox.paypal.com https://*.paypal.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https://*.paypal.com",
              "connect-src 'self' https://*.supabase.co https://api.openai.com https://*.paypal.com https://api-m.sandbox.paypal.com https://api-m.paypal.com",
              "frame-src https://www.paypal.com https://www.sandbox.paypal.com https://*.paypal.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;