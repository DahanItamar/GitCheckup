"use client";

import { useRef, useState } from "react";

import { DownloadLabel, downloadActionClass } from "./DownloadAction";
import { Spinner } from "./icons";

/**
 * Flow C (SPEC §7). Both snippets wrap the image in a link back to the result
 * page — that link is the acquisition loop and it is not optional.
 */
interface EmbedSnippetsProps {
  owner: string;
  name: string;
  siteUrl: string;
}

export function EmbedSnippets({ owner, name, siteUrl }: EmbedSnippetsProps) {
  const slug = `${owner}/${name}`;
  const target = `${siteUrl}/r/${slug}`;

  const snippets = [
    {
      id: "card",
      label: "Card",
      markdown: `[![GitCheckup](${siteUrl}/api/og?repo=${slug})](${target})`,
    },
    {
      id: "badge",
      label: "Badge",
      markdown: `[![GitCheckup](${siteUrl}/api/badge?repo=${slug})](${target})`,
    },
  ];

  return (
    <section aria-labelledby="embed-heading">
      <h2
        id="embed-heading"
        className="text-xs font-medium tracking-[0.14em] text-muted uppercase"
      >
        Put it in your README
      </h2>

      <ul className="mt-4 space-y-3">
        {snippets.map((snippet) => (
          <li key={snippet.id}>
            <SnippetRow label={snippet.label} markdown={snippet.markdown} />
          </li>
        ))}
      </ul>

      <DownloadPng owner={owner} name={name} siteUrl={siteUrl} />
    </section>
  );
}

/**
 * `idle` → `copied` on success. `manual` is the denied-clipboard path: the
 * write can fail on an insecure origin or a withheld permission, and the old
 * behaviour was to reset the label to "Copy" — the same button, the same
 * text, no indication anything had happened. The user clicks again.
 */
type CopyState = "idle" | "copied" | "manual";

function SnippetRow({ label, markdown }: { label: string; markdown: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const code = useRef<HTMLElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      // Select the text so the manual instruction is one keystroke, not a
      // drag across a truncated element that does not look selectable.
      selectContents(code.current);
      setState("manual");
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="w-12 shrink-0 text-xs text-faint">{label}</span>
      <code
        ref={code}
        className="min-w-0 flex-1 truncate font-mono text-xs text-muted"
      >
        {markdown}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-xs whitespace-nowrap transition-colors duration-150 hover:border-accent"
        style={state === "copied" ? { color: "var(--accent)" } : undefined}
      >
        <span aria-live="polite">
          {state === "copied"
            ? "Copied"
            : state === "manual"
              ? `Selected — press ${copyKeyLabel()}`
              : "Copy"}
        </span>
      </button>
    </div>
  );
}

/** Read at click time, never during render — it would not match the server. */
function copyKeyLabel(): string {
  return navigator.userAgent.includes("Mac") ? "⌘C" : "Ctrl+C";
}

function selectContents(element: HTMLElement | null) {
  const selection = window.getSelection();
  if (element === null || selection === null) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function DownloadPng({ owner, name, siteUrl }: EmbedSnippetsProps) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const cardUrl = `${siteUrl}/api/og?repo=${owner}/${name}`;

  async function download() {
    setState("busy");
    try {
      const response = await fetch(cardUrl);

      // Without this an error response still resolves to a blob, and the
      // browser saves an HTML error page under a .png name — a failure that
      // looks exactly like a success until someone opens the file.
      if (!response.ok) throw new Error(`card responded ${response.status}`);

      saveBlob(await response.blob(), `GitCheckup-${owner}-${name}.png`);
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void download()}
        disabled={state === "busy"}
        className={downloadActionClass}
      >
        {state === "busy" ? (
          <>
            <Spinner className="text-faint" />
            Preparing…
          </>
        ) : (
          <DownloadLabel format="PNG">Download card</DownloadLabel>
        )}
      </button>

      {/* Beside the control that failed, with the route that still works —
          the card renders fine in a tab even when the fetch does not. */}
      {state === "failed" && (
        <p role="alert" className="mt-2 text-sm text-muted">
          <span style={{ color: "var(--grade-f)" }}>
            Couldn&apos;t prepare the file.
          </span>{" "}
          <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-border-strong underline-offset-4 hover:text-ink"
          >
            Open the card directly
          </a>{" "}
          and save it from there.
        </p>
      )}
    </div>
  );
}

/**
 * The revoke is deferred by a tick on purpose: revoking in the same task as
 * `click()` races the browser's own read of the URL, and losing that race is
 * another download that silently never happens.
 */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
