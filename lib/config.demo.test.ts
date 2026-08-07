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
