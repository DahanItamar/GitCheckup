# Security audit — 2026-08-07

Audit of RepoGauge at commit `69e6ec2`, 91 source files, running against a
live Neon database and a live GitHub token.

**How this was produced.** `pnpm audit` for dependencies, live HTTP response
inspection for headers, `git grep` / `git log` for secret hygiene, sentinel
values planted through a real production build for secret leakage, and a
manual read of every file that touches a trust boundary. Findings marked
**measured** have evidence in this document; findings marked **read** are my
assessment of the code and have not been exploited or disproved.

> The `security-skills` package installed for this audit is a _catalogue_ — a
> directory of other repositories' security skills plus advice on organising a
> README. It contains no scanner, no rules and no procedure, so nothing in this
> report came from it.

---

## Summary

| #   | Finding                                                       | Severity     | Status                              |
| --- | ------------------------------------------------------------- | ------------ | ----------------------------------- |
| 1   | No security response headers on any route                     | **Moderate** | **Fixed** in `next.config.ts`       |
| 2   | `esbuild` advisory via `drizzle-kit` (dev only)               | **Low**      | Open, not exploitable in production |
| 3   | Upstream values interpolated into a redirect path unvalidated | **Low**      | Open, defence-in-depth              |
| 4   | Rate limiter fails open                                       | Info         | Deliberate, documented              |
| 5   | `x-forwarded-for` trusted                                     | Info         | Deliberate, host-dependent          |
| 6   | Database role has full DDL rights                             | Info         | Accepted                            |

No high or critical findings. The classic web vulnerabilities — SQL injection,
XSS, SSRF, secret leakage — are all closed, several of them structurally
rather than by care.

---

## 1. No security response headers · Moderate · **measured** · FIXED

Every response, checked against the running server:

```
$ curl -sD - http://localhost:3000/ | grep -iE 'content-security|x-frame|nosniff|referrer-policy|strict-transport'
(no output)
```

Next.js sets none of these by default and `next.config.ts` adds none. The app
is about to become public, which is when they start mattering:

- **`Content-Security-Policy`** — the deepest one. There is no
  `dangerouslySetInnerHTML` and no `eval` anywhere, so a CSP would be cheap to
  adopt and would convert "we found no XSS" into "an XSS could not execute".
- **`X-Content-Type-Options: nosniff`** — relevant here specifically because
  `/api/badge` serves `image/svg+xml`, and SVG navigated to directly is a
  document that can execute script. The badge's own content is escaped (see
  §XSS), so this is depth, not a live hole.
- **`X-Frame-Options` / `frame-ancestors`** — nothing in the product needs to
  be framed.
- **`Referrer-Policy`** — result URLs contain the repository someone looked
  up; leaking that in a `Referer` to GitHub is minor but avoidable.
- **`Strict-Transport-Security`** — Vercel terminates TLS, but HSTS is still
  worth declaring.

**Fixed.** A `headers()` block in `next.config.ts` now sends all six on every
route, verified live including `/api/og` and `/api/badge`. Every route still
answers 200 and the card still renders as a valid PNG.

`script-src` allows `'unsafe-inline'`, deliberately. Next inlines the RSC
payload as `<script>self.__next_f.push(…)</script>` on every page; locking that
down needs a per-request nonce, which needs middleware, which makes every route
dynamic — and `/` and `/improved` are `revalidate = 300` precisely so the CDN
absorbs their traffic instead of Neon. The absolute directives do the real work:
`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, and every fetch/font/image origin pinned to this one. An
injected `<script src="//evil">` fails; an injected inline handler would not.
An honest bound rather than a complete one — the actual XSS defence remains
that nothing renders attacker-controlled text.

**Not verified in a browser.** CSP violations surface in the console, and this
was checked with `curl`. Worth one pass over the landing page, a result page,
Download card, Copy, and Rescore before launch.

## 2. `esbuild` advisory via `drizzle-kit` · Low · **measured**

```
moderate │ esbuild enables any website to send any requests to the
         │ development server and read the response
Package  │ esbuild   Vulnerable <=0.24.2   Patched >=0.25.0
Paths    │ . > drizzle-kit@0.31.10 > @esbuild-kit/esm-loader@2.6.5
         │   > @esbuild-kit/core-utils@3.3.2 > esbuild@0.18.20
         │ GHSA-67mh-4wv8-2f99
