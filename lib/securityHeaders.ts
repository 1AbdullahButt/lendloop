// Security headers, kept in one pure module so a unit test can check them without booting
// Next. The Content-Security-Policy is built per request by Clerk's middleware
// (`contentSecurityPolicy` option in middleware.ts): strict mode adds a fresh nonce and
// 'strict-dynamic' to script-src, and Clerk's defaults already allow its own frontend API,
// img.clerk.com, *.protect.clerk.com and challenges.cloudflare.com. The values below are
// appended to those defaults. The other headers are static (next.config.ts).

/** Our additions to Clerk's CSP defaults. */
export const CSP_DIRECTIVES = {
  // Convex queries and live updates (websocket), and Clerk's frontend API.
  "connect-src": ["https://*.convex.cloud", "wss://*.convex.cloud", "https://*.clerk.accounts.dev", "https://clerk.com"],
  // Clerk avatars; data: for the generated initials.
  "img-src": ["data:", "https://img.clerk.com", "https://*.clerk.accounts.dev"],
  "frame-src": ["https://challenges.cloudflare.com"],
  // next/font self-hosts the three fonts at build time: no font CDN.
  "font-src": ["'self'"],
  // React style={{}} props are inline styles and can't carry a nonce.
  "style-src": ["'self'", "'unsafe-inline'"],
  "worker-src": ["'self'", "blob:"],
  // Never framed (clickjacking), no plugins, no <base> or form posts elsewhere.
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
} as const satisfies Record<string, readonly string[]>;

/** A fresh, mutable copy for Clerk's middleware option. */
export function cspDirectives(): Record<keyof typeof CSP_DIRECTIVES, string[]> {
  return Object.fromEntries(Object.entries(CSP_DIRECTIVES).map(([k, v]) => [k, [...v]])) as Record<
    keyof typeof CSP_DIRECTIVES,
    string[]
  >;
}

/**
 * Report-only instead of enforced when CSP_REPORT_ONLY=1: the switch for a deploy where the
 * policy blocks something it shouldn't (sign-in, the Clerk widget, Convex live updates), so the
 * app keeps working while the violation is fixed.
 */
export function cspReportOnly(env: Record<string, string | undefined> = process.env): boolean {
  return env.CSP_REPORT_ONLY === "1";
}

/** Static headers on every response (next.config.ts headers()). */
export const STATIC_HEADERS: { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Older browsers that ignore CSP frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
];
