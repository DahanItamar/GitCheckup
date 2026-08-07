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
    expect(svg).toContain("gitcheckup");
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
    expect(unknownBadge("flat")).toContain("gitcheckup");
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

describe("what makes it look right rather than merely correct", () => {
  const svg = scoreBadge(85, "A", "flat");

  it("draws each label twice — a shadow, then the glyphs", () => {
    // White on mid-grey has poor edge definition. The 30%-opacity near-black
    // copy one notch below is most of why a shields badge reads as crisp.
    expect(svg.match(/<text/g)).toHaveLength(4);
    expect(svg).toContain('fill="#010101" fill-opacity=".3"');
  });

  it("pins every string to an exact width", () => {
    // Without textLength the badge depends on the viewer having Verdana. With
    // it, a wrong metric shifts letter spacing instead of overflowing the box.
    expect(svg.match(/textLength="\d+"/g)?.length).toBe(4);
  });

  it("works at ten times scale, then shrinks", () => {
    // SVG rounds font metrics to the user-unit grid; 10x preserves sub-pixel
    // positions that would otherwise be lost.
    expect(svg).toContain('transform="scale(.1)"');
    expect(svg).toContain('font-size="110"');
  });

  it("carries the sheen on flat and not on flat-square", () => {
    expect(svg).toContain("linearGradient");
    // A "square" badge with a gradient reads as a mistake, not a choice.
    expect(scoreBadge(85, "A", "flat-square")).not.toContain("linearGradient");
  });

  it("still renders exactly one shape per side", () => {
    expect(svg.match(/<rect/g)?.length).toBe(4); // clip + label + value + sheen
  });
});

describe("the card style", () => {
  it("is opt-in — flat stays the default", () => {
    // The snippet is already in READMEs. Changing what the default renders
    // would resize a badge inside someone else's document.
    expect(parseBadgeStyle(null)).toBe("flat");
    expect(parseBadgeStyle("card")).toBe("card");
  });

  it("sizes itself to its content", () => {
    // The prototype hardcoded one width, which held only for a two-digit
    // score and a one-letter grade.
    const widthOf = (svg: string) => Number(/width="(\d+)"/.exec(svg)![1]);

    expect(widthOf(scoreBadge(100, "A+", "card"))).toBeGreaterThan(
      widthOf(scoreBadge(9, "F", "card")),
    );
  });

  it("brings its own background rather than borrowing the reader's", () => {
    // The whole reason for this style: grade colours cannot be tuned for a
    // white and a near-black README at once, so it supplies its own ground.
    expect(scoreBadge(85, "A", "card")).toContain("#161a1f");
  });

  it("shows the grade colour only on the spine and the letter", () => {
    const svg = scoreBadge(31, "F", "card");
    expect(svg.match(/#a8322f/g)).toHaveLength(2);
  });

  it("drops the number, grade and /100 when there is no score", () => {
    // A hero figure that does not exist is worse than no card.
    const svg = unknownBadge("card");

    expect(svg).toContain("unknown");
    expect(svg).not.toContain("/ 100");
    // Label and the word "unknown", and nothing else — no grade block.
    expect(svg.match(/<text/g)).toHaveLength(2);
    expect(scoreBadge(85, "A", "card").match(/<text/g)).toHaveLength(4);
  });

  it("says what it is to a screen reader in its real casing", () => {
    // The card draws GITCHECKUP; the accessible name must not, because some
    // screen readers spell all-caps strings out letter by letter.
    const svg = scoreBadge(85, "A", "card");

    expect(svg).toContain('aria-label="gitcheckup: 85 A"');
    expect(svg).toContain(">GITCHECKUP<");
  });

  it("gives each card a unique clip id, so two on one page do not collide", () => {
    const a = /id="([^"]+)"/.exec(scoreBadge(85, "A", "card"))![1];
    const b = /id="([^"]+)"/.exec(scoreBadge(31, "F", "card"))![1];

    expect(a).not.toBe(b);
  });
});
