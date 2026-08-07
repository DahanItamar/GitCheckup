import type { Grade } from "@/lib/score/types";

/**
 * A hand-written Shields-style badge (SPEC §11 assumption 8).
 *
 * ~40 lines of SVG instead of proxying shields.io, so a README embed has no
 * third-party availability dependency. Pure — no IO, so it is testable and the
 * route stays a thin wrapper.
 */

export type BadgeStyle = "flat" | "flat-square";

/** Only the two styles the contract promises; anything else falls back. */
export function parseBadgeStyle(value: string | null): BadgeStyle {
  return value === "flat-square" ? "flat-square" : "flat";
}

const GRADE_HEX: Record<Grade, string> = {
  "A+": "#2f855a",
  A: "#2f855a",
  B: "#5c8a1f",
  C: "#9a7314",
  D: "#a85d18",
  F: "#a8322f",
};

const LABEL = "gitcheckup";
/** Shields' own label grey. Anything darker loses the contrast with the value. */
const LABEL_BG = "#555";
const HEIGHT = 20;
const PADDING = 10;

/**
 * Approximate Verdana advance width at 11px, per character.
 *
 * Only an estimate — but `textLength` below makes it exact anyway: the browser
 * stretches the glyphs to whatever this says, so a slightly wrong guess shifts
 * letter spacing rather than pushing text out of its box. That is the whole
 * reason shields.io badges never overflow on a font the viewer does not have.
 */
const CHAR_WIDTH = 6.6;

/**
 * XML-escapes text before interpolation. Nothing user-controlled reaches this
 * — the value is a number and a grade — but an SVG built by string
 * concatenation is exactly where that assumption stops being true later.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function widthFor(text: string): number {
  return Math.ceil(text.length * CHAR_WIDTH) + PADDING * 2;
}

export interface BadgeOptions {
  message: string;
  color: string;
  style: BadgeStyle;
}

/**
 * One half of the badge's text, drawn twice.
 *
 * The first copy is a near-black shadow at 30% opacity, one tenth of a unit
 * below the real glyphs. That single detail is most of why a shields.io badge
 * reads as crisp and a naive one reads as muddy: white text on mid-grey has
 * poor edge definition, and the shadow gives every stroke a boundary.
 *
 * Coordinates are ten times their real size and scaled back down by `scale(.1)`
 * — SVG rounds font metrics to the user-unit grid, so working at 10× and
 * shrinking keeps sub-pixel positions that would otherwise be lost.
 */
function textPair(centre: number, text: string, width: number): string {
  const x = centre * 10;
  const length = (width - PADDING * 2) * 10;

  return `<text aria-hidden="true" x="${x}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${length}">${text}</text>
    <text x="${x}" y="140" transform="scale(.1)" textLength="${length}">${text}</text>`;
}

export function renderBadge({ message, color, style }: BadgeOptions): string {
  const label = escapeXml(LABEL);
  const value = escapeXml(message);

  const labelWidth = widthFor(LABEL);
  const valueWidth = widthFor(message);
  const total = labelWidth + valueWidth;
  const radius = style === "flat-square" ? 0 : 3;

  // `flat` carries a barely-visible vertical sheen; `flat-square` is matte by
  // definition, and painting one there is what makes a "square" badge look
  // like a mistake rather than a choice.
  const sheen =
    style === "flat-square"
      ? ""
      : `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`;
  const sheenRect =
    style === "flat-square"
      ? ""
      : `<rect width="${total}" height="${HEIGHT}" fill="url(#s)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}" viewBox="0 0 ${total} ${HEIGHT}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  ${sheen}<clipPath id="r"><rect width="${total}" height="${HEIGHT}" rx="${radius}" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_BG}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${color}"/>
    ${sheenRect}
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    ${textPair(labelWidth / 2, label, labelWidth)}
    ${textPair(labelWidth + valueWidth / 2, value, valueWidth)}
  </g>
</svg>`;
}

/** The badge for a scored repo. */
export function scoreBadge(
  total: number,
  grade: Grade,
  style: BadgeStyle,
): string {
  return renderBadge({
    message: `${total} ${grade}`,
    color: GRADE_HEX[grade],
    style,
  });
}

/** SPEC §6: an unknown repo renders `gitcheckup | unknown`, never a broken image. */
export function unknownBadge(style: BadgeStyle): string {
  return renderBadge({ message: "unknown", color: "#6b7280", style });
}
