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

const LABEL = "repogauge";
const LABEL_BG = "#3f3f46";
const HEIGHT = 20;
const CHAR_WIDTH = 6.6;
const PADDING = 10;

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

export function renderBadge({ message, color, style }: BadgeOptions): string {
  const label = escapeXml(LABEL);
  const value = escapeXml(message);

  const labelWidth = widthFor(LABEL);
  const valueWidth = widthFor(message);
  const total = labelWidth + valueWidth;
  const radius = style === "flat-square" ? 0 : 3;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}" viewBox="0 0 ${total} ${HEIGHT}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <clipPath id="r"><rect width="${total}" height="${HEIGHT}" rx="${radius}" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_BG}"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
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

/** SPEC §6: an unknown repo renders `repogauge | unknown`, never a broken image. */
export function unknownBadge(style: BadgeStyle): string {
  return renderBadge({ message: "unknown", color: "#6b7280", style });
}
