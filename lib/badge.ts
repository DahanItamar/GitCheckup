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
 * The card draws on its own ground rather than the reader's, so its palette is
 * fixed rather than inherited -- and it can be far more saturated than
 * `GRADE_HEX`, which has to stay legible on a white README too. These are the
 * same five hues at the brightness a near-black surface allows.
 */
const CARD_BG = "#090d16";
const CARD_EDGE = "#1e293b";
const CARD_RULE = "#334155";
const CARD_LABEL = "#94a3b8";
const CARD_MUTED = "#64748b";
const CARD_VALUE = "#f8fafc";
const CARD_NEUTRAL = "#64748b";

/** [accent, the lighter tint used for the letter inside the chip]. */
const CARD_GRADE: Record<Grade, readonly [string, string]> = {
  "A+": ["#22c55e", "#4ade80"],
  A: ["#22c55e", "#4ade80"],
  B: ["#84cc16", "#a3e635"],
  C: ["#eab308", "#facc15"],
  D: ["#f97316", "#fb923c"],
  F: ["#ef4444", "#f87171"],
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

/* -------------------------------------------------------------------------
 * The card style
 * ---------------------------------------------------------------------- */

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

const CARD_HEIGHT = 38;
const CARD_MID = CARD_HEIGHT / 2;
const CARD_RADIUS = 8;
const CARD_PAD = 13;

const CARD_DOT_R = 4;
/** Status dot -> label, label -> rule, rule -> score, score -> chip. */
const CARD_DOT_GAP = 11;
const CARD_RULE_GAP = 13;
const CARD_CHIP_GAP = 8;

const CARD_CHIP_H = 20;
const CARD_CHIP_RX = 6;
const CARD_CHIP_PAD = 9;

const CARD_LETTER_SPACING = 1;

const CARD_LABEL_SIZE = 11;
const CARD_VALUE_SIZE = 15;
const CARD_UNKNOWN_SIZE = 12;
const CARD_GRADE_SIZE = 12;

/** Advance factors: mono label, sans digits, sans caps, sans lowercase. */
const CARD_LABEL_FACTOR = 0.6;
const CARD_VALUE_FACTOR = 0.62;
const CARD_GRADE_FACTOR = 0.68;

const labelWidth =
  advance(LABEL, CARD_LABEL_SIZE, CARD_LABEL_FACTOR) +
  (LABEL.length - 1) * CARD_LETTER_SPACING;

/** The left half never changes: the label is a constant. */
const CARD_DOT_X = CARD_PAD + CARD_DOT_R;
const CARD_RULE_X =
  CARD_DOT_X + CARD_DOT_R + CARD_DOT_GAP + labelWidth + CARD_RULE_GAP;

function chipWidth(grade: string): number {
  // The chip hugs its letter, so `A+` is wider than `A`. Every other grade is
  // one character, and so exactly as wide as every other.
  return advance(grade, CARD_GRADE_SIZE, CARD_GRADE_FACTOR) + CARD_CHIP_PAD * 2;
}

/**
 * One fixed size for every card, so two of them in a list line up.
 *
 * Derived from the widest thing that can appear rather than typed in: the
 * three-digit score and the two-character grade together leave exactly
 * `CARD_CHIP_GAP` between them, so a later change to a font size moves this
 * number instead of silently overflowing the card. A test pins it.
 */
const CARD_WIDTH =
  CARD_RULE_X +
  1 +
  CARD_RULE_GAP +
  advance("100", CARD_VALUE_SIZE, CARD_VALUE_FACTOR) +
  CARD_CHIP_GAP +
  chipWidth("A+") +
  CARD_PAD;

const CARD_MONO =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,DejaVu Sans Mono,monospace";
const CARD_SANS =
  "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,DejaVu Sans,sans-serif";

/**
 * Cap height as a fraction of font size, near enough for both families here.
 *
 * Everything on the card sits on one optical line, but at three different
 * sizes -- so the baselines cannot be equal. Centring each string's cap box
 * on the card's midline is what makes them look aligned.
 */
const CAP_RATIO = 0.72;

function baselineFor(fontSize: number): number {
  return CARD_MID + (fontSize * CAP_RATIO) / 2;
}

interface CardText {
  x: number;
  baseline: number;
  text: string;
  width: number;
  size: number;
  fill: string;
  bold?: boolean;
  mono?: boolean;
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
  mono,
}: CardText): string {
  const weight = bold === true ? ' font-weight="700"' : "";
  const family = mono === true ? ` font-family="${CARD_MONO}"` : "";
  const spacing =
    mono === true ? ` letter-spacing="${CARD_LETTER_SPACING * 10}"` : "";
  return `<text x="${x * 10}" y="${baseline * 10}" transform="scale(.1)" fill="${fill}" font-size="${size * 10}"${weight}${family}${spacing} textLength="${width * 10}">${text}</text>`;
}

