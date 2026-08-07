import { Spinner } from "@/components/icons";

/**
 * Shown while a cold score computes. Every cold score is a six-call fan-out
 * with a 5s per-call ceiling (SPEC §6), so this is on screen for real seconds
 * until the M2 cache lands — it mirrors the finished layout rather than
 * showing a spinner.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      {/* Outside the pulsing block and outside `aria-hidden`, because a
          skeleton only says "something is coming". It cannot say how long or
          why, and for several seconds that was all a sighted user had. */}
      <p
        role="status"
        className="mb-8 flex items-center gap-2.5 text-sm text-muted"
      >
        <Spinner className="text-faint" />
        Reading the repository from GitHub — six requests, so the first look at
        a repo takes a few seconds.
      </p>

      <div className="animate-pulse" aria-hidden="true">
        {/* Mirrors the result header's card exactly, so nothing shifts when the
            score lands (CLS is the cost of a skeleton that only roughly fits). */}
        <div className="flex flex-col gap-8 rounded-2xl border border-border p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="w-full">
            <div className="h-8 w-64 max-w-full rounded-md bg-track" />
            <div className="mt-3 h-4 w-40 rounded-md bg-track" />
          </div>
          <div className="size-[208px] shrink-0 self-center rounded-full border-[12px] border-track" />
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
      </div>
    </div>
  );
}
