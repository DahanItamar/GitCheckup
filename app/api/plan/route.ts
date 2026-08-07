import { clientIpFrom } from "@/lib/client-ip";
import { RUBRIC_VERSION, SITE_URL } from "@/lib/config";
import { HTTP_STATUS, isGitCheckupError, userMessageFor } from "@/lib/errors";
import { fixPlanFilename, renderFixPlan } from "@/lib/fix-plan";
import { parseRepoSlug } from "@/lib/repo-slug";
import { getOrComputeScore } from "@/lib/services/score-repo";

/**
 * The fix plan as a Markdown download (Flow C's sibling).
 *
 * Like `/api/og`, it accepts only a repo slug and re-derives the score
 * server-side. A route that rendered whatever numbers were handed to it would
 * turn a file people paste into an agent into an instruction-injection vector,
 * which is the last thing a file that exists to be pasted into an agent should
 * be (SPEC §3).
 *
 * Unlike `/api/og` it does **not** pass `neverRefresh`. Nothing embeds this in
 * a README, so there is no Camo traffic to defend against — it is a deliberate
 * click by someone who is waiting for the answer, and so it is charged against
 * the caller's cold-score budget exactly like the result page.
 */
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const repo = new URL(request.url).searchParams.get("repo");
  const slug = repo === null ? null : parseRepoSlug(repo);

  if (slug === null) {
    return problem("INVALID_SLUG");
  }

  try {
    const result = await getOrComputeScore(slug, {
      clientIp: clientIpFrom(request.headers),
    });

    const markdown = renderFixPlan({
      owner: result.repo.owner,
      name: result.repo.name,
      score: result.score,
      fetchedAt: result.fetchedAt,
      rubricVersion: RUBRIC_VERSION,
      resultUrl: `${SITE_URL}/r/${result.repo.owner}/${result.repo.name}`,
    });

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fixPlanFilename(result.repo.owner, result.repo.name)}"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    if (isGitCheckupError(error)) return problem(error.code, error);

    console.error("[api/plan] unhandled failure", error);
    return problem("UPSTREAM_UNAVAILABLE");
  }
}

/**
 * Markdown in, Markdown out — including on failure. A browser that followed a
 * download link should not be handed a JSON blob it will save as `.md`.
 */
function problem(
  code: Parameters<typeof userMessageFor>[0],
  error?: { retryAfterSeconds?: number | undefined },
): Response {
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
  });
  if (error?.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(error.retryAfterSeconds));
  }

  const body = `# GitCheckup\n\nNo fix plan: ${userMessageFor(code)}\n`;
  return new Response(body, { status: HTTP_STATUS[code], headers });
}
