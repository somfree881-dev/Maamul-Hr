import type { NextConfig } from "next";
import { inspectPublicSupabaseConfig } from "./lib/supabase/config";
if (
  inspectPublicSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ).unsafePublicKey
)
  throw new Error(
    "Refusing to start/build: a privileged Supabase key is set in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Remove it and rotate it before continuing.",
  );
const config: NextConfig = {
  experimental: { authInterrupts: true },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
