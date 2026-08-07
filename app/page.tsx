import Link from "next/link";

import { RepoInput } from "@/components/RepoInput";
import { SuggestionChips, TrendingList } from "@/components/TrendingList";
import { SEED_REPOS, getTrending } from "@/lib/services/trending";

/** The recently-scored strip would otherwise freeze at build time. */
export const revalidate = 300;

/** Landing (SPEC §6): input, examples, and the recently-scored strip. */
export default async function Home() {
  const { repos, seeded } = await getTrending(6);

  return (
    <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        How good is that repo, really?
      </h1>

      <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
        Paste a GitHub repository. Get one number out of 100, the five
        categories behind it, and a short list of what to fix. No sign-in, no
        permissions, nothing installed.
      </p>

      <div className="mt-10 max-w-xl">
        <RepoInput autoFocus />
      </div>

      {repos.length > 0 && (
        <div className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
              Recently scored
            </h2>
            <Link
              href="/trending"
              className="text-xs text-muted transition-colors duration-150 hover:text-ink"
            >
              See all →
            </Link>
          </div>
          <div className="mt-3">
            <TrendingList repos={repos} />
          </div>
        </div>
      )}

      {seeded && (
        <div className="mt-10">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
            Try one
          </h2>
          <div className="mt-3">
            <SuggestionChips repos={SEED_REPOS} />
          </div>
        </div>
      )}

      <dl className="mt-16 grid gap-8 border-t border-border pt-10 sm:grid-cols-3">
        <div>
          <dt className="text-sm font-medium">Five categories</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-muted">
            Docs, community, activity, popularity, hygiene — weighted to 100.
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium">Same rubric every time</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-muted">
            A fixed set of checks against public metadata. No model, no
            judgement call, no drift between two runs.
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium">Zero permissions</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-muted">
            Nothing to install and nothing to authorise. Private repos are out
            of scope on purpose.
          </dd>
        </div>
      </dl>
    </div>
  );
}
