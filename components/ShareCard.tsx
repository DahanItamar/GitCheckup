import type { CategoryScore, Grade, Tip } from "@/lib/score/types";

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

/** Long repo names must not push the score off the card (SPEC §8). */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

interface ShareCardProps {
  owner: string;
  name: string;
  total: number;
  grade: Grade;
  categories: CategoryScore[];
  tips: Tip[];
}

export function ShareCard({
  owner,
  name,
  total,
  grade,
  categories,
  tips,
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
              fontSize: 30,
              color: accent,
              paddingBottom: 12,
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
                  backgroundColor: accent,
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

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tips.map((tip) => (
          <div
            key={tip.checkId}
            style={{ display: "flex", fontSize: 22, color: MUTED }}
          >
            + {truncate(tip.text, 96)}
          </div>
        ))}
      </div>

      <div style={footer}>
        <div style={{ display: "flex", color: FAINT }}>
          repo<span style={{ color: accent }}>gauge</span>
        </div>
        <div style={{ display: "flex", color: FAINT }}>
          Scored on public GitHub data
        </div>
      </div>
    </div>
  );
}

/** The card shown when a repo cannot be scored — always at status 200. */
export function FallbackShareCard({ label }: { label: string }) {
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
        repo<span style={{ color: "#5fbf8b" }}>gauge</span>
        <span style={{ paddingLeft: 8 }}>— scored on public GitHub data</span>
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
