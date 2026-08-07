import type { CategoryScore, Grade } from "@/lib/score/types";

/**
 * The 1200×630 card rendered by `/api/og` (SPEC §6).
 *
 * Rendered by Satori, not a browser: only flexbox and a subset of CSS work,
 * `display: flex` must be explicit on every element with more than one child,
 * and colours are literal hex — CSS custom properties do not resolve here.
 * That is why this component shares no styling with the rest of components/.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const INK = "#f1efec";
const MUTED = "#a5a29a";
const FAINT = "#6e6c66";
const CANVAS = "#0c0c0b";
const TRACK = "#232321";

const GRADE_HEX: Record<Grade, string> = {
  "A+": "#5fbf8b",
  A: "#5fbf8b",
  B: "#a3c463",
  C: "#d6ac52",
  D: "#e28c4f",
  F: "#e26760",
};

/**
 * A category bar's colour comes from what that category earned, not from the
 * repo's overall grade. Painting all five in the grade colour made a 0/25 and
 * a 25/25 identical, which is the one thing a reader takes from the card at a
 * glance. Mirrors `components/grade-color.ts`, in hex because Satori resolves
 * no custom properties.
 */
function ratioHex(ratio: number): string {
  if (ratio >= 0.9) return GRADE_HEX["A+"];
  if (ratio >= 0.7) return GRADE_HEX.B;
  if (ratio >= 0.5) return GRADE_HEX.C;
  if (ratio >= 0.3) return GRADE_HEX.D;
  return GRADE_HEX.F;
}

/** Pre-mixed against `CANVAS` — Satori supports no `color-mix()`. */
const GRADE_TINT: Record<Grade, string> = {
  "A+": "#16241d",
  A: "#16241d",
  B: "#20261a",
  C: "#282218",
  D: "#281e16",
  F: "#281817",
};

/** Long repo names must not push the score off the card (SPEC §8). */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * `https://gitcheckup.app` → `gitcheckup.app`. The scheme is noise on a card
 * nobody can click, and on localhost the port has to survive or the label
 * names a host that is not the one that rendered it.
 */
function siteLabel(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl;
  }
}

/**
 * The card states the result and stops there. It is embedded in READMEs, where
 * a list of the repository's own shortcomings is the last thing its author
 * wants rendered — and the fix list has its own home now: `/api/plan`, a
 * Markdown brief you download rather than publish.
 */
interface ShareCardProps {
  owner: string;
  name: string;
  total: number;
  grade: Grade;
  categories: CategoryScore[];
  /** Absolute, so the footer can name where the score came from. */
  siteUrl: string;
}

export function ShareCard({
  owner,
  name,
  total,
  grade,
  categories,
  siteUrl,
}: ShareCardProps) {
  const accent = GRADE_HEX[grade];

  return (
    <div style={shell}>
      <div style={headerRow}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            {truncate(owner, 28)}/
          </div>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 600 }}>
            {truncate(name, 22)}
          </div>
        </div>

        {/* Baseline-aligned on one row: stacking the grade under the number
            pushed it into the first category bar. */}
        <div style={scoreBlock}>
          <div style={{ display: "flex", fontSize: 96, color: accent }}>
            {total}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: accent,
              backgroundColor: GRADE_TINT[grade],
              borderRadius: 10,
              padding: "4px 14px",
              marginBottom: 14,
            }}
          >
            {grade}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {categories.map((category) => (
          <div key={category.key} style={barRow}>
            <div style={{ display: "flex", width: 150, color: MUTED }}>
              {category.label}
            </div>
            <div style={track}>
              <div
                style={{
                  display: "flex",
                  width: `${Math.round((category.earned / category.available) * 100)}%`,
                  backgroundColor: ratioHex(
                    category.available === 0
                      ? 0
                      : category.earned / category.available,
                  ),
                  borderRadius: 5,
                }}
              />
            </div>
            <div style={{ display: "flex", width: 74, color: FAINT }}>
              {category.earned}/{category.available}
            </div>
          </div>
        ))}
      </div>

      <div style={footer}>
        <div style={{ display: "flex", color: FAINT }}>
          git<span style={{ color: accent }}>checkup</span>
          <span style={{ paddingLeft: 10 }}>{siteLabel(siteUrl)}</span>
        </div>
        <div style={{ display: "flex", color: FAINT }}>
          Scored on public GitHub data
        </div>
      </div>
    </div>
  );
}

/** The card shown when a repo cannot be scored — always at status 200. */
export function FallbackShareCard({
  label,
  siteUrl,
}: {
  label: string;
  siteUrl: string;
}) {
  return (
    <div
      style={{
        ...shell,
        justifyContent: "center",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", fontSize: 52, fontWeight: 600 }}>
        Couldn&apos;t score this repo
      </div>
      <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
        {truncate(label, 48)}
      </div>
      <div style={{ display: "flex", fontSize: 24, color: FAINT }}>
        git<span style={{ color: "#5fbf8b" }}>checkup</span>
        <span style={{ paddingLeft: 8 }}>{siteLabel(siteUrl)}</span>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  backgroundColor: CANVAS,
  color: INK,
  padding: 64,
  fontSize: 24,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const scoreBlock: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  lineHeight: 1,
};

const barRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  fontSize: 22,
};

const track: React.CSSProperties = {
  display: "flex",
  flex: 1,
  height: 10,
  backgroundColor: TRACK,
  borderRadius: 5,
};

const footer: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderTop: `1px solid ${TRACK}`,
  paddingTop: 20,
  fontSize: 20,
};
