# Handoff — 2026-08-07

Where RepoGauge stands, what is proven, and what to do next. Written at commit
`9537dd1`, CI green.

---

## In one line

All five milestones are built and tested; **the app has never run against a
real GitHub token or a real database**, so every remaining task needs
credentials or a deployment.

---

## Pick it up in five minutes

```bash
pnpm install
cp .env.example .env
```

Fill in three values:

| Variable            | Where to get it                                                       |
| ------------------- | --------------------------------------------------------------------- |
| `GITHUB_TOKEN`      | A **fine-grained PAT**: public repository read, **zero write scopes** |
| `DATABASE_URL`      | A free Postgres project at [neon.tech](https://neon.tech)             |
| `RATE_LIMIT_SECRET` | Any 16+ characters — `node -e "console.log(crypto.randomUUID())"`     |

Then:

```bash
pnpm db:migrate     # applies drizzle/0000 and 0001
pnpm dev            # http://localhost:3000
```

The app **refuses to boot** without all three. That is deliberate: a cache that
silently isn't caching, or a token that silently isn't raising the rate limit,
fails mysteriously under load instead of obviously at startup. The startup error
names the missing variable and links to where to get one.

First thing to try: paste `facebook/react`, then reload. The first load is a
cold six-call fan-out; the second should be near-instant from the cache. That
single check exercises the whole Flow A cache path end to end.

---

## What is proven, and how

| Area                          | Proven by                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The rubric                    | 100+ unit tests. Every tier boundary in §5 pinned on both sides.                                                                                                                                                                                                   |
| Slug parsing                  | All three input forms plus the rejection cases that protect the fetch boundary.                                                                                                                                                                                    |
| Freshness (fresh/stale/cold)  | Pure function, both sides of the 6h TTL and 7d ceiling, rubric-version mismatch both directions, clock skew.                                                                                                                                                       |
| **All SQL**                   | **Real Postgres via PGlite in CI.** Committed migrations applied verbatim; production query functions run unchanged. Covers `DISTINCT ON`, `ON CONFLICT` incrementing rather than resetting, `jsonb` round-trip, the `lower()` slug index, both CHECK constraints. |
| The share card                | Rendered as real PNGs against live GitHub and inspected as images. Caught three layout bugs compilation could not.                                                                                                                                                 |
| The badge                     | Unit tests plus rendered SVG for all six grades and both styles.                                                                                                                                                                                                   |
| GitHub rate-limit degradation | Verified against the live API — the anonymous quota was genuinely exhausted mid-session, and the chain behaved as designed: `403` → `RATE_LIMITED` → `UPSTREAM_UNAVAILABLE` → badge renders `unknown` at **200**, not a broken image.                              |

## What is not proven

| Gap                                        | Why it is still open                                                           | Closes when               |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------- |
| The `@neondatabase/serverless` HTTP driver | PGlite proves the SQL is correct, not that Neon's driver speaks it identically | First real `DATABASE_URL` |
| Live end-to-end with a real token          | Every live check used the unauthenticated API                                  | First real `GITHUB_TOKEN` |
| README embed through GitHub's Camo proxy   | Needs a public URL                                                             | First deployment          |
| RepoGauge scoring itself                   | The product reads public repos only, and this repo is **private**              | Repo made public          |

---

## Decisions waiting on a human

**1. Is 15 points of popularity right?** A flawless brand-new repository cannot
score above ~85, because 15 points are stars and forks that no amount of work
produces on day one. Scoring itself with every M5 file in place, RepoGauge
reaches 83 — so M5's own "≥90" target is unreachable as specified. This decides
whether the number answers _"should I adopt this?"_ (current weighting is
honest) or _"is this well built?"_ (current weighting is unfair). See §8.

**2. Does this repository go public?** Blocks dogfooding, the self-scored badge,
the demo GIF, and the Camo check. Nothing in the code depends on it.

**3. Production domain.** Baked into the README embed snippets, which are
painful to change after people copy them. Until it is set,
`NEXT_PUBLIC_SITE_URL` falls back to the Vercel URL, then localhost.

---

## Things that will bite you

- **`RUBRIC_VERSION` is 2.** It was bumped when a real bug was fixed: a repo
  that had never been pushed to was inheriting its creation date and scoring
  10/10 for recency. Any score cached under version 1 is treated as a miss —
  correct, and there is nothing to migrate.
- **The scale floor is 14, not 0.** A repo that merely exists collects points
  for not being archived, not being a fork, and having issues enabled. This is
  documented, not a bug.
- **Popularity is scored but never advised on.** "Get more stars" is not an
  action, and because those checks lose the most points on small repos they
  would otherwise crowd every fixable item off the tip list.
- **`x-forwarded-for` is only trustworthy on Vercel**, which overwrites it. On
  a host that does not, callers can choose their own rate-limit bucket. See
  `lib/client-ip.ts`.
- **The rate limiter fails open** on an unknown IP and on an unreachable
  counter. Both are deliberate and logged.
- **`/` and `/trending` are `revalidate = 300`.** Without that they prerender
  static and the leaderboard freezes at whatever the database held during the
  build.

---

## Related repositories

The skills used to build this live in one catalogue,
[DahanItamar/ai-skills](https://github.com/DahanItamar/ai-skills):

```
/plugin marketplace add DahanItamar/ai-skills
/plugin install flowsystem@dahanitamar      # spec-architect, spec-drift
```

`docs/SPEC.md` was produced by `spec-architect`, and `spec-drift` is the tool
for checking whether this document and the spec still match the code.
