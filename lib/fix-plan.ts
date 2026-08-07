import { toGrade } from "@/lib/score/grade";
import type { CategoryScore, Check, ScoreResult } from "@/lib/score/types";
import { NOT_ACTIONABLE } from "@/lib/tips";

/**
 * The score as a Markdown brief, for handing to a coding agent.
 *
 * Pure, like `lib/badge.ts` and for the same reason: it is a rendering of a
 * score, not a computation of one, so the route stays a thin wrapper and this
 * is testable without a network.
 *
 * Two things it deliberately does that the result page cannot:
 *
 * - **No cap.** The page shows `MAX_TIPS` (6) so the list stays readable. A
 *   file being fed to an agent has no such constraint, and truncating it would
 *   silently define "everything that needs fixing" as "the first six things".
 * - **States what already passes.** An agent editing a repository needs to
 *   know what not to break; a reader skimming a page does not.
 *
 * It carries no repository description. Descriptions are attacker-controlled
 * by anyone who can create a repository (SPEC §9), and this file is written to
 * disk and pasted into an agent's context — the two places where untrusted
 * text is least welcome. Only the slug, which `parseRepoSlug` has already
 * constrained to `[A-Za-z0-9._-]`, and the rubric's own strings appear here.
 */

export interface FixPlanInput {
  owner: string;
  name: string;
  score: ScoreResult;
  /** ISO 8601, as returned by the service. */
  fetchedAt: string;
  rubricVersion: number;
  /** Absolute URL of the result page, for provenance. */
  resultUrl: string;
}

/** `owner-name`, safe as a filename because the slug charset already is. */
export function fixPlanFilename(owner: string, name: string): string {
  return `gitcheckup-${owner}-${name}.md`;
}

export function renderFixPlan(input: FixPlanInput): string {
  const { owner, name, score } = input;
  const gap = pointGap(score.categories);
  const reachable = score.total + gap.actionable;

  return [
    `# GitCheckup fix plan — ${owner}/${name}`,
    "",
    `**${score.total}/100 · grade ${score.grade}** · rubric v${input.rubricVersion} · scored ${input.fetchedAt}`,
    "",
    gap.actionable === 0
      ? "Every check that can be acted on already passes. There is nothing in this file to do."
      : `Completing everything below is worth **+${gap.actionable} points**, which would take this repository to **${reachable}/100 (${toGrade(reachable)})**.`,
    "",
    `Source: ${input.resultUrl}`,
    "",
    briefing(),
    scoreboard(score),
    actionable(score),
    notActionable(score.categories, gap.blocked),
    passing(score.categories),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

function briefing(): string {
  return [
    "---",
    "",
    "## How to use this file",
    "",
    "You are raising this repository's GitCheckup score. GitCheckup reads public",
    "GitHub metadata only — it never sees the source — so every item below is",
    "satisfied by a file, a repository setting, or a commit.",
    "",
    "1. Work top-down. Items are ordered by the points they recover.",
    '2. Write real content. A CONTRIBUTING.md that says "TODO" scores the same',
    "   as one that helps, and is worse for the reader — the check is a proxy",
    "   for the thing, not the point of it.",
    "3. Do not touch anything under **Already passing** without a reason.",
    "4. **Not actionable** is not a to-do list. Do not attempt those.",
    "5. Some items are repository settings rather than files. They are marked.",
    "",
  ].join("\n");
}

function scoreboard(score: ScoreResult): string {
  const rows = score.categories.map(
    (category) =>
      `| ${category.label} | ${category.earned} | ${category.available} |`,
  );

  return [
    "---",
    "",
    "## Where the points are",
    "",
    "| Category | Earned | Available |",
    "| --- | ---: | ---: |",
    ...rows,
    `| **Total** | **${score.total}** | **100** |`,
    "",
  ].join("\n");
}

function actionable(score: ScoreResult): string {
  const advice = new Map(score.tips.map((tip) => [tip.checkId, tip.text]));
  const sections: string[] = [];

  for (const category of score.categories) {
    const items = category.checks
      .filter((check) => lost(check) > 0 && !NOT_ACTIONABLE.has(check.id))
      .sort((a, b) => lost(b) - lost(a));

    if (items.length === 0) continue;

    sections.push(
      `### ${category.label} — ${category.earned}/${category.available}`,
      "",
      ...items.map((check) => item(check, advice.get(check.id))),
      "",
    );
  }

  if (sections.length === 0) return "";

  return ["---", "", "## What to fix", "", ...sections].join("\n");
}

/**
 * Checks the rubric scores but the tip provider refuses to advise on, because
 * "get more stars" is not an action anyone can take (SPEC §8). Naming them
 * anyway matters here: an agent handed a list of gaps with these missing would
 * reasonably conclude the remaining points are unreachable for no stated
 * reason, or worse, try to manufacture them.
 */
function notActionable(categories: CategoryScore[], blocked: number): string {
  const items = categories
    .flatMap((category) => category.checks)
    .filter((check) => NOT_ACTIONABLE.has(check.id) && lost(check) > 0);

  if (items.length === 0) return "";

  return [
    "---",
    "",
    `## Not actionable — ${blocked} points`,
    "",
    "Scored, but nothing you can do in the repository moves them. They are",
    "listed so the arithmetic above adds up, not so they can be worked on.",
    "",
    ...items.map(
      (check) => `- **${check.label}** — ${check.earned}/${check.available}`,
    ),
    "",
  ].join("\n");
}

function passing(categories: CategoryScore[]): string {
  const items = categories
    .flatMap((category) => category.checks)
    .filter((check) => lost(check) === 0);

  if (items.length === 0) return "";

  return [
    "---",
    "",
    "## Already passing",
    "",
    "Do not regress these.",
    "",
    ...items.map(
      (check) => `- ${check.label} — ${check.available}/${check.available}`,
    ),
    "",
  ].join("\n");
}

/**
 * Checks satisfied in GitHub's own UI rather than by committing a file. An
 * agent with repository write access can do neither without being told which
 * it is — it would otherwise go looking for a file to create and find that
 * every plausible path already exists or none applies.
 */
const SETTINGS_CHECKS = new Set([
  "has-description",
  "has-topics",
  "has-homepage",
  "not-archived",
  "issues-enabled",
]);

/** A checklist line an agent can tick, carrying the points and the advice. */
function item(check: Check, advice: string | undefined): string {
  const kind = SETTINGS_CHECKS.has(check.id)
    ? " _(repository setting, not a file)_"
    : "";
  const head = `- [ ] **${check.label}**${kind} · +${lost(check)} (currently ${check.earned}/${check.available})`;

  // Beyond `MAX_TIPS` the provider stops supplying prose. The check label is
  // still the requirement, so the item stays actionable either way.
  return advice === undefined ? head : `${head}\n      ${advice}`;
}

function lost(check: Check): number {
  return check.available - check.earned;
}

function pointGap(categories: CategoryScore[]): {
  actionable: number;
  blocked: number;
} {
  let actionable = 0;
  let blocked = 0;

  for (const category of categories) {
    for (const check of category.checks) {
      if (NOT_ACTIONABLE.has(check.id)) blocked += lost(check);
      else actionable += lost(check);
    }
  }

  return { actionable, blocked };
}