interface CardOptions {
  /** `null` when the repo could not be scored — see `unknownBadge`. */
  score: number | null;
  grade: Grade | null;
  /** The dot, the rule of the chip. */
  accent: string;
  /** The letter inside the chip — lighter, because it sits on a tinted fill. */
  tint: string;
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
function renderCard({ score, grade, accent, tint }: CardOptions): string {
  const scored = score !== null && grade !== null;
  const value = score === null ? "unknown" : String(score);

  const valueSize = scored ? CARD_VALUE_SIZE : CARD_UNKNOWN_SIZE;
  const valueW = advance(
    value,
    valueSize,
    scored ? CARD_VALUE_FACTOR : CARD_LABEL_FACTOR,
  );
  const gradeW =
    grade === null ? 0 : advance(grade, CARD_GRADE_SIZE, CARD_GRADE_FACTOR);
  const chipW = grade === null ? 0 : chipWidth(grade);

  // The score and the chip stay a tight group pinned to the right edge. Left-
  // aligning the score off the rule would open a 30px hole before the chip on
  // a single-digit score, which reads as a layout bug rather than a layout.
  const chipX = CARD_WIDTH - CARD_PAD - chipW;
  const valueX =
    (grade === null ? CARD_WIDTH - CARD_PAD : chipX - CARD_CHIP_GAP) - valueW;

  const id = `c${score ?? "u"}${grade ?? ""}`.replace(/\+/g, "p");

  // No grade, no chip. A hollow chip would read as a grade we failed to draw.
  const chip =
    grade === null
      ? ""
      : `<rect x="${chipX}" y="${(CARD_HEIGHT - CARD_CHIP_H) / 2}" width="${chipW}" height="${CARD_CHIP_H}" rx="${CARD_CHIP_RX}" fill="${accent}" fill-opacity=".18" stroke="${accent}"/>
    ${cardText({
      x: chipX + (chipW - gradeW) / 2,
      baseline: baselineFor(CARD_GRADE_SIZE),
      text: escapeXml(grade),
      width: gradeW,
      size: CARD_GRADE_SIZE,
      fill: tint,
      bold: true,
    })}`;

  const alt = `${LABEL}: ${escapeXml(value)}${grade === null ? "" : ` ${escapeXml(grade)}`}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-label="${alt}">
  <title>${alt}</title>
  <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.5" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
  <rect x=".6" y=".6" width="${CARD_WIDTH - 1.2}" height="${CARD_HEIGHT - 1.2}" rx="${CARD_RADIUS}" fill="${CARD_BG}" stroke="${CARD_EDGE}" stroke-width="1.2"/>
  <circle cx="${CARD_DOT_X}" cy="${CARD_MID}" r="${CARD_DOT_R}" fill="${accent}" filter="url(#${id})"/>
  <line x1="${CARD_RULE_X}" y1="${CARD_MID - 8}" x2="${CARD_RULE_X}" y2="${CARD_MID + 8}" stroke="${CARD_RULE}"/>
  <g text-anchor="start" font-family="${CARD_SANS}" text-rendering="geometricPrecision">
    ${cardText({ x: CARD_DOT_X + CARD_DOT_R + CARD_DOT_GAP, baseline: baselineFor(CARD_LABEL_SIZE), text: LABEL, width: labelWidth, size: CARD_LABEL_SIZE, fill: CARD_LABEL, bold: true, mono: true })}
    ${cardText({ x: valueX, baseline: baselineFor(valueSize), text: escapeXml(value), width: valueW, size: valueSize, fill: scored ? CARD_VALUE : CARD_MUTED, bold: scored })}
    ${chip}
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
    const [accent, tint] = CARD_GRADE[grade];
    return renderCard({ score: total, grade, accent, tint });
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
    return renderCard({
      score: null,
      grade: null,
      accent: CARD_NEUTRAL,
      tint: CARD_NEUTRAL,
    });
  }

  return renderBadge({ message: "unknown", color: "#6b7280", style });
}
