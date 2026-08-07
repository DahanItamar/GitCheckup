import { NextResponse } from "next/server";

import {
  HTTP_STATUS,
  isGitCheckupError,
  userMessageFor,
  type GitCheckupErrorCode,
} from "@/lib/errors";
import { clientIpFrom } from "@/lib/client-ip";
import { parseRepoSlug } from "@/lib/repo-slug";
import { getOrComputeScore } from "@/lib/services/score-repo";

/**
 * The public JSON contract from SPEC §6.
 *
 * A route parses input, calls a service, and shapes a response — no business
 * logic (SPEC §4). Node runtime, like every route: one set of capabilities to
 * reason about.
 */
export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const repo = new URL(request.url).searchParams.get("repo");

  const slug = repo === null ? null : parseRepoSlug(repo);
  if (slug === null) {
    return errorResponse("INVALID_SLUG");
  }

  try {
    const result = await getOrComputeScore(slug, {
      clientIp: clientIpFrom(request.headers),
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    if (isGitCheckupError(error)) {
      return errorResponse(error.code, error.retryAfterSeconds);
    }

    // Never surface an unexpected failure's detail; it goes to the logs only.
    console.error("[api/score] unhandled failure", error);
    return errorResponse("UPSTREAM_UNAVAILABLE");
  }
}

/** Uniform error body (SPEC §6): `{ error: { code, message } }`. */
function errorResponse(
  code: GitCheckupErrorCode,
  retryAfterSeconds?: number,
): NextResponse {
  const headers = new Headers();
  if (retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }

  // The copy lives in lib/errors.ts so the API and the UI cannot drift.
  return NextResponse.json(
    { error: { code, message: userMessageFor(code) } },
    { status: HTTP_STATUS[code], headers },
  );
}
