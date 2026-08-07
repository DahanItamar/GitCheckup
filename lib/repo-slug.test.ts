import { describe, expect, it } from "vitest";

import { GitCheckupError } from "@/lib/errors";
import { assertRepoSlug, parseRepoSlug, slugKey } from "@/lib/repo-slug";

const REACT = { owner: "facebook", name: "react" };

describe("parseRepoSlug — bare owner/repo", () => {
  it("accepts the plain form", () => {
    expect(parseRepoSlug("facebook/react")).toEqual(REACT);
  });

  it("trims surrounding whitespace from a paste", () => {
    expect(parseRepoSlug("  facebook/react\n")).toEqual(REACT);
  });

  it("preserves the casing it was given", () => {
    expect(parseRepoSlug("Facebook/React")).toEqual({
      owner: "Facebook",
      name: "React",
    });
  });

  it("accepts dots, underscores and hyphens in the repo name", () => {
    expect(parseRepoSlug("vercel/next.js")).toEqual({
      owner: "vercel",
      name: "next.js",
    });
    expect(parseRepoSlug("some-owner/some_repo-2")).toEqual({
      owner: "some-owner",
      name: "some_repo-2",
    });
  });

  it("rejects a third segment", () => {
    expect(parseRepoSlug("facebook/react/tree")).toBeNull();
  });

  it("rejects a missing segment", () => {
    expect(parseRepoSlug("facebook")).toBeNull();
    expect(parseRepoSlug("facebook/")).toBeNull();
    expect(parseRepoSlug("/react")).toBeNull();
  });
});

describe("parseRepoSlug — github.com URLs", () => {
  it("accepts a canonical https URL", () => {
    expect(parseRepoSlug("https://github.com/facebook/react")).toEqual(REACT);
  });

  it("accepts a trailing slash", () => {
    expect(parseRepoSlug("https://github.com/facebook/react/")).toEqual(REACT);
  });

  it("ignores deep paths — a file link still scores the repo", () => {
    expect(
      parseRepoSlug("https://github.com/facebook/react/blob/main/README.md"),
    ).toEqual(REACT);
  });

  it("ignores query strings and fragments", () => {
    expect(
      parseRepoSlug("https://github.com/facebook/react?tab=readme-ov-file#top"),
    ).toEqual(REACT);
  });

  it("accepts http and www", () => {
    expect(parseRepoSlug("http://github.com/facebook/react")).toEqual(REACT);
    expect(parseRepoSlug("https://www.github.com/facebook/react")).toEqual(
      REACT,
    );
  });

  it("accepts a protocol-less github.com paste", () => {
    expect(parseRepoSlug("github.com/facebook/react")).toEqual(REACT);
  });

  it("rejects other hosts", () => {
    expect(parseRepoSlug("https://gitlab.com/facebook/react")).toBeNull();
    expect(
      parseRepoSlug("https://github.com.evil.test/facebook/react"),
    ).toBeNull();
  });

  it("rejects a URL with no repo segment", () => {
    expect(parseRepoSlug("https://github.com/facebook")).toBeNull();
    expect(parseRepoSlug("https://github.com/")).toBeNull();
  });
});

describe("parseRepoSlug — git@ clone URLs", () => {
  it("accepts the SSH form with the .git suffix", () => {
    expect(parseRepoSlug("git@github.com:facebook/react.git")).toEqual(REACT);
  });

  it("accepts the SSH form without the suffix", () => {
    expect(parseRepoSlug("git@github.com:facebook/react")).toEqual(REACT);
  });

  it("strips .git from an https clone URL too", () => {
    expect(parseRepoSlug("https://github.com/facebook/react.git")).toEqual(
      REACT,
    );
  });

  it("rejects an SSH URL for another host", () => {
    expect(parseRepoSlug("git@gitlab.com:facebook/react.git")).toBeNull();
  });
});

describe("parseRepoSlug — rejections that protect the fetch boundary", () => {
  it("rejects empty and whitespace-only input", () => {
    expect(parseRepoSlug("")).toBeNull();
    expect(parseRepoSlug("   ")).toBeNull();
  });

  it("rejects path traversal disguised as a repo name", () => {
    expect(parseRepoSlug("facebook/..")).toBeNull();
    expect(parseRepoSlug("facebook/.")).toBeNull();
    expect(parseRepoSlug("../../etc/passwd")).toBeNull();
  });

  it("rejects owners over 39 characters", () => {
    expect(parseRepoSlug(`${"a".repeat(39)}/repo`)).toEqual({
      owner: "a".repeat(39),
      name: "repo",
    });
    expect(parseRepoSlug(`${"a".repeat(40)}/repo`)).toBeNull();
  });

  it("rejects repo names over 100 characters", () => {
    expect(parseRepoSlug(`owner/${"a".repeat(100)}`)).not.toBeNull();
    expect(parseRepoSlug(`owner/${"a".repeat(101)}`)).toBeNull();
  });

  it("rejects owners with leading, trailing or doubled hyphens", () => {
    expect(parseRepoSlug("-owner/repo")).toBeNull();
    expect(parseRepoSlug("owner-/repo")).toBeNull();
    expect(parseRepoSlug("ow--ner/repo")).toBeNull();
  });

  it("rejects unicode and spaces", () => {
    expect(parseRepoSlug("faceböök/react")).toBeNull();
    expect(parseRepoSlug("face book/react")).toBeNull();
    expect(parseRepoSlug("facebook/re act")).toBeNull();
  });

  it("rejects characters that would escape the API path", () => {
    expect(parseRepoSlug("facebook/react%2F..")).toBeNull();
    expect(parseRepoSlug("facebook/react?x=1")).toBeNull();
    expect(parseRepoSlug("facebook/react#frag")).toBeNull();
  });

  it("rejects a repo named only .git", () => {
    expect(parseRepoSlug("facebook/.git")).toBeNull();
  });
});

describe("assertRepoSlug", () => {
  it("returns the slug for valid input", () => {
    expect(assertRepoSlug("facebook/react")).toEqual(REACT);
  });

  it("throws INVALID_SLUG for anything else", () => {
    expect(() => assertRepoSlug("not a repo")).toThrowError(GitCheckupError);
    try {
      assertRepoSlug("not a repo");
      expect.unreachable();
    } catch (error) {
      expect((error as GitCheckupError).code).toBe("INVALID_SLUG");
    }
  });
});

describe("slugKey", () => {
  it("lowercases both halves so casing variants share one cache row", () => {
    expect(slugKey({ owner: "Facebook", name: "React" })).toBe(
      "facebook/react",
    );
    expect(slugKey(REACT)).toBe("facebook/react");
  });
});
