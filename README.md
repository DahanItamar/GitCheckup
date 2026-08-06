# RepoGauge

**Score any public GitHub repo out of 100 — in one paste, with zero permissions.**

Deciding whether an unfamiliar repo is worth adopting means opening six tabs. Is
there a LICENSE? Is it still maintained? Does CI run? Is the README more than a
title? RepoGauge answers all of that with one number, the five categories behind
it, and a short list of what to fix.

```
vercel/next.js      95  A+     rust-lang/rust      94  A+
docs        23/25          docs        23/25
community   17/20          community   17/20
activity    20/20          activity    19/20
popularity  15/15          popularity  15/15
hygiene     20/20          hygiene     20/20
```

Nothing to install, nothing to authorise, no account. RepoGauge reads public
GitHub metadata and nothing else — private repositories are out of scope on
purpose.

---

## Status

**M1 complete.** You can paste a repo and get a real, live score with a full
breakdown and ranked fixes. There is no database yet, so every request is a cold
fetch against the GitHub API — expect a couple of seconds.

| Milestone | What it adds                                   | State   |
| --------- | ---------------------------------------------- | ------- |
| M1        | A real score, live                             | ✅ done |
| M2        | Neon cache, `/api/score`, instant repeat views | next    |
| M3        | OG share card, README embed snippets           | planned |
| M4        | Rate limiting, `/trending`, SVG badge          | planned |
| M5        | README, CI, dogfooding                         | planned |

Full plan in [docs/SPEC.md](docs/SPEC.md).

---

## Running it

You need Node 20+, pnpm, and a GitHub token.

```bash
pnpm install
cp .env.example .env
```

Put a **fine-grained personal access token** in `.env` as `GITHUB_TOKEN`. It
needs **public repository read access and zero write scopes** — nothing more.
The token exists only to raise GitHub's rate ceiling from 60 requests/hour to
5000; the app refuses to boot without one rather than silently degrading.

```bash
pnpm dev          # http://localhost:3000
```

`RATE_LIMIT_SECRET` can be any random string for now; it is unused until M4.

---

## How the score works

100 points, five categories, fixed weights. Every check is deterministic given
the repo's public metadata — the same repo scores the same twice, and there is
no model in the loop.

| Category       | Points | What it looks at                                                                               |
| -------------- | ------ | ---------------------------------------------------------------------------------------------- |
| **Docs**       | 25     | README presence and depth, description, topics, homepage                                       |
| **Community**  | 20     | LICENSE, contributing guide, code of conduct, security policy, templates                       |
| **Activity**   | 20     | Recency of the last push, commit cadence over 90 days, issue backlog in proportion to audience |
| **Popularity** | 15     | Stars and forks, log-scaled so a 40-star project isn't crushed                                 |
| **Hygiene**    | 20     | CI workflows, not archived, not a fork, issues enabled, language detected                      |

Grades: **A+** ≥90 · **A** 80–89 · **B** 70–79 · **C** 60–69 · **D** 50–59 ·
**F** <50.

The exact per-check weights are in [docs/SPEC.md §5](docs/SPEC.md) and
implemented in [`lib/score/rubric.ts`](lib/score/rubric.ts).

### Two things the score does not claim

- **Popularity is scored but never advised on.** "Get more stars" is not an
  action anyone can take, so those checks are excluded from the fix list.
- **The floor is around 24, not 0.** Any repo that exists and is not archived
  starts with points for basic hygiene and a recent creation date. Treat the
  scale as roughly 24–100.

---

## Architecture

One Next.js app. Postgres (from M2) is the only stateful dependency — no Redis,
no queue, no worker.

```
app/          routing and rendering only — no scoring logic, no SQL
lib/github/   the only code that calls api.github.com
lib/score/    the pure rubric: RepoSignals → ScoreResult. Imports nothing.
lib/tips/     failed checks → ordered advice, behind a provider interface
lib/services/ orchestration: the one seam where fetch, score and cache meet
components/   presentational only. They take props.
```

Those boundaries are enforced by ESLint, not by review convention — see
[`eslint.config.mjs`](eslint.config.mjs). The rubric being pure is what makes it
testable without a network, and what guarantees the API and the share card can
never disagree about a score.

## Scripts

```bash
pnpm test          # vitest — the rubric and slug parser are the covered surface
pnpm lint          # eslint, including the dependency-direction rules
pnpm typecheck     # tsc --noEmit, strict + noUncheckedIndexedAccess
pnpm deps:check    # madge --circular
pnpm build         # production build
pnpm format        # prettier
```

## Contributing

Read [docs/SPEC.md](docs/SPEC.md) first — it is the source of truth for the
architecture and the rubric, and it explains why each constraint exists before
you change it. If you change a rubric weight, bump `RUBRIC_VERSION` in
[`lib/config.ts`](lib/config.ts) in the same commit.

A LICENSE, CONTRIBUTING guide, and CI workflow land in M5 — at which point
RepoGauge should score itself ≥90.
