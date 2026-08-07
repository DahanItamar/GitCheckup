import { parseBadgeStyle, scoreBadge, unknownBadge } from "@/lib/badge";
import { IMAGE_CACHE_SECONDS } from "@/lib/config";
import { parseRepoSlug } from "@/lib/repo-slug";
import { getOrComputeScore } from "@/lib/services/score-repo";

/**
 * The README badge (SPEC §6).
 *
 * Same two rules as the share card: the score is re-derived server-side from
 * a slug alone, and every failure renders a badge at status 200 rather than a
 * broken image in someone else's README.
 */
export const runtime = "nodejs";

const CACHE_CONTROL = `public, s-maxage=${IMAGE_CACHE_SECONDS}, stale-while-revalidate=604800`;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const style = parseBadgeStyle(params.get("style"));
  const repo = params.get("repo");
  const slug = repo === null ? null : parseRepoSlug(repo);

  if (slug === null) {
    return svg(unknownBadge(style));
  }

  try {
    // neverRefresh: Camo calls this on every README view. See Flow B step 3.
    const result = await getOrComputeScore(slug, { neverRefresh: true });
    return svg(scoreBadge(result.score.total, result.score.grade, style));
  } catch (error) {
    console.error("[api/badge] falling back to unknown", error);
    return svg(unknownBadge(style));
  }
}

function svg(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
