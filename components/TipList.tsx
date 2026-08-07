import type { Tip } from "@/lib/score/types";

import { DownloadLabel, downloadActionClass } from "./DownloadAction";
import { CheckIcon, WrenchIcon } from "./icons";

interface TipListProps {
  tips: Tip[];
  owner: string;
  name: string;
}

export function TipList({ tips, owner, name }: TipListProps) {
  if (tips.length === 0) {
    return (
      <section aria-labelledby="tips-heading">
        <h2
          id="tips-heading"
          className="text-xs font-medium tracking-[0.14em] text-muted uppercase"
        >
          What to fix
        </h2>
        <div
          className="mt-4 flex items-center gap-3 rounded-xl border px-4 py-3.5"
          style={{
            borderColor:
              "color-mix(in oklab, var(--accent) 30%, var(--border))",
            backgroundColor:
              "color-mix(in oklab, var(--accent) 8%, var(--canvas))",
          }}
        >
          <CheckIcon className="size-4 shrink-0 text-accent" />
          <p className="text-sm text-muted">
            Nothing to fix. Every check the rubric knows about already passes.
          </p>
        </div>
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

      <ol className="mt-4 space-y-2.5">
        {tips.map((tip, index) => (
          <li
            key={tip.checkId}
            className="animate-rise flex items-start gap-3.5 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-rest"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <WrenchIcon className="mt-0.5 size-4 shrink-0 text-faint" />
            <p className="flex-1 text-sm leading-relaxed">{tip.text}</p>
            <span
              className="mt-px shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-medium tabular-nums"
              style={{
                color: "var(--accent)",
                // 6%, matching `gradeChip` — see the contrast note there.
                backgroundColor:
                  "color-mix(in oklab, var(--accent) 6%, var(--canvas))",
              }}
            >
              +{tip.points}
            </span>
          </li>
        ))}
      </ol>

      <PlanDownload owner={owner} name={name} />
    </section>
  );
}

/**
 * A plain anchor, not a fetch-and-save button. The browser owns the download,
 * so there is no in-flight state to show, nothing to swallow, and no way for
 * the click to do nothing visible — the failure mode the `Download PNG` button
 * next to it had to be taught to handle.
 */
function PlanDownload({ owner, name }: { owner: string; name: string }) {
  return (
    <a
      href={`/api/plan?repo=${owner}/${name}`}
      download
      className={`mt-4 ${downloadActionClass}`}
    >
      <DownloadLabel format="Markdown">Download plan</DownloadLabel>
    </a>
  );
}
