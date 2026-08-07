import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The rate-limit bypass that a self-hosted deployment reintroduces.
 *
 * An ordinary reverse proxy *appends* to `x-forwarded-for`, so a caller who
 * sends one gets their value in the left-most position — the slot the
 * conventional "original client" rule reads. On Vercel that cannot happen,
 * because the platform rewrites the header. Behind nginx, Caddy, Traefik or
 * Cloudflare it can, and the per-IP limit becomes a bucket of the caller's
 * choosing.
 */

async function load() {
  vi.resetModules();
  return import("./client-ip");
}

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("with a trusted header configured", () => {
  it("ignores a spoofed x-forwarded-for", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
    const { clientIpFrom } = await load();

    // What an attacker sends, plus what the proxy appended.
    const ip = clientIpFrom(
      headers({
        "x-forwarded-for": "1.2.3.4, 203.0.113.9",
        "cf-connecting-ip": "203.0.113.9",
      }),
    );

    expect(ip).toBe("203.0.113.9");
  });

  it("returns nothing rather than falling back", async () => {
    // Falling back to x-forwarded-for would restore the bypass this setting
    // exists to close. Unknown is safer: `chargeColdScore` lets it through,
    // which costs one score, where the bypass costs the whole limit.
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
    const { clientIpFrom } = await load();

    expect(clientIpFrom(headers({ "x-forwarded-for": "1.2.3.4" }))).toBe(
      undefined,
    );
  });

  it("matches the header case-insensitively", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "CF-Connecting-IP");
    const { clientIpFrom } = await load();

    expect(clientIpFrom(headers({ "cf-connecting-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
  });
});

describe("with none configured (Vercel)", () => {
  it("still reads the left-most x-forwarded-for entry", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", undefined);
    const { clientIpFrom } = await load();

    expect(
      clientIpFrom(headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" })),
    ).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", undefined);
    const { clientIpFrom } = await load();

    expect(clientIpFrom(headers({ "x-real-ip": "203.0.113.2" }))).toBe(
      "203.0.113.2",
    );
  });

  it("is undefined when nothing identifies the caller", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", undefined);
    const { clientIpFrom } = await load();

    expect(clientIpFrom(headers({}))).toBe(undefined);
  });
});
