import { ImageResponse } from "next/og";

import {
  CARD_HEIGHT,
  CARD_WIDTH,
  FallbackShareCard,
  ShareCard,
} from "@/components/ShareCard";
import { IMAGE_CACHE_SECONDS, SITE_URL } from "@/lib/config";
import { parseRepoSlug } from "@/lib/repo-slug";
import { getOrComputeScore, type ScoredRepo } from "@/lib/services/score-repo";

/**
 * The share card (SPEC §7 Flow B). `.tsx` because ImageResponse takes JSX.
 *
 * Two rules define this route:
 *
 * 1. It re-derives the score server-side and accepts only a repo slug. An
 *    endpoint that renders `?score=100` into an image is a forgery generator,
 *    and the card's whole value is that it is credible (SPEC §3).
 * 2. Every failure returns a card at status 200. This URL is embedded in
 *    other people's READMEs; a broken image there is worse than a vague one.
 */
export const runtime = "nodejs";

const CACHE_CONTROL = `public, s-maxage=${IMAGE_CACHE_SECONDS}, stale-while-revalidate=604800`;

export async function GET(request: Request): Promise<Response> {
  const repo = new URL(request.url).searchParams.get("repo");
  const slug = repo === null ? null : parseRepoSlug(repo);

  if (slug === null) {
    return fallback(repo ?? "no repository given");
  }

  const result = await loadScore(slug);
  if (result === null) {
    return fallback(`${slug.owner}/${slug.name}`);
  }

  return card(
    <ShareCard
      owner={result.repo.owner}
      name={result.repo.name}
      total={result.score.total}
      grade={result.score.grade}
      categories={result.score.categories}
      siteUrl={SITE_URL}
    />,
  );
}

/**
 * Returns null instead of throwing so the caller builds JSX outside a
 * try/catch — constructing an element inside one hides render errors behind
 * the fallback, which is exactly the bug you cannot see in a README.
 */
async function loadScore(slug: {
  owner: string;
  name: string;
}): Promise<ScoredRepo | null> {
  try {
    // neverRefresh: Camo calls this on every README view. See Flow B step 3.
    return await getOrComputeScore(slug, { neverRefresh: true });
  } catch (error) {
    console.error("[api/og] could not score; using the fallback card", error);
    return null;
  }
}

function card(element: React.ReactElement): Response {
  return new ImageResponse(element, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    headers: { "Cache-Control": CACHE_CONTROL },
  });
}

function fallback(label: string): Response {
  return card(<FallbackShareCard label={label} siteUrl={SITE_URL} />);
}
