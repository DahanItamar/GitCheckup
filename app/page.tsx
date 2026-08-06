import Link from "next/link";

import { RepoInput } from "@/components/RepoInput";

/**
 * Landing (SPEC §6). The "recently scored" strip needs the database and
 * arrives with /trending in M4; until then the same seed set that backs the
 * empty-leaderboard case (SPEC §8) does the work of showing what this is.
 */
const EXAMPLES = [
  { owner: "facebook", name: "react" },
  { owner: "vercel", name: "next.js" },
  { owner: "rust-lang", name: "rust" },
  { owner: "sveltejs", name: "svelte" },
];

export default function Home() {
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

      <div className="mt-10">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
          Try one
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((repo) => (
            <li key={`${repo.owner}/${repo.name}`}>
              <Link
                href={`/r/${repo.owner}/${repo.name}`}
                className="inline-block rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-xs text-muted transition-colors duration-150 hover:border-border-strong hover:text-ink"
              >
                {repo.owner}/{repo.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

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
