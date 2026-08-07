import { describe, expect, it } from "vitest";

import { clientIpFrom } from "./client-ip";

const withHeaders = (init: Record<string, string>) =>
  clientIpFrom(new Headers(init));

describe("clientIpFrom", () => {
  it("reads a single forwarded address", () => {
    expect(withHeaders({ "x-forwarded-for": "203.0.113.42" })).toBe(
      "203.0.113.42",
    );
  });

  it("takes the original client, not the nearest proxy", () => {
    expect(
      withHeaders({
        "x-forwarded-for": "203.0.113.42, 198.51.100.1, 10.0.0.1",
      }),
    ).toBe("203.0.113.42");
  });

  it("trims the whitespace proxies leave behind", () => {
    expect(
      withHeaders({ "x-forwarded-for": "  203.0.113.42 , 10.0.0.1" }),
    ).toBe("203.0.113.42");
  });

  it("falls back to x-real-ip", () => {
    expect(withHeaders({ "x-real-ip": "203.0.113.9" })).toBe("203.0.113.9");
  });

  it("prefers x-forwarded-for when both are present", () => {
    expect(
      withHeaders({
        "x-forwarded-for": "203.0.113.42",
        "x-real-ip": "198.51.100.1",
      }),
    ).toBe("203.0.113.42");
  });

  it("handles IPv6", () => {
    expect(withHeaders({ "x-forwarded-for": "2001:db8::1" })).toBe(
      "2001:db8::1",
    );
  });

  it("returns undefined when there is no address to read", () => {
    expect(withHeaders({})).toBeUndefined();
  });

  it("treats an empty or whitespace header as absent", () => {
    expect(withHeaders({ "x-forwarded-for": "" })).toBeUndefined();
    expect(withHeaders({ "x-forwarded-for": "   " })).toBeUndefined();
    expect(withHeaders({ "x-forwarded-for": ", 10.0.0.1" })).toBeUndefined();
    expect(withHeaders({ "x-real-ip": "  " })).toBeUndefined();
  });
});
