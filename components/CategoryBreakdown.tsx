import type { CategoryScore, Check } from "@/lib/score/types";

interface CategoryBreakdownProps {
  categories: CategoryScore[];
}

export function CategoryBreakdown({ categories }: CategoryBreakdownProps) {
  return (
    <section aria-labelledby="breakdown-heading">
      <h2
        id="breakdown-heading"
        className="text-xs font-medium tracking-[0.14em] text-muted uppercase"
      >
        Breakdown
      </h2>

      <ul className="mt-4 divide-y divide-border border-y border-border">
        {categories.map((category) => (
          <li key={category.key} className="py-5">
            <CategoryRow category={category} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryRow({ category }: { category: CategoryScore }) {
  const ratio =
    category.available === 0 ? 0 : category.earned / category.available;

  return (
    <div className="grid gap-3 sm:grid-cols-[11rem_1fr] sm:gap-6">
      <div className="flex items-baseline justify-between gap-3 sm:block">
        <h3 className="text-sm font-medium">{category.label}</h3>
        <p className="text-sm tabular-nums text-muted">
          {category.earned}
          <span className="text-faint"> / {category.available}</span>
        </p>
      </div>

      <div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-track"
          role="img"
          aria-label={`${category.label}: ${category.earned} of ${category.available} points`}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>

        <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {category.checks.map((item) => (
            <li key={item.id}>
              <CheckRow check={item} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: Check }) {
  const passed = check.earned === check.available;
  const partial = !passed && check.earned > 0;

  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span
        aria-hidden="true"
        className="w-3 shrink-0 font-mono text-xs"
        style={{ color: passed ? "var(--accent)" : "var(--faint)" }}
      >
        {passed ? "✓" : partial ? "~" : "·"}
      </span>
      <span className={passed ? "text-muted" : "text-ink"}>{check.label}</span>
      <span className="ml-auto shrink-0 tabular-nums text-faint">
        {check.earned}/{check.available}
      </span>
    </div>
  );
}
