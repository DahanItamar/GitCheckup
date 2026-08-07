import { describe, expect, it } from "vitest";

import {
  parseBadgeStyle,
  renderBadge,
  scoreBadge,
  unknownBadge,
} from "./badge";

describe("parseBadgeStyle", () => {
  it("accepts the two documented styles", () => {
    expect(parseBadgeStyle("flat")).toBe("flat");
    expect(parseBadgeStyle("flat-square")).toBe("flat-square");
  });

  it("falls back to flat for anything else", () => {
    expect(parseBadgeStyle(null)).toBe("flat");
    expect(parseBadgeStyle("plastic")).toBe("flat");
    expect(parseBadgeStyle("")).toBe("flat");
  });
});

describe("scoreBadge", () => {
  it("shows the score and the grade", () => {
    const svg = scoreBadge(94, "A+", "flat");
    expect(svg).toContain("94 A+");
    expect(svg).toContain("repogauge");
  });

  it("is well-formed SVG with explicit dimensions", () => {
    const svg = scoreBadge(94, "A+", "flat");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).toMatch(/height="20"/);
  });

  it("carries an accessible label", () => {
    expect(scoreBadge(70, "B", "flat")).toContain('role="img"');
    expect(scoreBadge(70, "B", "flat")).toContain("aria-label=");
  });

  it("squares the corners for flat-square", () => {
    expect(scoreBadge(94, "A+", "flat")).toContain('rx="3"');
    expect(scoreBadge(94, "A+", "flat-square")).toContain('rx="0"');
  });

  it("colours a pass differently from a failure", () => {
    expect(scoreBadge(95, "A+", "flat")).not.toBe(scoreBadge(20, "F", "flat"));
  });

  it("widens for a longer message rather than overflowing", () => {
    const short = /width="(\d+)"/.exec(scoreBadge(9, "F", "flat"))?.[1];
    const long = /width="(\d+)"/.exec(scoreBadge(100, "A+", "flat"))?.[1];
    expect(Number(long)).toBeGreaterThan(Number(short));
  });
});

describe("unknownBadge", () => {
  it("renders the documented fallback text", () => {
    expect(unknownBadge("flat")).toContain("unknown");
    expect(unknownBadge("flat")).toContain("repogauge");
  });
});

describe("escaping", () => {
  it("escapes XML metacharacters rather than emitting raw markup", () => {
    const svg = renderBadge({
      message: `<script>&"'`,
      color: "#000000",
      style: "flat",
    });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });
});
