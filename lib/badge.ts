import type { Grade } from "@/lib/score/types";

/**
 * A hand-written Shields-style badge (SPEC §11 assumption 8).
 *
 * ~40 lines of SVG instead of proxying shields.io, so a README embed has no
 * third-party availability dependency. Pure — no IO, so it is testable and the
 * route stays a thin wrapper.
 */

export type BadgeStyle = "flat" | "flat-square" | "card";

/**
 * Only the styles the contract promises; anything else falls back to `flat`.
 *
 * `flat` stays the default deliberately. The snippet is already copied into
 * READMEs, and changing what the default renders would silently resize a badge
 * inside someone else's document.
 */
export function parseBadgeStyle(value: string | null): BadgeStyle {
  if (value === "flat-square") return "flat-square";
  if (value === "card") return "card";
  return "flat";
}

const GRADE_HEX: Record<Grade, string> = {
  "A+": "#2f855a",
  A: "#2f855a",
  B: "#5c8a1f",
  C: "#9a7314",
  D: "#a85d18",
  F: "#a8322f",
};

/**
 * The card is drawn on its own dark ground rather than the reader's, so its
 * palette is fixed rather than inherited. These are the same five grade hues
 * the app uses, stepped for a #1b1f24 surface.
 */
const CARD_BG = "#1b1f24";
const CARD_LABEL = "#9aa4b2";
const CARD_MUTED = "#6b7480";

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

/* -------------------------------------------------------------------------
 * The card style
 * ---------------------------------------------------------------------- */

const CARD_HEIGHT = 36;
/** The grade-coloured spine down the left edge. */
const CARD_SPINE = 4;
const CARD_PAD_L = 14;
const CARD_PAD_R = 12;
/** Minimum air between the grade letter and the "/ 100" on its right. */
const CARD_GAP = 16;

/**
 * Rough Verdana advance width, as a fraction of font size.
 *
 * Only ever an estimate — `textLength` pins each string to whatever this
 * computes, so being slightly off adjusts letter spacing rather than letting
 * text escape the card. Digits are wider than lowercase in Verdana, which is
 * why the score and the label are measured separately.
 */
function advance(text: string, fontSize: number, factor = 0.62): number {
  return Math.ceil(text.length * fontSize * factor);
}

interface CardText {
  x: number;
  baseline: number;
  text: string;
  width: number;
  size: number;
  fill: string;
  bold?: boolean;
}

/** One string on the card, at 10x and scaled back — same trick as `textPair`. */
function cardText({
  x,
  baseline,
  text,
  width,
  size,
  fill,
  bold,
}: CardText): string {
  const weight = bold === true ? ' font-weight="bold"' : "";
  return `<text x="${x * 10}" y="${baseline * 10}" transform="scale(.1)" fill="${fill}" font-size="${size * 10}"${weight} textLength="${width * 10}">${text}</text>`;
}

interface CardOptions {
  /** `null` when the repo could not be scored — see `unknownBadge`. */
  score: number | null;
  grade: string | null;
  color: string;
}

/**
 * A dark card with the score as the hero.
 *
 * Unlike `flat`, this is not trying to sit in a row of CI badges — it is meant
 * to stand on its own line, so it brings its own background rather than
 * borrowing the reader's. That also fixes the one thing the flat badge cannot
 * control: grade colours that have to work on both a white and a near-black
 * README at once.
 *
 * Every width is computed. The prototype hardcoded one, which held only for a
 * two-digit score and a one-letter grade — `100`, `A+` and `unknown` all
 * overflowed it.
 */
function renderCard({ score, grade, color }: CardOptions): string {
  const label = escapeXml(LABEL);
  const value = score === null ? "unknown" : String(score);
  const suffix = score === null ? "" : "/ 100";

  const labelSize = 9;
  const valueSize = score === null ? 13 : 17;
  const gradeSize = 13;
  const suffixSize = 8;

  const labelW = advance(label, labelSize, 0.58);
  const valueW = advance(value, valueSize, score === null ? 0.6 : 0.66);
  const gradeW = grade === null ? 0 : advance(grade, gradeSize, 0.72);
  const suffixW = suffix === "" ? 0 : advance(suffix, suffixSize, 0.55);

  const gradeGap = grade === null ? 0 : 6;
  const leftRun = valueW + gradeGap + gradeW;
  const rightRun = suffixW === 0 ? 0 : CARD_GAP + suffixW;
  const content = Math.max(labelW, leftRun + rightRun);
  const width = CARD_SPINE + CARD_PAD_L + content + CARD_PAD_R;

  const x0 = CARD_SPINE + CARD_PAD_L;
  const id = `c${score ?? "u"}${grade ?? ""}`.replace(/\+/g, "p");

  const gradeText =
    grade === null
      ? ""
      : cardText({
          x: x0 + valueW + gradeGap,
          baseline: 27,
          text: escapeXml(grade),
          width: gradeW,
          size: gradeSize,
          fill: color,
          bold: true,
        });

  const suffixText =
    suffix === ""
      ? ""
      : cardText({
          x: width - CARD_PAD_R - suffixW,
          baseline: 27,
          text: suffix,
          width: suffixW,
          size: suffixSize,
          fill: CARD_MUTED,
        });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CARD_HEIGHT}" viewBox="0 0 ${width} ${CARD_HEIGHT}" role="img" aria-label="${label}: ${escapeXml(value)}${grade === null ? "" : ` ${escapeXml(grade)}`}">
  <title>${label}: ${escapeXml(value)}${grade === null ? "" : ` ${escapeXml(grade)}`}</title>
  <clipPath id="${id}"><rect width="${width}" height="${CARD_HEIGHT}" rx="6" fill="#fff"/></clipPath>
  <g clip-path="url(#${id})">
    <rect width="${width}" height="${CARD_HEIGHT}" fill="${CARD_BG}"/>
    <rect width="${CARD_SPINE}" height="${CARD_HEIGHT}" fill="${color}"/>
  </g>
  <g text-anchor="start" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision">
    ${cardText({ x: x0, baseline: 15, text: label, width: labelW, size: labelSize, fill: CARD_LABEL })}
    ${cardText({ x: x0, baseline: 27, text: escapeXml(value), width: valueW, size: valueSize, fill: "#ffffff", bold: true })}
    ${gradeText}
    ${suffixText}
  </g>
</svg>`;
}

/** The badge for a scored repo. */
export function scoreBadge(
  total: number,
  grade: Grade,
  style: BadgeStyle,
): string {
  if (style === "card") {
    return renderCard({ score: total, grade, color: GRADE_HEX[grade] });
  }

  return renderBadge({
    message: `${total} ${grade}`,
    color: GRADE_HEX[grade],
    style,
  });
}

/** SPEC §6: an unknown repo renders `gitcheckup | unknown`, never a broken image. */
export function unknownBadge(style: BadgeStyle): string {
  if (style === "card") {
    // No score and no grade: the card drops the number, the grade block and
    // the "/ 100" rather than printing a hero figure that does not exist.
    return renderCard({ score: null, grade: null, color: "#6b7280" });
  }

  return renderBadge({ message: "unknown", color: "#6b7280", style });
}