```

One vulnerability, and it is **not in the production path**: `drizzle-kit` is a
`devDependency`, the advisory concerns esbuild's _dev server_, and neither ships
to Vercel. The realistic exposure is a developer running `pnpm db:*` while
visiting a hostile page.

**Fix:** none available today — it is transitive through an unmaintained
`@esbuild-kit` chain that `drizzle-kit` pins. Track `drizzle-kit` for an
update. Do not add an override without checking `drizzle-kit` still runs.

## 3. Upstream values interpolated into a redirect path · Low · **read**

`app/r/[owner]/[repo]/page.tsx:121`

```ts
redirect(`/r/${canonical.owner}/${canonical.name}`);
```

`canonical` comes from the GitHub API response (`repo.owner.login`,
`repo.name`), **not** from `parseRepoSlug`. Every other slug in the app is
validated to `[A-Za-z0-9._-]` before use; these two are trusted because GitHub
produced them.

I could not construct an exploit: the path is relative and prefixed with `/r/`,
so a protocol-relative `//evil.com` cannot reach the start of the URL, and
GitHub's own naming rules exclude `/` and `..`. It is a **defence-in-depth**
gap rather than a live vulnerability — the app's stated rule is that
everything crossing the boundary is validated, and this is the one place that
relies on an upstream's good behaviour instead.

**Fix:** run `canonical` back through `parseRepoSlug` and fall through to
rendering if it fails.

## 4–6. Accepted risks

- **Rate limiter fails open** (`lib/services/rate-limit.ts:58`). An unreachable
  counter allows the request. Deliberate and logged: it guards a budget, not a
  secret, and failing closed would take the site down when Neon hiccups.
- **`x-forwarded-for` is trusted** (`lib/client-ip.ts`). Correct on Vercel,
  which overwrites it. On a host that does not, a caller can choose their own
  rate-limit bucket. Documented in the handoff.
- **The database role owns the schema.** The app writes, so read-only is not an
  option; a role without DDL rights would be an improvement if migrations were
  ever split from runtime. Low value while the entire database is a rebuildable
  cache.

---

## What is closed, and why

### SQL injection — closed structurally · **measured**

Every query goes through drizzle: either the builder or `sql` tagged templates.
Interpolations are bound parameters, not string concatenation. Evidence, from a
driver error surfaced during development:

```
query : where "scores"."repo_id" = $1 and "scores"."total" = $2
        and "scores"."categories" = $5::jsonb
params: [6, 70, 'A+', 2, '[{"key":"docs",…}]', '[]']
```

`$1…$6` with a separate params array is the driver escaping, which is the only
escaping that works. Three files emit raw SQL (`lib/db/scores.ts`, lines 196,
257 and 405) and all three use the tagged form.

Second layer: `parseRepoSlug` constrains owner and name to `[A-Za-z0-9._-]`
before anything reaches a query.

### XSS — closed · **measured**

```
dangerouslySetInnerHTML : 0
eval / new Function     : 0
repo description rendered: 0
```

Repository descriptions, topics and homepages are attacker-controlled by anyone
who can create a repository. The app renders **only** `owner/name` and numbers
on public surfaces — `components/TrendingList.tsx` and `ImprovedList.tsx` both
carry a comment saying so. React escapes what remains.

The SVG badge is built by string concatenation, which would be the obvious hole
— but `lib/badge.ts:58-59` runs both interpolated strings through `escapeXml`
first, and the only values that reach it are a fixed label and `${total}
${grade}`.

### SSRF — closed structurally · **read**

Exactly two `fetch` calls exist in the app:

| File                               | Target                      | Control                                                                                                             |
| ---------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `lib/github/client.ts:62`          | `` `${API_BASE}${path}` ``  | `API_BASE` is a hardcoded constant; there is no overload taking a full URL, and every path segment is pre-validated |
| `components/EmbedSnippets.tsx:131` | `/api/og` on our own origin | client-side, same-origin                                                                                            |

A test asserts the first stays on `api.github.com` for a traversal attempt and
a protocol-relative path.

### Secrets — closed · **measured**

