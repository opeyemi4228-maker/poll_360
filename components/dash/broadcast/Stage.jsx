import { formatNumber, formatShare } from "@/lib/utils";
import { kindLabel } from "@/lib/broadcast";

/**
 * The picture that goes out: the stage, drawn for a camera rather than a desk.
 *
 * Laid out at sixteen by nine and sized in viewport units, so it fills a
 * 1920×1080 browser source, a 4K wall or a laptop on a table with the same
 * proportions and no scrolling. Server-rendered: nothing here is interactive,
 * because nothing on a stage should be.
 *
 * ── THE ORDER THINGS ARE READ IN ───────────────────────────────────────────
 * A viewer arriving mid-bulletin needs four things in this order: which
 * contest, who leads, by how much, and on how much of the count. The layout
 * is that sentence, largest to smallest, with the coverage never smaller than
 * the share it qualifies.
 */

/* Party colours for a dark stage: the same hues as the cards, lifted for
   contrast against navy. A party's colour follows the party, never its rank. */
const PARTY = {
  APC: "#4D9BF0",
  PDP: "#F2555F",
  LP: "#35C77B",
  NNPP: "#8FD65E",
  ADC: "#F9A03F",
  APGA: "#D8C32B",
  SDP: "#2BC3C5",
  ACCORD: "#EFC53F",
  APM: "#B6794A",
  NDC: "#A96BE8",
};
const colourOf = (id) => PARTY[id] ?? "#8A93A6";

