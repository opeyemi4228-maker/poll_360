"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PATTERNED } from "@/lib/party-pattern";
import { Pause, Play, RotateCcw } from "lucide-react";

import NationMap from "./NationMap";
import Standings from "./Standings";
import CoverageMeter from "./CoverageMeter";
import Ticker from "./Ticker";
import StateTable from "./StateTable";
import { snapshot, parties, others, SILENT } from "@/lib/replay";
import { DECLARED, SOURCE } from "@/lib/election2023";
import { cn, formatShare } from "@/lib/utils";

/** Milliseconds per batch of returns. Fast enough to move, slow enough to read. */
const TICK = 240;
/** How long the finished board holds before the evening replays. */
const HOLD = 6000;

/**
 * The board: everything a situation room watches, on one surface.
 *
 * ── WHY IT PLAYS AT ALL ────────────────────────────────────────────────────
 * A screenshot of a finished count proves nothing, anyone can draw a finished
 * count. What has to be demonstrated is the *evening*: a map that starts
 * mostly silent, coverage that climbs, a leader that changes hands early and
 * settles late, and figures that never once appear without the share of booths
 * behind them. That argument can only be made in motion.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ── AND WHY IT STOPS ───────────────────────────────────────────────────────
 * Playback pauses when the tab is hidden and when the board scrolls out of
 * view, and never runs at all for a visitor who asked their system for reduced
 * motion, they get the finished board immediately, which is the same
 * information without the theatre. A page left open on a phone all evening
 * should not spend the evening animating into a pocket.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ── ONE COLOUR RULE ────────────────────────────────────────────────────────
 * Nothing in this board's chrome is brand red, because Labour Party's red is a
 * fill on the map. Inside the instrument, colour belongs to the data; the live
 * dot, the timeline and the tags are white. Two reds meaning two different
 * things in one frame is how a viewer learns to distrust both.
 * ───────────────────────────────────────────────────────────────────────────
 */
/**
 * A party's swatch, textured to match the map.
 *
 * CSS rather than the SVG <pattern> the map uses, because this is a 10px box
 * in a list and not a shape in a drawing. The two are kept deliberately close:
 * the same angle, the same weight of rule, the same white over the party's
 * own colour.
 */
function swatchFor(party) {
  const colour = party.token;
  const kind = PATTERNED[party.id];
  if (kind === "diagonal") {
    return `repeating-linear-gradient(45deg, ${colour} 0 3px, rgba(255,255,255,0.42) 3px 5px)`;
  }
  if (kind === "dots") {
    return `radial-gradient(rgba(255,255,255,0.42) 1px, ${colour} 1.2px)`;
  }
  return colour;
}

