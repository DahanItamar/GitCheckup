import type { Tip } from "@/lib/score/types";

interface TipListProps {
  tips: Tip[];
}

export function TipList({ tips }: TipListProps) {
  if (tips.length === 0) {
    return (
      <section aria-labelledby="tips-heading">
        <h2
          id="tips-heading"
          className="text-xs font-medium tracking-[0.14em] text-muted uppercase"
        >
          What to fix
        </h2>
        <p className="mt-4 text-sm text-muted">
          Nothing to fix. Every check the rubric knows about already passes.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="tips-heading">
      <h2
        id="tips-heading"
        className="text-xs font-medium tracking-[0.14em] text-muted uppercase"
      >
        What to fix
      </h2>

      <ol className="mt-4 space-y-3">
        {tips.map((tip) => (
          <li
            key={tip.checkId}
            className="flex items-start gap-4 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <span className="mt-px shrink-0 rounded-sm bg-track px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted">
              +{tip.points}
            </span>
            <p className="text-sm leading-relaxed">{tip.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
