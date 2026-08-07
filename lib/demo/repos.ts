import type { RepoSignals } from "@/lib/github/types";

/**
 * Bundled fixtures for demo mode (SPEC §11.12).
 *
 * Captured from the live GitHub API on 2026-08-07 with the real six-call
 * fan-out, so these are the signals production would have produced — not
 * invented numbers. The rubric that scores them in demo mode is the real one;
 * only the input is canned.
 *
 * `pushedDaysAgo` replaces `pushedAt` on purpose. Storing an absolute date
 * would mean the demo quietly rots — every repo drifting toward "abandoned" as
 * the fixture ages, until a screenshot taken next year shows scores nobody can
 * reproduce. Recency is materialised against the clock at read time instead.
 */
interface DemoRepo extends Omit<RepoSignals, "pushedAt"> {
  /** null = never pushed. */
  pushedDaysAgo: number | null;
}

const FIXTURES: DemoRepo[] = [
  {
    owner: "facebook",
    name: "react",
    githubId: 10270250,
    description: "The library for web and native user interfaces.",
    homepage: "https://react.dev",
    topics: ["declarative", "frontend", "javascript", "library", "react", "ui"],
    stars: 247086,
    forks: 51201,
    openIssues: 1246,
    pushedDaysAgo: 0,
    isArchived: false,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: "JavaScript",
    defaultBranch: "main",
    readmeBytes: 5317,
    hasLicense: true,
    hasContributing: true,
    hasCodeOfConduct: true,
    hasSecurityPolicy: true,
    hasIssueOrPrTemplate: true,
    hasCiWorkflows: true,
    commitsLast90Days: 100,
  },
  {
    owner: "vercel",
    name: "next.js",
    githubId: 70107786,
    description: "The React Framework",
    homepage: "https://nextjs.org",
    topics: [
      "blog",
      "browser",
      "compiler",
      "components",
      "hybrid",
      "nextjs",
      "node",
      "react",
      "server-rendering",
      "ssg",
      "static",
      "static-site-generator",
      "universal",
      "vercel",
    ],
    stars: 141673,
    forks: 31704,
    openIssues: 4384,
    pushedDaysAgo: 0,
    isArchived: false,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: "JavaScript",
    defaultBranch: "canary",
    readmeBytes: 3212,
    hasLicense: true,
    hasContributing: true,
    hasCodeOfConduct: true,
    hasSecurityPolicy: false,
    hasIssueOrPrTemplate: true,
    hasCiWorkflows: true,
    commitsLast90Days: 100,
  },
  {
    owner: "sveltejs",
    name: "svelte",
    githubId: 74293321,
    description: "web development for the rest of us",
    homepage: "https://svelte.dev",
    topics: ["compiler", "template", "ui"],
    stars: 87918,
    forks: 5189,
    openIssues: 1128,
    pushedDaysAgo: 0,
    isArchived: false,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: "JavaScript",
    defaultBranch: "main",
    readmeBytes: 1730,
    hasLicense: true,
    hasContributing: true,
    hasCodeOfConduct: true,
    hasSecurityPolicy: false,
    hasIssueOrPrTemplate: true,
    hasCiWorkflows: true,
    commitsLast90Days: 100,
  },
  {
    owner: "rust-lang",
    name: "rust",
    githubId: 724712,
    description:
      "Empowering everyone to build reliable and efficient software.",
    homepage: "https://www.rust-lang.org",
    topics: ["compiler", "language", "rust"],
    stars: 115323,
    forks: 15390,
    openIssues: 12729,
    pushedDaysAgo: 0,
    isArchived: false,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: "Rust",
    defaultBranch: "main",
    readmeBytes: 3304,
    hasLicense: true,
    hasContributing: true,
    hasCodeOfConduct: true,
    hasSecurityPolicy: false,
    hasIssueOrPrTemplate: true,
    hasCiWorkflows: true,
    commitsLast90Days: 100,
  },
  {
    owner: "sindresorhus",
    name: "awesome",
    githubId: 21737465,
    description: "😎 Awesome lists about all kinds of interesting topics",
    homepage: null,
    topics: ["awesome", "awesome-list", "lists", "resources", "unicorns"],
    stars: 493277,
    forks: 36309,
    openIssues: 99,
    pushedDaysAgo: 38,
    isArchived: false,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: null,
    defaultBranch: "main",
    readmeBytes: 79614,
    hasLicense: true,
    hasContributing: true,
    hasCodeOfConduct: true,
    hasSecurityPolicy: false,
    hasIssueOrPrTemplate: true,
    hasCiWorkflows: true,
    commitsLast90Days: 5,
  },
  {
    owner: "angular",
    name: "angular.js",
    githubId: 460078,
    description: "AngularJS - HTML enhanced for web apps!",
    homepage: "https://angularjs.org",
    topics: [],
    stars: 58557,
    forks: 27035,
    openIssues: 461,
    pushedDaysAgo: 847,
    isArchived: true,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: "JavaScript",
    defaultBranch: "master",
    readmeBytes: 6130,
    hasLicense: true,
    hasContributing: true,
    hasCodeOfConduct: true,
    hasSecurityPolicy: true,
    hasIssueOrPrTemplate: true,
    hasCiWorkflows: false,
    commitsLast90Days: 0,
  },
  {
    // A real, young repository — the case the rubric is hardest on and the one
    // the two synthetic fixtures below cannot show: everything a solo author
    // controls is done (LICENSE, CI, topics, a substantial README), and it
    // still cannot reach the eighties because 15 points are stars and forks.
    // That is the open question in SPEC §12, made concrete.
    owner: "DahanItamar",
    name: "Slotline",
    githubId: 1312373375,
    description:
      "Multi-tenant booking system for rooms, equipment and consultants — double-booking prevented by a Postgres exclusion constraint rather than application code.",
    homepage: null,
    topics: [
      "booking-system",
      "concurrency",
      "fastify",
      "kysely",
      "multi-tenant",
      "postgresql",
      "react",
      "row-level-security",
      "server-sent-events",
      "typescript",
    ],
    stars: 0,
    forks: 0,
    openIssues: 0,
    pushedDaysAgo: 13,
    isArchived: false,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: "TypeScript",
    defaultBranch: "main",
    readmeBytes: 9005,
    hasLicense: true,
    hasContributing: false,
    hasCodeOfConduct: false,
    hasSecurityPolicy: false,
    hasIssueOrPrTemplate: false,
    hasCiWorkflows: true,
    commitsLast90Days: 1,
  },
  {
    owner: "acme",
    name: "starter-kit",
    githubId: 900000001,
    description: null,
    homepage: null,
    topics: [],
    stars: 3,
    forks: 0,
    openIssues: 1,
    pushedDaysAgo: null,
    isArchived: false,
    isFork: false,
    hasIssuesEnabled: true,
    primaryLanguage: null,
    defaultBranch: "main",
    readmeBytes: null,
    hasLicense: false,
    hasContributing: false,
    hasCodeOfConduct: false,
    hasSecurityPolicy: false,
    hasIssueOrPrTemplate: false,
    hasCiWorkflows: false,
    commitsLast90Days: 0,
  },
  {
    owner: "someone",
    name: "forked-tool",
    githubId: 900000002,
    description: "A fork I never got round to upstreaming.",
    homepage: null,
    topics: ["cli"],
    stars: 12,
    forks: 1,
    openIssues: 4,
    pushedDaysAgo: 210,
    isArchived: false,
    isFork: true,
    hasIssuesEnabled: false,
    primaryLanguage: "Python",
    defaultBranch: "master",
    readmeBytes: 640,
    hasLicense: true,
    hasContributing: false,
    hasCodeOfConduct: false,
    hasSecurityPolicy: false,
    hasIssueOrPrTemplate: false,
    hasCiWorkflows: false,
    commitsLast90Days: 0,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Materialises a fixture against the current clock. */
function toSignals(repo: DemoRepo, now: Date): RepoSignals {
  const { pushedDaysAgo, ...rest } = repo;

  return {
    ...rest,
    pushedAt:
      pushedDaysAgo === null
        ? null
        : new Date(now.getTime() - pushedDaysAgo * DAY_MS).toISOString(),
  };
}

/** Case-insensitive, like GitHub's own slugs. */
export function findDemoSignals(
  slug: { owner: string; name: string },
  now: Date = new Date(),
): RepoSignals | null {
  const wanted = `${slug.owner.toLowerCase()}/${slug.name.toLowerCase()}`;

  const found = FIXTURES.find(
    (repo) =>
      `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}` === wanted,
  );

  return found === undefined ? null : toSignals(found, now);
}

export function allDemoSignals(now: Date = new Date()): RepoSignals[] {
  return FIXTURES.map((repo) => toSignals(repo, now));
}

/**
 * The fixtures too small for the leaderboard's star floor, which is where the
 * landing page's suggestions come from in demo mode.
 *
 * The floor is the caller's constant, not this module's — `lib/services/` owns
 * the ranking rules and passes the number in. Without these two links the demo
 * only ever shows famous repositories scoring in the nineties, and the tip
 * list — half of what the product is for — is reachable only by guessing a URL.
 */
export function demoSlugsBelow(
  stars: number,
): ReadonlyArray<{ owner: string; name: string }> {
  return FIXTURES.filter((repo) => repo.stars < stars).map((repo) => ({
    owner: repo.owner,
    name: repo.name,
  }));
}
