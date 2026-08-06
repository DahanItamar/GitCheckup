import type { RepoSignals } from "@/lib/github/types";
import type { CategoryScore, Check, Tip } from "@/lib/score/types";

import { MAX_TIPS, type TipProvider } from "./types";

/**
 * The v1 tip provider: fixed strings, one per rubric check, ranked by the
 * points they would recover.
 *
 * Deterministic on purpose — these render inside the OG image, which must be
 * fast, free, and identical on every render (SPEC §3).
 */

const TIP_TEXT: Record<string, string> = {
  "has-readme":
    "Add a README. It is the first thing anyone reads, and right now there is nothing to read.",
  "readme-depth":
    "Expand the README: what the project does, how to install it, and one worked example.",
  "has-description":
    "Set a repository description. It is what shows in GitHub search results and on your profile.",
  "has-topics":
    "Add at least three topics. They are how people find the repo from GitHub search.",
  "has-homepage":
    "Add a homepage or docs link in the About panel so visitors have somewhere to go next.",

  "has-license":
    "Add a LICENSE file. Without one, others legally cannot reuse your code.",
  "has-contributing":
    "Add CONTRIBUTING.md so a first-time contributor knows where to start.",
  "has-code-of-conduct":
    "Add a CODE_OF_CONDUCT.md. GitHub offers a one-click template for it.",
  "has-security-policy":
    "Add SECURITY.md so vulnerability reports reach you privately instead of a public issue.",
  "has-templates":
    "Add an issue or pull request template. Better reports, less back and forth.",

  "recent-push":
    "Push something. The last commit is old enough that visitors will assume the project is abandoned.",
  "commit-cadence":
    "Commit more regularly. A steady cadence is what tells people the project is alive.",
  "issue-backlog":
    "Triage the open issues. The backlog is large relative to the size of the audience.",

  "has-ci":
    "Add a GitHub Actions workflow. A green check on every pull request is the strongest quality signal there is.",
  "not-archived":
    "This repo is archived. Unarchive it if it is still maintained, or say so in the README if it is not.",
  "is-original":
    "This is a fork, so the original repository gets the credit for the work.",
  "issues-enabled":
    "Turn on Issues. It is how people report bugs and ask questions.",
  "language-detected":
    "GitHub detected no primary language, which usually means the code lives somewhere unusual.",
};

/**
 * Popularity is scored but never advised on: "get more stars" is not an action
 * anyone can take, and because those checks lose the most points on a small
 * repo they would otherwise crowd out every fixable item on the list.
 */
const NOT_ACTIONABLE = new Set(["star-count", "fork-count"]);

export class RuleTipProvider implements TipProvider {
  generate(signals: RepoSignals, categories: CategoryScore[]): Promise<Tip[]> {
    return Promise.resolve(buildTips(signals, categories));
  }
}

function buildTips(signals: RepoSignals, categories: CategoryScore[]): Tip[] {
  const tips: Tip[] = [];

  for (const category of categories) {
    for (const item of category.checks) {
      const tip = tipFor(item, signals);
      if (tip !== null) tips.push(tip);
    }
  }

  // Stable sort: equal-value tips keep rubric order, so the same repo always
  // produces the same list in the same order.
  return tips.sort((a, b) => b.points - a.points).slice(0, MAX_TIPS);
}

function tipFor(item: Check, signals: RepoSignals): Tip | null {
  const points = item.available - item.earned;
  if (points <= 0) return null;
  if (NOT_ACTIONABLE.has(item.id)) return null;

  // With no README at all, "expand the README" is noise underneath "add one".
  if (item.id === "readme-depth" && signals.readmeBytes === null) return null;

  const text = TIP_TEXT[item.id];
  if (text === undefined) return null;

  return { checkId: item.id, text, points };
}