export default function LiveBoard({ board, className }) {
  /* The server and the first client render produce exactly this cursor, so the
     map is in the HTML, populated, not empty, before any JavaScript runs,
     and hydration has nothing to disagree about. */
  const [cursor, setCursor] = useState(board.opening);
  const [playing, setPlaying] = useState(true);
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);

  /* Reduced motion: show the completed election and never animate. Read after
     mount, because matchMedia cannot be read on the server without the two
     renders disagreeing about the first paint. */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) setCursor(board.events.length);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [board.events.length]);

  /* Off-screen and background tabs cost nothing. */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.12,
    });
    observer.observe(node);

    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const running = playing && visible && !reduced;

  useEffect(() => {
    if (!running) return;

    if (cursor >= board.events.length) {
      const restart = setTimeout(() => setCursor(board.opening), HOLD);
      return () => clearTimeout(restart);
    }

    const advance = setTimeout(() => setCursor((value) => value + 1), TICK);
    return () => clearTimeout(advance);
  }, [running, cursor, board.events.length, board.opening]);

  const view = useMemo(() => snapshot(board, cursor), [board, cursor]);

  /* A clock derived from the count's own progress rather than the visitor's
     device: deterministic, identical on both renders, and honest, it is the
     collation's time, not tonight's. Nigeria declared in the small hours. */
  const clock = useMemo(() => {
    const progress = board.events.length ? cursor / board.events.length : 0;
    const minutes = Math.round(19 * 60 + progress * 9 * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }, [cursor, board.events.length]);

  const complete = cursor >= board.events.length;

  return (
    <div
      ref={containerRef}
      className={cn("on-board border border-board-line bg-board", className)}
    >
      {/* ---------------------------------------------------------- chrome */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-board-line px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full bg-white",
              running && "animate-pulse-live"
            )}
          />
          <span className="tag text-white">{complete ? "Count complete" : "Collating"}</span>
        </p>

        <p className="tag text-white/45">Presidential · 25 February 2023</p>

        <p className="figure ml-auto text-[0.8125rem] font-bold text-white tabular-nums">{clock}</p>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            disabled={reduced}
            className="inline-flex size-8 items-center justify-center border border-white/20 text-white transition-colors hover:border-white hover:bg-white hover:text-ink-950 disabled:opacity-30"
            aria-label={playing ? "Pause the replay" : "Play the replay"}
          >
            {playing ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />}
          </button>
          <button
            type="button"
            onClick={() => setCursor(board.opening)}
            className="inline-flex size-8 items-center justify-center border border-white/20 text-white transition-colors hover:border-white hover:bg-white hover:text-ink-950"
            aria-label="Replay from the start of the evening"
          >
            <RotateCcw size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* The provenance line. It sits above the numbers rather than under them
          because a screenshot of an election board travels further than the
          page around it, and this is the sentence that has to travel with it. */}
      <p className="border-b border-board-line bg-white/5 px-4 py-2 text-[0.75rem] leading-relaxed text-white/75 sm:px-5">
        <span className="tag mr-2 text-white">Replay</span>
        These are the real declared results of the 2023 presidential election. Only the order they
        arrive in is made up, nobody publishes a booth-by-booth arrival log, so every figure, and
        the finished map, is exactly what happened.
      </p>

      {/* ----------------------------------------------------------- board */}
      <div className="grid gap-px bg-board-line lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="bg-board p-4 sm:p-5">
          <NationMap shapes={board} byState={view.byState} />

          {/* Legend. Present because there is more than one series; the codes
              on the map and the table below carry the same identity without
              it. A textured party's swatch carries the same texture the map
              draws it with — a key that shows a flat colour for a fill the
              map hatches teaches the reader the wrong thing twice. */}
          <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-board-line pt-4">
            {[...parties, others].map((party) => (
              <li key={party.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0"
                  style={{ background: swatchFor(party) }}
                />
                <span className="figure text-[0.75rem] font-bold text-white">{party.id}</span>
                <span className="hidden text-[0.75rem] text-white/45 sm:inline">{party.name}</span>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 border border-white/15"
                style={{ background: SILENT }}
              />
              <span className="text-[0.75rem] text-white/45">No returns yet</span>
            </li>
          </ul>
        </div>

        <div className="grid gap-px bg-board-line">
          <CoverageMeter
            className="bg-board p-4 sm:p-5"
            coverage={view.coverage}
            unitsReported={view.unitsReported}
            booths={view.booths}
            statesComplete={view.statesComplete}
            statesTotal={view.statesTotal}
            turnout={view.turnout}
          />
          <Standings
            className="bg-board p-4 sm:p-5"
            standings={view.standings}
            total={view.total}
            margin={view.margin}
          />
          <Ticker className="bg-board p-4 sm:p-5" rows={view.ticker} />
        </div>
      </div>

      {/* ------------------------------------------------------- timeline */}
      <div className="flex items-center gap-4 border-t border-board-line px-4 py-3 sm:px-5">
        <span className="tag shrink-0 text-white/45">Evening</span>
        <input
          type="range"
          min={0}
          max={board.events.length}
          value={cursor}
          /* Touching the timeline hands control to the reader and stops
             playback. Doing it in `onChange` covers the keyboard case too, arrow keys move a range input without any pointer event, and a
             board that kept advancing under an arrow key would be unusable. */
          onChange={(event) => {
            setCursor(Number(event.target.value));
            setPlaying(false);
          }}
          className="h-1 w-full cursor-pointer appearance-none bg-white/15"
          style={{ accentColor: "#ffffff" }}
          aria-label="Scrub through the evening's returns"
        />
        <span className="figure shrink-0 text-[0.75rem] text-white/55 tabular-nums">
          {formatShare(view.coverage)}
        </span>
      </div>

      {/* ---------------------------------------------- the colourless copy */}
      <div className="grid gap-px border-t border-board-line bg-board-line lg:grid-cols-[minmax(0,1fr)_21rem]">
        <StateTable className="bg-board p-4 sm:p-5" byState={view.byState} states={board.states} />

        <div className="bg-board p-4 sm:p-5">
          <h3 className="tag text-white/55">Reading this board</h3>
          <ul className="mt-3 space-y-3 text-[0.8125rem] leading-relaxed text-white/70">
            <li>
              <span className="font-bold text-white">Grey does not mean zero.</span> A state nobody
              has reported from is drawn grey and says “no returns yet” in the table.
            </li>
            <li>
              <span className="font-bold text-white">Every figure says how much is counted.</span> A
              share is always of the booths counted so far, never of the whole country.
            </li>
            <li>
              <span className="font-bold text-white">Nothing is called early.</span> Under a quarter
              counted, a state reads “too early” however big the lead looks.
            </li>
            <li>
              <span className="font-bold text-white">Colour is never the only clue.</span> Two of
              these party colours look identical to one man in twelve, so every state carries its
              party&rsquo;s initials, one is drawn with stripes, and this table has no colour at all.
            </li>
          </ul>

          <p className="mt-5 border-t border-board-line pt-3 text-[0.6875rem] leading-relaxed text-white/40">
            {SOURCE}. Adding up the state rows gives{" "}
            <span className="figure">{DECLARED.rowSum.toLocaleString("en-NG")}</span> valid votes
            against INEC&rsquo;s declared{" "}
            <span className="figure">{DECLARED.validVotes.toLocaleString("en-NG")}</span>, a
            0.003% difference in the published source, which we have left as we found it rather
            than tidied away. Booth counts per state are worked out from the register. Boundaries:{" "}
            {board.attribution}, CC BY 4.0.
          </p>
        </div>
      </div>
    </div>
  );
}
