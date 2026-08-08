# Security audit — 2026-08-07

Audit of GitCheckup at commit `69e6ec2`, 91 source files, running against a
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

| #   | Finding                                                       | Severity                | Status                                 |
| --- | ------------------------------------------------------------- | ----------------------- | -------------------------------------- |
| 1   | No security response headers on any route                     | **Moderate**            | **Fixed** in `next.config.ts`          |
| 2   | `esbuild` advisory via `drizzle-kit` (dev only)               | **Low**                 | **Fixed** — pnpm override              |
| 3   | Upstream values interpolated into a redirect path unvalidated | **Low**                 | **Fixed** — re-parsed before redirect  |
| 4   | Rate limiter fails open                                       | Info                    | Deliberate, documented                 |
| 5   | `x-forwarded-for` trusted                                     | **Moderate** off Vercel | **Fixed** — `TRUSTED_CLIENT_IP_HEADER` |
| 6   | Database role has full DDL rights                             | Info                    | Accepted                               |
| 7   | Origin reachable without Cloudflare                           | **Moderate**            | **Fixed** — nginx allowlist            |

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

## 2. `esbuild` advisory via `drizzle-kit` · Low · **measured** · FIXED

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

**Fixed** with a pnpm override, after checking what the audit's own advice
warned about.

`drizzle-kit@0.31.10` — the current release — depends on `esbuild ^0.25.4`
directly _and_ on `@esbuild-kit/esm-loader`, which drags in the vulnerable
`0.18.20`. The `@esbuild-kit/*` packages are deprecated and were folded into
`tsx`, which `drizzle-kit` also already depends on, so that chain is
vestigial rather than load-bearing. Pinning it:

```json
"pnpm": { "overrides": { "@esbuild-kit/core-utils>esbuild": "^0.25.0" } }
```

Verified rather than assumed: `pnpm audit` reports clean, no `esbuild` below
`0.25.12` remains in the tree, and `pnpm db:generate` still loads
`drizzle.config.ts` and `lib/db/schema.ts` through that loader and reads all
four tables. `pnpm db:migrate` was not re-run against production — it goes
through the same loader, and the migrations are already applied.

## 3. Upstream values interpolated into a redirect path · Low · **read** · FIXED

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

**Fixed.** `canonical` is re-parsed through `parseRepoSlug` and the redirect
target is built by `slugPath`, so the only strings that reach a URL are ones
that matched the same expressions as user input. A slug that fails to parse
falls through and renders under the requested name, which `repo_aliases`
already resolves to a cache hit.

## 4–6. Accepted risks

- **Rate limiter fails open** (`lib/services/rate-limit.ts:58`). An unreachable
  counter allows the request. Deliberate and logged: it guards a budget, not a
  secret, and failing closed would take the site down when Neon hiccups.
- **`x-forwarded-for` is trusted** (`lib/client-ip.ts`) — **fixed for
  self-hosting**, and see Finding 7, which closes the other half of it. A reverse proxy _appends_ to this header, so a caller who
  sends `X-Forwarded-For: 1.2.3.4` occupies the left-most slot the code reads
  and picks their own rate-limit bucket. Harmless on Vercel, which rewrites the
  header; a real bypass behind nginx, Caddy, Traefik or Cloudflare, which is
  where the app is now headed. `TRUSTED_CLIENT_IP_HEADER` names the one header
  the edge controls (`cf-connecting-ip` behind Cloudflare) and, when set, is
  read exclusively — falling back would restore the bypass. Six tests, one of
  which sends a spoofed chain.
- **The database role owns the schema.** The app writes, so read-only is not an
  option; a role without DDL rights would be an improvement if migrations were
  ever split from runtime. Low value while the entire database is a rebuildable
  cache.

---

## 7. The origin answered anyone who found its address · Moderate · FIXED

Cloudflare proxies `gitcheckup.com`, but nginx accepted connections from
anywhere. Two consequences, and the second is the one that matters:

1. Cloudflare's rate limiting, caching and TLS could be walked around by
   anyone who learned the origin IP.
2. **The per-IP cold-score limit could be defeated outright.**
   `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` is safe _because Cloudflare
   overwrites that header_. A caller reaching the origin directly writes it
   themselves, picks a fresh bucket per request, and takes an unbounded number
   of cold scores off the 5000/hr GitHub budget. Finding 5 closed the
   `x-forwarded-for` bypass; this was the same bypass through the header that
   replaced it.

**Fixed** in the nginx vhost — see [`deploy/`](../deploy/). Requests whose
`$realip_remote_addr` is outside Cloudflare's published ranges get a 403;
`real_ip` separately rewrites `$remote_addr` from `CF-Connecting-IP` so the
app and the logs still see the visitor. The ranges are regenerated weekly by a
systemd timer, because a stale allowlist 403s real people.

Measured after the change:

| Request                                         | Before  | After   |
| ----------------------------------------------- | ------- | ------- |
| `https://gitcheckup.com/` via Cloudflare        | 200     | 200     |
| Direct to origin IP, `Host: gitcheckup.com`     | 200     | 403     |
| Direct to origin with forged `CF-Connecting-IP` | 200     | 403     |
| `/api/badge` direct to origin                   | 200     | 403     |
| nginx access-log address for a proxied request  | CF edge | visitor |

`certbot renew --dry-run` passes for both vhosts afterwards — the port-80
block that answers the ACME challenge is not restricted.

---

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
| `next.config.ts`                                  | Response headers          | **Finding 1** — fixed                                                                                  |
| `deploy/nginx-gitcheckup.conf`                    | Origin edge               | **Finding 7** — fixed                                                                                  |

---

## Status

Findings 1, 2, 3, 5 and 7 are fixed. 4 and 6 are accepted and documented above.

What is left is not a finding but a standing obligation: the Cloudflare
allowlist has to stay current or it starts refusing real visitors. That is what
`cloudflare-ips.timer` is for, and `journalctl -u cloudflare-ips.service` is
where to look if the site ever 403s for no apparent reason.
