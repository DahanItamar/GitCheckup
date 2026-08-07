import type { CategoryScore } from "@/lib/score/types";

/**
 * The magnitudes the radar deliberately normalises away.
 *
 * The radar answers "how do these two differ?"; this answers "by how much?".
 * Shipping only the radar would leave a reader with a shape and no numbers,
 * which is the standard way that chart misleads — and because every axis there
 * is a percentage, the fact that Docs is worth 25 points and Popularity 15
 * exists nowhere else on the page.
 *
 * Paired bars share a baseline, so the comparison a reader actually performs
 * is a length difference rather than an area.
 */

export interface BarSeries {
  label: string;
  categories: CategoryScore[];
}

export function CompareBars({ a, b }: { a: BarSeries; b: BarSeries }) {
  return (
    <section aria-labelledby="compare-bars-heading">
      <h2
        id="compare-bars-heading"
        className="text-xs font-medium tracking-[0.14em] text-muted uppercase"
      >
        Category by category
      </h2>

      <ul className="mt-4 divide-y divide-border border-y border-border">
        {a.categories.map((category, index) => (
          <li key={category.key} className="py-4">
            <Row
              label={category.label}
              available={category.available}
              a={category.earned}
              b={b.categories[index]?.earned ?? 0}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  label,
  available,
  a,
  b,
}: {
  label: string;
  available: number;
  a: number;
  b: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[11rem_1fr] sm:gap-6">
      <div className="flex items-baseline justify-between gap-3 sm:block">
        <h3 className="text-sm font-medium">{label}</h3>
        {/* The denominator lives here because the radar cannot show it. */}
        <p className="text-xs text-faint tabular-nums">of {available}</p>
      </div>

      <div className="space-y-1.5">
        <Bar value={a} available={available} color="var(--series-a)" />
        <Bar value={b} available={available} color="var(--series-b)" />
      </div>
    </div>
  );
}

function Bar({
  value,
  available,
  color,
}: {
  value: number;
  available: number;
  color: string;
}) {
  const ratio = available === 0 ? 0 : value / available;

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
        <div
          className="animate-bar-grow h-full rounded-full"
          style={{
            width: `${Math.round(ratio * 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">
        {value}
      </span>
    </div>
  );
}
