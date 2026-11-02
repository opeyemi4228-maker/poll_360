/**
 * What a signed-in screen shows the moment it is asked for.
 *
 * ── WHY EVERY ROOM HAS ONE ─────────────────────────────────────────────────
 * Every signed-in page is built on the server, per request, from the
 * database. Without a loading file the browser keeps the old screen up and
 * shows nothing at all until the whole new one has arrived, so a click on a
 * slow connection looks like a click that did not register, and people click
 * again. With one, the framework prefetches this outline ahead of the click
 * and swaps it in at once, then streams the real page into its place.
 *
 * Drawn in the dashboard's own frame (white rail, white sheet, pale wells) so
 * the swap reads as the page filling in, not as a different page. It is a
 * server component with no script and no data: it has to be the cheapest
 * thing on the site.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function PageLoading({ rail = true }) {
  return (
    <div className="min-h-dvh bg-dash-sheet" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>

      {rail ? (
        <div
          aria-hidden
          className="fixed inset-y-0 left-0 hidden w-60 border-r border-dash-line bg-dash-rail p-5 lg:block"
        >
          <div className="h-8 w-28 rounded-md bg-dash-bg" />
          <div className="mt-10 space-y-3">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-9 rounded-lg bg-dash-bg" />
            ))}
          </div>
        </div>
      ) : null}

      <div aria-hidden className={rail ? "animate-pulse p-4 sm:p-6 lg:pl-66" : "animate-pulse p-4 sm:p-6"}>
        <div className="h-7 w-56 max-w-full rounded-md bg-dash-bg" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-dash-bg" />

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 rounded-xl bg-dash-bg" />
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="h-80 rounded-xl bg-dash-bg lg:col-span-2" />
          <div className="h-80 rounded-xl bg-dash-bg" />
        </div>
      </div>
    </div>
  );
}
