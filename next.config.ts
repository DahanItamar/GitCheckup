import type { NextConfig } from "next";

/**
 * The Content-Security-Policy, and why `script-src` is not stricter.
 *
 * Next inlines the RSC payload as `<script>self.__next_f.push(…)</script>` on
 * every page. Locking that down needs a per-request nonce, which needs
 * middleware, which makes every route dynamic — and `/` and `/improved` are
 * `revalidate = 300` precisely so the CDN absorbs their traffic instead of
 * Neon. Trading that for a directive is the wrong side of the deal here, in an
 * app with no accounts, no sessions and nothing to steal from a browser.
 *
 * So `script-src` allows inline, and the directives that *are* absolute do the
 * real work: nothing may be framed, no plugins, no `<base>` rewrite, forms may
 * only post to us, and every fetch/font/image origin is this one. An injected
 * `<script src="//evil">` still fails; an injected inline handler does not.
 * That is an honest bound, not a complete one — the actual XSS defence is that
 * nothing renders attacker-controlled text (see docs/SECURITY-AUDIT.md).
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // next/font self-hosts Geist, so no third-party font origin is needed.
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Sent on every response. None of these are set by Next by default.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },

  // The badge is served as image/svg+xml, and an SVG opened directly is a
  // document that can execute script. Ours is escaped at the source
  // (lib/badge.ts), so this is the second lock rather than the first.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Belt and braces with frame-ancestors, for anything that predates CSP.
  { key: "X-Frame-Options", value: "DENY" },

  // A result URL names the repository someone looked up. Send the origin
  // rather than the path when leaving the site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // The product needs no device access at all, so it asks for none.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },

  // Ignored over plain HTTP, so harmless in development. Vercel terminates
  // TLS; this is what stops the first request of a session being downgraded.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },

  async redirects() {
    return [
      {
        // `/trending` ranked by absolute score, so it could only ever list the
        // same enormous repositories. `/improved` ranks by movement instead —
        // a different question, and a name that stops people expecting a
        // popularity contest. Permanent, because the old path is in the
        // metadata of anything already shared.
        source: "/trending",
        destination: "/improved",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
