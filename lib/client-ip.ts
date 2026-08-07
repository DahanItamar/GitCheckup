/**
 * Extracts the caller's address from request headers (SPEC §8).
 *
 * `x-forwarded-for` is client-supplied on a naked server, but on Vercel the
 * platform overwrites it with the real connecting address before our code
 * runs — which is what makes it usable as a rate-limit key here. On any host
 * that does not, this degrades to "callers can pick their own bucket", so the
 * deployment target is part of this function's contract.
 *
 * Pure: it takes Headers rather than reaching for `next/headers`, so it works
 * in a route handler, a Server Component, and a test.
 */
export function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded !== null) {
    // Left-most entry is the original client; the rest are proxies.
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first !== "") return first;
  }

  const real = headers.get("x-real-ip")?.trim();
  return real === undefined || real === "" ? undefined : real;
}
