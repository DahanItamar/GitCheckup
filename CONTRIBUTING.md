# Contributing to RepoGauge

Thanks for looking. This project is small and opinionated, and most of those
opinions are written down — so the fastest way to have a change accepted is to
read the spec first.

## Read the spec before you write code

[`docs/SPEC.md`](docs/SPEC.md) is the source of truth for the architecture, the
rubric weights, the dependency direction between modules, and the build order.
It explains **why** each constraint exists before you change it. If a rule
fights you, the reasoning is in there — and if the reasoning is wrong, say so
in an issue rather than working around it.

## Getting set up

```bash
pnpm install
cp .env.example .env      # fill in GITHUB_TOKEN, DATABASE_URL, RATE_LIMIT_SECRET
pnpm db:migrate
pnpm dev
```

`GITHUB_TOKEN` must be a fine-grained PAT with **public repository read access
and zero write scopes**. The app deliberately refuses to boot without a full
environment rather than degrading silently.

## Before you open a pull request

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm deps:check && pnpm build
```

CI runs all of these and they are blocking. Formatting is Prettier's defaults —
run `pnpm format` rather than arguing with it.

## The rules that are enforced, not suggested

ESLint encodes the module boundaries from spec §4, so these fail the build
rather than a review:

- **`lib/score/` imports nothing.** It receives `RepoSignals` and returns a
  `ScoreResult`. If it needs to fetch something, the fetch belongs in
  `lib/github/` and the result belongs in `RepoSignals`.
- **`lib/github/` and `lib/db/` never import each other.** `lib/services/` is
  the only place they meet.
- **`components/` never fetch.** They take props.
- Files ≤500 lines, functions ≤80, nesting ≤4, parameters ≤4.

## Changing the rubric

The rubric is the product, and it will be wrong in interesting ways. Changes
are welcome, with two requirements:

1. **Bump `RUBRIC_VERSION` in `lib/config.ts` in the same commit.** Cached
   scores written under an older version are treated as a cache miss. Skipping
   this makes the same repo show two different numbers.
2. **Update `lib/score/rubric.test.ts`.** Every tier boundary is pinned there
   on both sides. If your change doesn't turn that file red, it probably
   didn't do what you think.

Argue for a weight change with a repo it currently scores wrong. "This feels
low" is hard to act on; "`owner/repo` scores 62 and clearly shouldn't" is not.

## Reporting a scoring bug

Open an issue with the repo slug, the score you got, and the score you
expected. The rubric is deterministic, so anyone can reproduce it.

## Security

Please don't open a public issue for a vulnerability. See
[SECURITY.md](SECURITY.md).
