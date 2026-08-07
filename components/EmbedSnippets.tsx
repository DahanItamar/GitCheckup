"use client";

import { useState } from "react";

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
      markdown: `[![RepoGauge](${siteUrl}/api/og?repo=${slug})](${target})`,
    },
    {
      id: "badge",
      label: "Badge",
      markdown: `[![RepoGauge](${siteUrl}/api/badge?repo=${slug})](${target})`,
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

function SnippetRow({ label, markdown }: { label: string; markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the text is selectable either way.
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="w-12 shrink-0 text-xs text-faint">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
        {markdown}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-xs transition-colors duration-150 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function DownloadPng({ owner, name, siteUrl }: EmbedSnippetsProps) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await fetch(`${siteUrl}/api/og?repo=${owner}/${name}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `RepoGauge-${owner}-${name}.png`;
      link.click();

      URL.revokeObjectURL(url);
    } catch {
      // Nothing actionable to say; the card is one click away at /api/og.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={busy}
      className="mt-3 text-sm text-muted underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:text-ink disabled:opacity-60"
    >
      {busy ? "Preparing…" : "Download PNG"}
    </button>
  );
}
