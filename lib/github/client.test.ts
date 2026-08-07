import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { githubGet } from "./client";
import { GitHubError, isGitHubError } from "./errors";

/**
 * The only code in the repository that calls api.github.com.
 *
 * Everything above it is written against `GitHubErrorCode`, so this file is
 * where "GitHub said 403" becomes "retry later works" or "give up" — a
 * distinction three layers of degradation depend on and no type checker
 * enforces. It is also the SSRF boundary described in SPEC §9.
 *
 * `fetch` is stubbed throughout. Nothing here touches the network.
 */

const TOKEN = "test-token-not-used"; // set by vitest.config.mts

let fetchMock: ReturnType<typeof vi.fn>;

/** A `Response` with only the parts the client actually reads. */
function reply(
  status: number,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Response {
  const { body = {}, headers = {} } = options;

  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers,
  });
}

async function failureFrom(promise: Promise<unknown>): Promise<GitHubError> {
  const error = await promise.catch((cause: unknown) => cause);

  if (!isGitHubError(error)) {
    throw new Error(`expected a GitHubError, got ${String(error)}`);
  }
  return error;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the request it sends", () => {
  it("identifies itself the way GitHub asks", async () => {
    fetchMock.mockResolvedValue(reply(200, { body: { ok: true } }));

    await githubGet("/repos/facebook/react");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(headers["User-Agent"]).toContain("RepoGauge");
  });

  it("opts out of Next's fetch cache", async () => {
    fetchMock.mockResolvedValue(reply(200, { body: {} }));

    await githubGet("/repos/facebook/react");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // The rubric is only as good as its freshness. A cached response would
    // hide staleness from `lib/services/freshness.ts`, whose entire job is
    // deciding it.
    expect(init.cache).toBe("no-store");
  });

  it("carries an abort signal, so one slow call cannot hold the fan-out", async () => {
    fetchMock.mockResolvedValue(reply(200, { body: {} }));

    await githubGet("/repos/facebook/react");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the parsed body", async () => {
    fetchMock.mockResolvedValue(reply(200, { body: { stargazers_count: 7 } }));

    await expect(githubGet("/repos/a/b")).resolves.toEqual({
      stargazers_count: 7,
    });
  });
});

describe("the SSRF boundary (SPEC §9)", () => {
  it("always requests api.github.com, whatever the path looks like", async () => {
    fetchMock.mockResolvedValue(reply(200, { body: {} }));

    // There is no overload taking a full URL, on purpose. These are the shapes
    // that would matter if one were ever added, or if a caller's validation
    // slipped: a protocol-relative path and a traversal attempt must both stay
    // on the pinned host rather than becoming a request somewhere else.
    for (const path of ["/repos/a/b", "//evil.example/x", "/../../evil"]) {
      fetchMock.mockClear();
      await githubGet(path).catch(() => undefined);

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url.startsWith("https://api.github.com")).toBe(true);
    }
  });

  it("never puts the token in an error a caller might log", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const error = await failureFrom(githubGet("/repos/a/b"));

    expect(error.message).not.toContain(TOKEN);
    expect(JSON.stringify(error.message)).not.toContain("Bearer");
  });
});

describe("status → code", () => {
  it("maps 404 to NOT_FOUND", async () => {
    fetchMock.mockResolvedValue(reply(404, { body: { message: "Not Found" } }));

    const error = await failureFrom(githubGet("/repos/nope/nope"));

    expect(error.code).toBe("NOT_FOUND");
    expect(error.status).toBe(404);
  });

  it("maps a spent budget on 403 to RATE_LIMITED, with the reset time", async () => {
    fetchMock.mockResolvedValue(
      reply(403, {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1785000000",
        },
      }),
    );

    const error = await failureFrom(githubGet("/repos/a/b"));

    expect(error.code).toBe("RATE_LIMITED");
    expect(error.rateLimitResetAt).toBe(1785000000);
  });

  it("leaves a 403 that is not a spent budget as UNAVAILABLE", async () => {
    // A blocked or suspended repository also answers 403. Calling it
    // RATE_LIMITED would tell the user to wait for something that will never
    // change, and would charge it against a budget that is not the problem.
    fetchMock.mockResolvedValue(
      reply(403, { headers: { "x-ratelimit-remaining": "4999" } }),
    );

    expect((await failureFrom(githubGet("/repos/a/b"))).code).toBe(
      "UNAVAILABLE",
    );
  });

  it("treats a 403 with no rate-limit headers as UNAVAILABLE", async () => {
    fetchMock.mockResolvedValue(reply(403));

    expect((await failureFrom(githubGet("/repos/a/b"))).code).toBe(
      "UNAVAILABLE",
    );
  });

  it("maps 429 to RATE_LIMITED without needing a header", async () => {
    // The secondary limit arrives as 429 and does not always carry the
    // remaining count.
    fetchMock.mockResolvedValue(reply(429));

    expect((await failureFrom(githubGet("/repos/a/b"))).code).toBe(
      "RATE_LIMITED",
    );
  });

  it("maps 5xx to UNAVAILABLE, keeping the status for the logs", async () => {
    fetchMock.mockResolvedValue(reply(503));

    const error = await failureFrom(githubGet("/repos/a/b"));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.status).toBe(503);
  });
});

describe("failures that are not a status", () => {
  it("maps a timeout to UNAVAILABLE and says so", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeout);

    const error = await failureFrom(githubGet("/repos/a/b"));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).toContain("5000ms");
  });

  it("maps a network failure to UNAVAILABLE, keeping the cause", async () => {
    const cause = new Error("connect ECONNREFUSED");
    fetchMock.mockRejectedValue(cause);

    const error = await failureFrom(githubGet("/repos/a/b"));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).toContain("Could not reach GitHub");
    expect(error.cause).toBe(cause);
  });

  it("maps an unparseable body to UNAVAILABLE rather than a raw SyntaxError", async () => {
    // A proxy or an error page can answer 200 with HTML. Letting the JSON
    // parse escape would put a SyntaxError through a chain that only knows
    // how to degrade a GitHubError.
    fetchMock.mockResolvedValue(
      new Response("<html>upstream is having a day</html>", { status: 200 }),
    );

    const error = await failureFrom(githubGet("/repos/a/b"));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.status).toBe(200);
  });

  it("throws only GitHubError, whatever fetch does", async () => {
    // The fan-out in signals.ts branches on `instanceof GitHubError`; anything
    // else reaches `asGitHubError` and loses its detail. Callers never see a
    // raw rejection.
    for (const thrown of [new TypeError("bad"), "a string", null]) {
      fetchMock.mockRejectedValue(thrown);
      expect(
        isGitHubError(await githubGet("/x").catch((e: unknown) => e)),
      ).toBe(true);
    }
  });
});
