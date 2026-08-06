@AGENTS.md

# RepoGauge

**Read [docs/SPEC.md](docs/SPEC.md) before changing anything.** It is the source
of truth for the architecture, the rubric weights, the dependency direction
between modules, and the build order. This file only points at it.

## Where things live

| I want to change…                     | Go to                                                                 |
| ------------------------------------- | --------------------------------------------------------------------- |
| What a repo scores                    | `lib/score/rubric.ts` — and bump `RUBRIC_VERSION` in `lib/config.ts`  |
| What advice a failed check produces   | `lib/tips/rules.ts`                                                   |
| What GitHub data we read              | `lib/github/signals.ts` — the call budget is 6 and a test enforces it |
| How a failure reaches the user        | `lib/errors.ts` → `components/RepoError.tsx`                          |
| Orchestration (cache → fetch → score) | `lib/services/score-repo.ts`                                          |

## Rules the linter already enforces

`lib/score/` imports nothing. `lib/github/` and `lib/db/` never import each
other. `components/` never fetch. Files ≤500 lines, functions ≤80. If a rule
fights you, the spec explains why it exists before you change it.

## Before you say it works

```
pnpm test && pnpm lint && pnpm typecheck && pnpm deps:check && pnpm build
```

## Status

M1 is complete: a real score from live GitHub data, rendered at
`/r/{owner}/{repo}`. There is no database yet — every request is a cold fetch.
M2 adds the Neon cache and the fresh/stale/cold branches of Flow A.
