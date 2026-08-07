/**
 * The app's icons, hand-written rather than pulled from a set.
 *
 * Same reasoning as the badge (SPEC §11 assumption 8): five 24×24 glyphs do
 * not justify a dependency in every rendered page. They inherit `currentColor`
 * and carry no `aria-label` — every one of them sits beside text that already
 * says what it means, so labelling them would make a screen reader say it
 * twice.
 */

type IconProps = { className?: string };

function Icon({
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** A check that earned every point available to it. */
export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Icon>
  );
}

/** Earned some but not all — a half-filled ring, not a tick. */
export function PartialIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Earned nothing. Deliberately not an ✗ — a missing point is not an error. */
export function MissIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
    </Icon>
  );
}

/** Marks an actionable fix in the tip list. */
export function WrenchIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M15.5 3.6a5.5 5.5 0 0 0-7 7L3.8 15.3a2 2 0 0 0 0 2.8l2.1 2.1a2 2 0 0 0 2.8 0l4.7-4.7a5.5 5.5 0 0 0 7-7l-3.1 3.1-2.8-.7-.7-2.8z" />
    </Icon>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3.5v12m0 0 4.5-4.5M12 15.5 7.5 11M4.5 18v1.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V18" />
    </Icon>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="m12 3.5 2.6 5.6 6 .8-4.4 4.2 1.1 6.1-5.3-3-5.3 3 1.1-6.1L3.4 9.9l6-.8z" />
    </Icon>
  );
}

/**
 * The one icon that moves. Under `prefers-reduced-motion` the global rule in
 * `globals.css` flattens the spin, which leaves a legible three-quarter ring —
 * so the button still reads as busy rather than losing its indicator.
 */
export function Spinner({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={`size-3.5 animate-spin ${className ?? ""}`}
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.5 12h15m-6-6 6 6-6 6" />
    </Icon>
  );
}
