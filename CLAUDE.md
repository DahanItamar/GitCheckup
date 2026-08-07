@AGENTS.md

# RepoGauge

**Read [docs/SPEC.md](docs/SPEC.md) before changing anything.** It is the source
of truth for the architecture, the rubric weights, the dependency direction
between modules, and the build order. Notes tagged **[M1]**–**[M5]** mark places
where the implementation taught us the design was wrong; they are corrections,
not history.

For where the project stands right now and what to do next, see
[docs/HANDOFF.md](docs/HANDOFF.md).

## Where things live

| I want to change…                     | Go to                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| What a repo scores                    | `lib/score/rubric.ts` — and bump `RUBRIC_VERSION` in `lib/config.ts`         |
| What advice a failed check produces   | `lib/tips/rules.ts`                                                          |
| What GitHub data we read              | `lib/github/signals.ts` — the call budget is 6 and a test enforces it        |
| How a failure reaches the user        | `lib/errors.ts` → `components/RepoError.tsx`                                 |
| Whether a user waits on GitHub        | `lib/services/freshness.ts` — pure, fully tested                             |
| Orchestration (cache → fetch → score) | `lib/services/score-repo.ts`                                                 |
| The credential-free demo              | `lib/demo/repos.ts` — fixtures only; the rubric scoring them is the real one |
| Any SQL                               | `lib/db/scores.ts`, `lib/db/rate-limit.ts` — nothing else emits SQL          |
| The schema                            | `lib/db/schema.ts`, then `pnpm db:generate` — never hand-edit `drizzle/`     |
| The share card / badge                | `components/ShareCard.tsx`, `lib/badge.ts`                                   |
| The downloadable fix plan             | `lib/fix-plan.ts` — pure; `app/api/plan/` is a thin wrapper                  |
| A colour, a shadow, or an animation   | `app/globals.css` — components never hardcode a hex                          |
| An icon                               | `components/icons.tsx` — hand-written SVG, no icon dependency                |

## Rules the linter already enforces

`lib/score/` imports nothing. `lib/github/` and `lib/db/` never import each
other. `components/` never fetch. Files ≤500 lines, functions ≤80. If a rule
fights you, the spec explains why it exists before you change it.

## Five rules that are not the linter's job

- **Change a rubric weight → bump `RUBRIC_VERSION` in the same commit.** Cached
  rows at an older version are treated as a miss. Skipping this makes one repo
  show two different numbers.
- **`DEMO_MODE=1` must stay opt-in and silent-free.** It is the one sanctioned
  way to run without credentials (SPEC §11 assumption 12): no inference, no
  fallback, zero outbound calls, and a banner on every page. Anything that
  makes it reachable by accident, or lets a demo score be mistaken for a real
  one, turns it into the degraded-fallback behaviour §8 forbids.
- **The image routes must never trigger a GitHub fetch for a known repo.**
  `/api/og` and `/api/badge` pass `neverRefresh: true`. GitHub's Camo proxy
  calls them on every README view; without that flag, long-tail embed traffic
  drains the 5000/hr token budget with nobody waiting on the result.
  `/api/plan` is the exception that proves it: nothing embeds a download, so it
  refreshes and is rate-limited like the page.
- **The share card states the result; the fix list lives in the plan.** The
  card is embedded in the scored repo's own README, and nobody publishes a list
  of their own shortcomings. Anything advisory belongs in `/api/plan`, which is
  downloaded rather than embedded (SPEC §7 Flow B/C).
- **Grade colour behind grade-coloured text goes through `gradeChip()`.** Its
  6% is the strongest tint that clears 4.5:1 in _both_ schemes — light-mode
  amber and dark-mode red bind it from opposite directions. It takes no
  percentage argument on purpose. Use `gradeTint(grade, n)` only for washes
  with no text on them.

## Before you say it works

```
pnpm test && pnpm lint && pnpm typecheck && pnpm deps:check && pnpm build
```

`pnpm test` includes real-Postgres integration tests via PGlite — no database
or credentials required. CI runs everything except `build`, which needs a full
environment.

## Status

All five milestones are built. 249 tests, CI green.

`DEMO_MODE=1` runs the whole interface with no credentials at all — see
[docs/HANDOFF.md](docs/HANDOFF.md). It is how the UI is reviewed locally, and
it proves nothing about GitHub or Postgres by construction.

**Not yet proven:** anything that needs a deployment — the Neon HTTP driver
(PGlite verified the SQL, not that driver), and a README embed through Camo.
The app has never run against a real `DATABASE_URL` or a real `GITHUB_TOKEN`.
