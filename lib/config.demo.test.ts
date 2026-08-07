import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The boundary around demo mode (SPEC §11 assumption 12).
 *
 * §8 forbids the app quietly degrading to an unauthenticated fallback. Demo
 * mode is only distinguishable from that by two properties, and both are one
 * careless edit away from disappearing: it has to be asked for by name, and
 * turning it off has to restore the refusal to boot.
 */

/** Loads a fresh `lib/config.ts` under whatever the env currently says. */
async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DEMO_MODE", () => {
  it("is off unless it is set", async () => {
    vi.stubEnv("DEMO_MODE", undefined);

    expect((await loadConfig()).DEMO_MODE).toBe(false);
  });

  it("is off for anything other than 1", async () => {
    // No truthiness, no "true", no "yes". Nobody arrives here by accident.
    for (const value of ["0", "true", "yes", "on", ""]) {
      vi.stubEnv("DEMO_MODE", value);

      expect((await loadConfig()).DEMO_MODE).toBe(false);
    }
  });
});

describe("an empty value means unset", () => {
  it("boots from a filled-in copy of .env.example", async () => {
    // The exact documented path: `cp .env.example .env`, then fill in the
    // three credentials. The optional keys stay present and empty — which is
    // a string, not undefined, so `.default()` never fired and `.optional()`
    // rejected it. Following the README verbatim would not boot.
    vi.stubEnv("DEMO_MODE", undefined);
    vi.stubEnv("GITHUB_TOKEN", "a-token");
    vi.stubEnv("RATE_LIMIT_SECRET", "a-secret-at-least-16-chars");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@host/db");
    vi.stubEnv("TIPS_PROVIDER", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    const config = await loadConfig();

    expect(config.TIPS_PROVIDER).toBe("rules");
    expect(config.SITE_URL).toBe("http://localhost:3000");
  });

  it("still honours a value that is actually set", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gitcheckup.app");

    expect((await loadConfig()).SITE_URL).toBe("https://gitcheckup.app");
  });

  it("does not extend the same mercy to a credential", async () => {
    // A blank token is a misconfiguration, and refusing to boot on it is the
    // entire point of this module.
    vi.stubEnv("DEMO_MODE", undefined);
    vi.stubEnv("GITHUB_TOKEN", "");

    await expect(loadConfig()).rejects.toThrow(/GITHUB_TOKEN/);
  });
});

describe("credentials", () => {
  it("are still demanded when demo mode is off", async () => {
    vi.stubEnv("DEMO_MODE", undefined);
    vi.stubEnv("GITHUB_TOKEN", "");

    await expect(loadConfig()).rejects.toThrow(/GITHUB_TOKEN/);
  });

  it("are not demanded in demo mode, because nothing uses them", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("RATE_LIMIT_SECRET", "");
    vi.stubEnv("DATABASE_URL", "");

    await expect(loadConfig()).resolves.toBeDefined();
  });

  it("go back to being demanded the moment the flag comes off", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATABASE_URL", "");
    await expect(loadConfig()).resolves.toBeDefined();

    vi.stubEnv("DEMO_MODE", "0");
    await expect(loadConfig()).rejects.toThrow(/DATABASE_URL/);
  });
});
