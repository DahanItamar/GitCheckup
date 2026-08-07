import type { CategoryScore, Check } from "@/lib/score/types";

import { ratioColor } from "./grade-color";
import { CheckIcon, MissIcon, PartialIcon } from "./icons";

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
        {categories.map((category, index) => (
          <li
            key={category.key}
            className="animate-rise py-5"
            style={{ animationDelay: `${index * 60}ms` }}
          >
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
  const color = ratioColor(ratio);

  return (
    <div className="grid gap-3 sm:grid-cols-[11rem_1fr] sm:gap-6">
      <div className="flex items-baseline justify-between gap-3 sm:block">
        <h3 className="text-sm font-medium">{category.label}</h3>
        <p className="text-sm tabular-nums">
          <span style={{ color }}>{category.earned}</span>
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
            className="animate-bar-grow h-full rounded-full"
            style={{
              width: `${Math.round(ratio * 100)}%`,
              backgroundColor: color,
            }}
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

  const Glyph = passed ? CheckIcon : partial ? PartialIcon : MissIcon;
  const color = passed
    ? "var(--accent)"
    : partial
      ? "var(--grade-c)"
      : "var(--faint)";

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex shrink-0" style={{ color }}>
        <Glyph className="size-3.5" />
      </span>
      <span className="sr-only">
        {passed ? "Passed" : partial ? "Partly earned" : "Not earned"}:
      </span>
      <span className={passed ? "text-muted" : "text-ink"}>{check.label}</span>
      <span className="ml-auto shrink-0 tabular-nums text-faint">
        {check.earned}/{check.available}
      </span>
    </div>
  );
}
