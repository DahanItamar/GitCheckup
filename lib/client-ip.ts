import { TRUSTED_CLIENT_IP_HEADER } from "@/lib/config";

/**
 * The caller's address, for the per-IP rate limit (SPEC §8).
 *
 * **Which header can be trusted is a property of the deployment, not of the
 * code**, so it is configuration rather than a guess.
 *
 * `x-forwarded-for` is appended to, never replaced, by an ordinary reverse
 * proxy. A caller who sends `X-Forwarded-For: 1.2.3.4` gets
 * `1.2.3.4, <their real ip>` delivered to us — so reading the left-most entry,
 * which is the conventional "original client", hands every caller a rate-limit
 * bucket of their choosing. On Vercel that is safe because the platform
 * overwrites the header before our code runs. Behind nginx, Caddy, Traefik or
 * Cloudflare it is not, and the limiter becomes decorative.
 *
 * Set `TRUSTED_CLIENT_IP_HEADER` to the one header your edge controls:
 *
 * - Cloudflare  → `cf-connecting-ip`  (Cloudflare strips any client-supplied copy)
 * - nginx       → `x-real-ip`         (with `proxy_set_header X-Real-IP $remote_addr`)
 * - Vercel      → leave unset
 *
 * When it is set, that header is the only thing read: falling back to
 * `x-forwarded-for` would restore the bypass the setting exists to close.
 *
 * Pure — it takes `Headers` rather than reaching for `next/headers`, so it
 * works in a route handler, a Server Component and a test alike.
 */
export function clientIpFrom(headers: Headers): string | undefined {
  if (TRUSTED_CLIENT_IP_HEADER !== undefined) {
    return firstValue(headers.get(TRUSTED_CLIENT_IP_HEADER));
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null) {
    // Left-most entry is the original client — true only where the platform
    // rewrites this header. See the note above.
    const first = firstValue(forwarded);
    if (first !== undefined) return first;
  }

  return firstValue(headers.get("x-real-ip"));
}

/** A header may carry a comma-separated chain; take the first, trimmed. */
function firstValue(raw: string | null): string | undefined {
  if (raw === null) return undefined;

  const value = raw.split(",")[0]?.trim();
  return value === undefined || value === "" ? undefined : value;
}
