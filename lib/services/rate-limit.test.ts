import { describe, expect, it } from "vitest";

import { bucketKeyFor, secondsUntilReset } from "./rate-limit";

const SECRET = "a-test-secret-at-least-16-chars";
const IP = "203.0.113.42";
const NOW = new Date("2026-08-07T12:30:00.000Z");

describe("bucketKeyFor", () => {
  it("is stable for the same ip, hour and secret", () => {
    expect(bucketKeyFor(IP, NOW, SECRET)).toBe(bucketKeyFor(IP, NOW, SECRET));
  });

  it("separates different callers in the same hour", () => {
    expect(bucketKeyFor(IP, NOW, SECRET)).not.toBe(
      bucketKeyFor("198.51.100.7", NOW, SECRET),
    );
  });

  it("rolls the caller into a new bucket each hour", () => {
    const nextHour = new Date(NOW.getTime() + 60 * 60 * 1000);
    expect(bucketKeyFor(IP, NOW, SECRET)).not.toBe(
      bucketKeyFor(IP, nextHour, SECRET),
    );
  });

  it("keeps one bucket for the whole hour, whatever the minute", () => {
    const sameHour = new Date("2026-08-07T12:59:59.999Z");
    expect(bucketKeyFor(IP, sameHour, SECRET)).toBe(
      bucketKeyFor(IP, NOW, SECRET),
    );
  });

  it("produces a different key under a different secret", () => {
    expect(bucketKeyFor(IP, NOW, SECRET)).not.toBe(
      bucketKeyFor(IP, NOW, "a-different-secret-16-chars"),
    );
  });

  it("never leaks the address it hashed", () => {
    const key = bucketKeyFor(IP, NOW, SECRET);
    expect(key).not.toContain(IP);
    expect(key).not.toContain("203");
    // sha256 hex + ":" + epoch hour
    expect(key).toMatch(/^[0-9a-f]{64}:\d+$/);
  });

  it("hashes an IPv6 address as readily as an IPv4 one", () => {
    const v6 = bucketKeyFor("2001:db8::1", NOW, SECRET);
    expect(v6).toMatch(/^[0-9a-f]{64}:\d+$/);
    expect(v6).not.toBe(bucketKeyFor(IP, NOW, SECRET));
  });
});

describe("secondsUntilReset", () => {
  it("reports the remainder of the current hour", () => {
    expect(secondsUntilReset(new Date("2026-08-07T12:30:00.000Z"))).toBe(1800);
    expect(secondsUntilReset(new Date("2026-08-07T12:00:00.000Z"))).toBe(3600);
  });

  it("never tells a caller to retry in zero seconds", () => {
    const lastMoment = new Date("2026-08-07T12:59:59.999Z");
    expect(secondsUntilReset(lastMoment)).toBeGreaterThanOrEqual(1);
  });

  it("stays inside one hour", () => {
    for (const minute of [0, 1, 17, 30, 59]) {
      const now = new Date(
        `2026-08-07T12:${String(minute).padStart(2, "0")}:00Z`,
      );
      const seconds = secondsUntilReset(now);
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(3600);
    }
  });
});
