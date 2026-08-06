/**
 * Shown while a cold score computes. Every cold score is a six-call fan-out
 * with a 5s per-call ceiling (SPEC §6), so this is on screen for real seconds
 * until the M2 cache lands — it mirrors the finished layout rather than
 * showing a spinner.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto max-w-3xl animate-pulse px-6 py-14"
      aria-hidden="true"
    >
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full">
          <div className="h-8 w-64 max-w-full rounded-md bg-track" />
          <div className="mt-3 h-4 w-40 rounded-md bg-track" />
        </div>
        <div className="size-[200px] shrink-0 self-center rounded-full border-[14px] border-track" />
      </div>

      <div className="mt-14 space-y-5 border-y border-border py-5">
        {["docs", "community", "activity", "popularity", "hygiene"].map(
          (key) => (
            <div
              key={key}
              className="grid gap-3 sm:grid-cols-[11rem_1fr] sm:gap-6"
            >
              <div className="h-4 w-24 rounded-md bg-track" />
              <div className="h-1.5 w-full rounded-full bg-track" />
            </div>
          ),
        )}
      </div>

      <span className="sr-only">Scoring this repository…</span>
    </div>
  );
}