```
.env tracked in git     : 0
.env anywhere in history: 0
```

The two DSN-shaped matches in tracked files are test fixtures
(`postgresql://u:p@host/db`) and the demo-mode placeholder — neither is real.

Leakage to the browser was tested by planting sentinel values, building a real
production bundle, and searching everything a browser receives:

| Searched                                       | Token | DB password |
| ---------------------------------------------- | ----: | ----------: |
| Client bundles (`.next/static`)                |     0 |           0 |
| Live HTTP responses (`/`, `/improved`, `/r/…`) |     0 |           0 |
| Every JS chunk those pages load                |     0 |           — |
| Server bundles                                 |     0 |           — |

Zero in _server_ bundles too: the token is never baked into any artifact, only
read from `process.env` at runtime. `NEXT_PUBLIC_SITE_URL` is the only
client-inlined variable, and it is a public domain.

### Authentication and session attacks — not applicable · **measured**

```
cookies()   : 0
Set-Cookie  : 0
localStorage: 0
```

There are no accounts, no sessions and no user data. Whole categories —
session fixation, cookie theft, privilege escalation, IDOR — have no surface.

One Server Action exists (`app/r/[owner]/[repo]/actions.ts`, the rescore
control). Next verifies Origin against Host on Server Actions by default, and
the action re-parses its input rather than trusting the form field, takes the
rate-limited cold path, and mutates nothing beyond a cache row.

### Personal data — none stored · **read**

The only stored data is public GitHub metadata plus **HMAC-SHA256 hashes of
caller IPs** (`lib/services/rate-limit.ts:26`) with a two-hour lifetime. Raw
addresses never reach Postgres. There is no PII, no deletion request to honour,
and the whole database is a rebuildable cache.

---

## Per-file notes

Only files touching a trust boundary are listed. The remaining ~70 — the
rubric, tips, components, tests, migrations — process already-validated data
and hold no security decision.

| File                                              | Boundary                  | Assessment                                                                                             |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `lib/repo-slug.ts`                                | **All untrusted input**   | The single validation choke point. Constrains to `[A-Za-z0-9._-]`; everything downstream depends on it |
| `lib/github/client.ts`                            | Outbound HTTP, credential | Hardcoded base URL, no full-URL overload, 5s timeout, token never in an error message. 20 tests        |
| `lib/db/scores.ts`                                | All score SQL             | Parameterised throughout, including three raw `sql` templates                                          |
| `lib/db/rate-limit.ts`                            | Rate-limit SQL            | Parameterised; stores only hashes                                                                      |
| `lib/services/rate-limit.ts`                      | PII                       | HMAC before storage; fails open by design                                                              |
| `lib/client-ip.ts`                                | Header trust              | `x-forwarded-for`; correct on Vercel only                                                              |
| `lib/config.ts`                                   | Secrets                   | Zod-validated, throws at import; demo placeholders are inert                                           |
| `lib/badge.ts`                                    | SVG generation            | String-built but `escapeXml`'d; inputs are a number and a grade                                        |
| `lib/fix-plan.ts`                                 | File written to disk      | Carries no repository description; a test pins the input shape so one cannot be added                  |
| `app/api/*/route.ts`                              | Public HTTP               | Parse → service → shape. Errors carry a code and generic copy; upstream detail goes to logs only       |
| `app/r/[owner]/[repo]/page.tsx`                   | Public HTML, redirect     | **Finding 3**                                                                                          |
| `app/r/[owner]/[repo]/actions.ts`                 | Server Action             | Re-parses input; rate-limited                                                                          |
| `components/TrendingList.tsx`, `ImprovedList.tsx` | Public listing            | Render only `owner/name` and numbers, deliberately                                                     |
| `components/ShareCard.tsx`                        | Rendered image            | Satori, no descriptions, truncated slugs                                                               |
| `next.config.ts`                                  | Response headers          | **Finding 1** — no headers block                                                                       |

---

## Recommended order

1. **Add the headers block** (Finding 1) — before the site is public, ~20 lines.
2. **Validate the canonical slug** (Finding 3) — two lines, removes the one
   place that trusts an upstream string.
3. **Track `drizzle-kit`** (Finding 2) — nothing to do today.