export default function Stage({ project, raceLabel, ground, national, places, pipeline, onAir, at }) {
  const cleared = pipeline?.stages?.find((row) => row.id === "cleared")?.count ?? 0;
  const sayable = cleared > 0;
  const parties = (national?.parties ?? []).slice(0, 5);
  const leader = parties[0] ?? null;
  const runnerUp = parties[1] ?? null;
  const top = Math.max(1, leader?.count ?? leader?.votes ?? 1);

  const strap = onAir.find((item) => item.kind === "BANNER") ?? null;
  const third = onAir.find((item) => item.kind === "LOWER_THIRD") ?? null;
  const crawl = onAir.filter((item) => item.kind === "TICKER");
  const frames = onAir.filter((item) => ["FULLSCREEN", "GRAPHIC", "MAP", "SOCIAL"].includes(item.kind));

  /* The busiest states, as a side column: the places a presenter is most
     likely to be asked about next. */
  const busiest = [...(places ?? [])]
    .filter((place) => place.filed > 0)
    .sort((a, b) => b.filed - a.filed)
    .slice(0, 6);

  return (
    <div className="relative mx-auto flex aspect-video w-full max-w-[177.78vh] flex-col overflow-hidden">
      {/* ─────────────────────────────────────────────────────────── head */}
      <header className="flex items-center justify-between px-[3.2%] pt-[2.6%]">
        <div className="flex items-center gap-[1.4vh]">
          <span className="flex size-[4.4vh] items-center justify-center rounded-full bg-red-600 text-[2vh] font-black">
            P
          </span>
          <div>
            <p className="font-display text-[3vh] leading-none font-black tracking-[-0.02em]">POLL360</p>
            <p className="text-[1.5vh] font-semibold text-white/60">{project?.title ?? "No project open"}</p>
          </div>
        </div>
        <div className="flex items-center gap-[2vh]">
          <span className="rounded-full bg-red-600 px-[1.6vh] py-[0.7vh] text-[1.5vh] font-black tracking-[0.18em] uppercase">
            Live
          </span>
          <span className="figure text-[2vh] font-bold tabular-nums">{at}</span>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────── body */}
      <div className="flex min-h-0 flex-1 gap-[2.4%] px-[3.2%] pt-[2.2%]">
        <section className="flex min-w-0 flex-1 flex-col">
          <p className="text-[1.8vh] font-bold tracking-[0.22em] text-white/50 uppercase">
            {raceLabel} · {ground}
          </p>

          {!sayable ? (
            /* ── NOTHING CLEARED, SO NOTHING SAID ────────────────────────
               The count is running; no editor has passed a place for air.
               The stage says exactly that rather than showing figures the
               desk has not stood behind. */
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <p className="font-display text-[7vh] leading-none font-black tracking-[-0.03em]">
                COUNTING UNDER WAY
              </p>
              <p className="mt-[2vh] max-w-[70%] text-[2.4vh] leading-snug text-white/70">
                Our agents are filing from the polling units. No figures have been cleared for air
                yet — they appear here the moment an editor clears them.
              </p>
              <p className="figure mt-[3vh] text-[2.2vh] text-white/50">
                {formatNumber(national?.filed ?? 0)} returns received
              </p>
            </div>
          ) : (
            <>
              {leader && (
                <p className="font-display mt-[1vh] text-[6.4vh] leading-[1.02] font-black tracking-[-0.03em]">
                  <span style={{ color: colourOf(leader.id) }}>{leader.id}</span> LEADS
                  {runnerUp && (
                    <span className="text-white/70">
                      {" "}
                      BY {formatShare((leader.share ?? 0) - (runnerUp.share ?? 0))}
                    </span>
                  )}
                </p>
              )}

              <ul className="mt-[1.6vh] flex flex-1 flex-col justify-center gap-[1.5vh]">
                {parties.map((party) => {
                  const votes = party.count ?? party.votes ?? 0;
                  return (
                    <li key={party.id} className="flex items-center gap-[1.6vh]">
                      <span className="w-[9vh] shrink-0 font-display text-[3.2vh] font-black" style={{ color: colourOf(party.id) }}>
                        {party.id}
                      </span>
                      <span className="h-[3.4vh] min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.max(2, (votes / top) * 100)}%`, background: colourOf(party.id) }}
                        />
                      </span>
                      <span className="figure w-[13vh] shrink-0 text-right text-[3vh] font-black tabular-nums">
                        {formatShare(party.share)}
                      </span>
                      <span className="figure w-[16vh] shrink-0 text-right text-[2vh] tabular-nums text-white/60">
                        {formatNumber(votes)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* ── THE SIDE: WHERE THE COUNT IS, AND WHAT IS ON AIR ─────────── */}
        <aside className="flex w-[26%] shrink-0 flex-col gap-[1.6vh]">
          <div className="rounded-[1.4vh] bg-white/5 p-[2vh]">
            <p className="text-[1.5vh] font-bold tracking-[0.18em] text-white/50 uppercase">Cleared for air</p>
            <p className="figure mt-[0.6vh] text-[5vh] leading-none font-black tabular-nums">
              {formatNumber(cleared)}
            </p>
            <p className="text-[1.6vh] text-white/60">
              of {formatNumber(national?.filed ?? 0)} returns in
              {national?.reporting === null ? "" : ` · ${formatShare(national?.reporting ?? 0)} of units`}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[1.4vh] bg-white/5 p-[2vh]">
            <p className="text-[1.5vh] font-bold tracking-[0.18em] text-white/50 uppercase">Busiest states</p>
            <ul className="mt-[1vh] flex flex-col gap-[0.9vh]">
              {busiest.map((place) => (
                <li key={place.scope} className="flex items-baseline justify-between gap-[1vh]">
                  <span className="truncate text-[2vh] font-bold">{place.name}</span>
                  <span className="figure shrink-0 text-[1.8vh] tabular-nums text-white/60">
                    {formatNumber(place.filed)}
                    {place.parties?.[0] ? ` · ${place.parties[0].id}` : ""}
                  </span>
                </li>
              ))}
              {busiest.length === 0 && <li className="text-[1.8vh] text-white/50">Nothing filed yet.</li>}
            </ul>
          </div>

          {frames.length > 0 && (
            <div className="rounded-[1.4vh] border border-white/15 p-[1.6vh]">
              <p className="text-[1.4vh] font-bold tracking-[0.18em] text-white/50 uppercase">On air</p>
              <p className="mt-[0.5vh] line-clamp-2 text-[1.9vh] leading-snug font-semibold">
                {frames[0].title}
              </p>
              <p className="text-[1.4vh] text-white/50">{kindLabel(frames[0].kind)}</p>
            </div>
          )}
        </aside>
      </div>

      {/* ── THE LOWER THIRD, THE STRAP AND THE CRAWL ─────────────────────── */}
      <footer className="mt-auto">
        {third && (
          <div className="mx-[3.2%] mb-[1.2vh] inline-flex max-w-[70%] flex-col rounded-[1vh] bg-white px-[2vh] py-[1.2vh] text-[#0C1629]">
            <span className="font-display text-[2.6vh] leading-tight font-black">{third.title}</span>
            {third.body && <span className="text-[1.8vh] leading-snug">{third.body}</span>}
          </div>
        )}

        {strap && (
          <div className="flex items-center gap-[2vh] bg-red-600 px-[3.2%] py-[1.4vh]">
            <span className="text-[1.6vh] font-black tracking-[0.2em] uppercase">Breaking</span>
            <span className="font-display truncate text-[3vh] font-black tracking-[-0.01em]">{strap.title}</span>
          </div>
        )}

        <div className="flex items-stretch bg-[#14213D]">
          <span className="flex shrink-0 items-center bg-red-600 px-[2.4vh] text-[1.6vh] font-black tracking-[0.2em] uppercase">
            Poll360
          </span>
          {/* ── THE CRAWL ────────────────────────────────────────────────
              Cleared lines only, repeated so the strip is never half empty,
              and moved by CSS rather than by script: a browser source in an
              encoder runs this for hours, and a timer that drifts or a tab
              that is throttled would leave the bottom of the picture frozen. */}
          <div className="relative flex-1 overflow-hidden py-[1.4vh]">
            <div className="flex w-max animate-stage-crawl gap-[6vh] whitespace-nowrap will-change-transform">
              {[...crawl, ...crawl, ...crawl].map((line, index) => (
                <span key={`${line.id}-${index}`} className="text-[2.1vh] font-semibold">
                  {line.title}
                </span>
              ))}
              {crawl.length === 0 && (
                <span className="text-[2.1vh] font-semibold text-white/60">
                  Poll360 parallel count · figures appear here once an editor clears them · not an official declaration
                </span>
              )}
            </div>
          </div>
          <span className="figure flex shrink-0 items-center bg-white/10 px-[2.4vh] text-[1.8vh] font-bold tabular-nums">
            {at}
          </span>
        </div>
      </footer>
    </div>
  );
}
