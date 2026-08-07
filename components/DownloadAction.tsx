import { DownloadIcon } from "./icons";

/**
 * The one download control, shared by the card and the fix plan.
 *
 * They are different elements on purpose — the plan is a direct link the
 * browser handles, the card is a fetch that has to report its own failure —
 * so this shares the styling and the label layout rather than wrapping both
 * in one component with a mode flag. Two controls that sit a screen apart and
 * do the same kind of thing should not drift apart because they were styled
 * twice.
 *
 * A quiet text link, not a button: neither is the action anyone came for, and
 * two boxed controls competing with the score would say otherwise. The 10px of
 * vertical padding is the touch target — invisible, but the reason the row is
 * not just the height of its text.
 */

export const downloadActionClass =
  "inline-flex items-center gap-2 py-2.5 text-sm text-muted transition-colors duration-150 hover:text-ink disabled:cursor-wait disabled:opacity-60";

/**
 * `Download plan · Markdown`. The format is a quiet suffix rather than part of
 * the verb: what you get is the noun, and how it is encoded is a detail you
 * read second.
 *
 * The underline sits on the verb alone. Dragging it under the format turns a
 * two-part label into one long ruled line, which is the visual weight the box
 * was removed to avoid.
 */
export function DownloadLabel({
  children,
  format,
}: {
  children: React.ReactNode;
  format: string;
}) {
  return (
    <>
      <DownloadIcon className="size-4 shrink-0 text-faint" />
      <span className="underline decoration-border-strong underline-offset-4">
        {children}
      </span>
      <span className="text-xs text-faint">· {format}</span>
    </>
  );
}
