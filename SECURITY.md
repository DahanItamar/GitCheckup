# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private vulnerability reporting: go to the **Security** tab of
this repository and choose **Report a vulnerability**. That opens a private
channel visible only to the maintainers.

Please include what you did, what happened, and what you expected. A proof of
concept helps but is not required to report something.

You should get an acknowledgement within a few days. This is a small project
maintained in spare time, so please allow reasonable time for a fix before
disclosing publicly.

## What is in scope

RepoGauge is a public, unauthenticated web application. There are no accounts,
no sessions, and no user-owned data, so the interesting surfaces are narrow:

- **SSRF.** The app fetches URLs on a user's behalf. The base URL is a
  hardcoded constant and every path segment is validated against GitHub's own
  character rules before interpolation. A way around that validation is a
  genuine finding.
- **Stored XSS via repository metadata.** Repo names, descriptions, topics and
  homepage URLs are attacker-controlled by anyone who can create a repository.
  Anything that escapes React's escaping, or a `javascript:` homepage rendered
  as a link, is a genuine finding.
- **Rate-limit bypass.** The per-IP cold-score limit protects a shared GitHub
  token budget. A way to drain it cheaply is a genuine finding.
- **Anything that exposes `GITHUB_TOKEN`, `DATABASE_URL` or
  `RATE_LIMIT_SECRET`** in a response body, an image, or a log line.

## What is not in scope

- **Missing rate limits on cached reads.** Deliberate — the resource being
  protected is the GitHub token budget, not our bandwidth.
- **Scores you disagree with.** That is a rubric issue, not a security issue.
  Open a normal issue.
- **Denial of service by volume.** Please don't; report the vector instead of
  demonstrating it.
- **Reports against `api.github.com` itself.** Send those to GitHub.

## What we store

Public GitHub metadata, plus a salted HMAC of caller IP addresses that is
deleted within two hours. No raw IP addresses, no personal data, and no
credentials belonging to anyone but the operator. The database is a cache; it
could be dropped and rebuilt by re-scoring.
