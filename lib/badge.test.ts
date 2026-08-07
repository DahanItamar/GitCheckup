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

/** The flat badge's green — the card must not reuse it. */
const GRADE_HEX_A = "#2f855a";

describe("the card style", () => {
  it("is opt-in — flat stays the default", () => {
    // The snippet is already in READMEs. Changing what the default renders
    // would resize a badge inside someone else's document.
    expect(parseBadgeStyle(null)).toBe("flat");
    expect(parseBadgeStyle("card")).toBe("card");
  });

  it("is always 218 x 38, whatever it contains", () => {
    // One fixed size so two badges in a list line up. 218 is derived from the
    // widest content that can occur, not typed in — this pins the number so a
    // font-size change fails here instead of overflowing the card silently.
    const sizes = new Set(
      [
        scoreBadge(100, "A+", "card"),
        scoreBadge(9, "F", "card"),
        scoreBadge(85, "A", "card"),
        unknownBadge("card"),
      ].map((svg) =>
        /width="([\d.]+)" height="([\d.]+)"/.exec(svg)!.slice(1).join("x"),
      ),
    );

    expect([...sizes]).toEqual(["218x38"]);
  });

  it("keeps the widest content clear of the rule", () => {
    // 100 + A+ is the tightest fit there is. If it ever collides, the derived
    // width above is wrong.
    const svg = scoreBadge(100, "A+", "card");
    const ruleX = Number(/<line x1="([\d.]+)"/.exec(svg)![1]);
    const valueX = Number(
      [...svg.matchAll(/<text x="([\d.]+)"/g)].map((m) => Number(m[1]) / 10)[1],
    );

    expect(valueX).toBeGreaterThan(ruleX);
  });

  it("gives every one-letter grade the same chip, and A+ a wider one", () => {
    const chipOf = (svg: string) =>
      Number(
        /<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="20"/.exec(
          svg,
        )![1],
      );

    const singles = (["A", "B", "C", "D", "F"] as const).map((g) =>
      chipOf(scoreBadge(70, g, "card")),
    );

    expect(new Set(singles).size).toBe(1);
    expect(chipOf(scoreBadge(97, "A+", "card"))).toBeGreaterThan(singles[0]!);
  });

  it("brings its own background rather than borrowing the reader's", () => {
    // The whole reason for this style: grade colours cannot be tuned for a
    // white and a near-black README at once, so it supplies its own ground —
    // which is also what lets it use hues far brighter than GRADE_HEX.
    const svg = scoreBadge(85, "A", "card");

    expect(svg).toContain("#090d16");
    expect(svg).toContain("#22c55e");
    expect(svg).not.toContain(GRADE_HEX_A);
  });

  it("puts the accent on the dot and the chip, and nowhere else", () => {
    const svg = scoreBadge(31, "F", "card");

    // Dot fill, chip fill, chip stroke.
    expect(svg.match(/#ef4444/g)).toHaveLength(3);
    // The letter itself is the lighter tint — it sits on the tinted fill.
    expect(svg.match(/#f87171/g)).toHaveLength(1);
  });

  it("drops the chip entirely when there is no grade", () => {
    // A hollow chip would read as a grade we failed to draw.
    const svg = unknownBadge("card");

    expect(svg).toContain("unknown");
    expect(svg).not.toContain('rx="6"');
    expect(svg.match(/<text/g)).toHaveLength(2);
    expect(scoreBadge(85, "A", "card").match(/<text/g)).toHaveLength(3);
  });

  it("says what it is to a screen reader", () => {
    expect(scoreBadge(85, "A", "card")).toContain(
      'aria-label="gitcheckup: 85 A"',
    );
  });

  it("gives each card a unique filter id, so two on one page do not collide", () => {
    const a = /id="([^"]+)"/.exec(scoreBadge(85, "A", "card"))![1];
    const b = /id="([^"]+)"/.exec(scoreBadge(31, "F", "card"))![1];

    expect(a).not.toBe(b);
  });
});
