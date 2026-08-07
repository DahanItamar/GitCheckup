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

**All five milestones are written.** Paste a repo and you get a live score, a
breakdown, ranked fixes, a share card, a badge, and a leaderboard.

**209 tests, and the database half is covered too.** The migrations and every
query run against real Postgres in CI — [PGlite](https://pglite.dev), which is
Postgres compiled to WebAssembly, so `DISTINCT ON`, `jsonb`, `ON CONFLICT` and
the CHECK constraints behave exactly as they will in production. No credentials
needed, which is why it runs on every commit.

What is still unproven is deployment: the Neon HTTP driver specifically, and a
real README embed through GitHub's Camo proxy.

| Milestone | What it adds                                   | State                                    |
| --------- | ---------------------------------------------- | ---------------------------------------- |
| M1        | A real score, live                             | ✅ done                                  |
| M2        | Neon cache, `/api/score`, instant repeat views | ✅ done (needs a Neon URL to run)        |
| M3        | OG share card, README embed snippets           | ✅ done                                  |
| M4        | Rate limiting, `/trending`, SVG badge          | ✅ done                                  |
| M5        | LICENSE, CI, dogfooding                        | ✅ done (dogfooding needs a public repo) |

Full plan in [docs/SPEC.md](docs/SPEC.md).

---

## Running it

You need Node 20+, pnpm, a GitHub token, and a Postgres database.

```bash
pnpm install
cp .env.example .env
```

Put a **fine-grained personal access token** in `.env` as `GITHUB_TOKEN`. It
needs **public repository read access and zero write scopes** — nothing more.
The token exists only to raise GitHub's rate ceiling from 60 requests/hour to
5000; the app refuses to boot without one rather than silently degrading.

You also need a `DATABASE_URL`. Create a free Postgres project at
[neon.tech](https://neon.tech), paste its connection string into `.env`, then
apply the schema:

```bash
pnpm db:migrate
pnpm dev          # http://localhost:3000
```

The app refuses to boot without either variable, for the same reason: a cache
that silently isn't caching, or a token that silently isn't raising the rate
limit, fails mysteriously under load instead of obviously at startup. The
startup error names the variable and links to where you get one.

`RATE_LIMIT_SECRET` must be at least 16 characters. It is the HMAC key that
hashes caller IP addresses before they reach the database — a guessable key
makes those hashes reversible. Generate one with
`node -e "console.log(crypto.randomUUID())"`.

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

### Three things the score does not claim

- **Popularity is scored but never advised on.** "Get more stars" is not an
  action anyone can take, so those checks are excluded from the fix list.
- **The floor is 14, not 0.** A repo that merely exists and is not archived
  collects points for basic hygiene and for having no issue backlog to speak
  of. Treat the scale as 14–100.
- **A brand-new repo cannot score above ~85**, however well built, because 15
  points are stars and forks. If you are judging "is this well made?" rather
  than "should I adopt this?", read the category breakdown and ignore
  popularity.

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
pnpm test          # vitest — unit tests plus real-Postgres integration tests
pnpm lint          # eslint, including the dependency-direction rules
pnpm typecheck     # tsc --noEmit, strict + noUncheckedIndexedAccess
pnpm deps:check    # madge --circular
pnpm build         # production build
pnpm format        # prettier

pnpm db:generate   # regenerate migration SQL after editing lib/db/schema.ts
pnpm db:migrate    # apply committed migrations to DATABASE_URL
pnpm db:studio     # browse the data
```

Migrations under [`drizzle/`](drizzle/) are generated, committed, and never
hand-edited.

## Contributing

Read [docs/SPEC.md](docs/SPEC.md) first — it is the source of truth for the
architecture and the rubric, and it explains why each constraint exists before
you change it. If you change a rubric weight, bump `RUBRIC_VERSION` in
[`lib/config.ts`](lib/config.ts) in the same commit.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the enforced module
boundaries, and the two rules for changing a rubric weight. Security reports go
through [SECURITY.md](SECURITY.md), not public issues.

## License

[MIT](LICENSE).
