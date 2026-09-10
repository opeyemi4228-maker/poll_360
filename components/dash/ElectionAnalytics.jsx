"use client";

import { useCallback, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  LineChart,
} from "lucide-react";

import Executive from "./Executive";
import PartyStrength from "./PartyStrength";
import RulingParty from "./RulingParty";
import { PARTY_FILL } from "./Charts";
import PartyMark from "./PartyMark";
import Sparkline from "./Sparkline";
import { partyLogo } from "@/lib/party-register";
import { Columns, Gauge, MiniMap, Panel, Ranked, Readout, Split } from "./Figures";
import { CLASS_OF, CLASSES } from "@/lib/executive";
import {
  COMPETITIVE,
  TIMELINE,
  TRENDS,
  compare,
  partyRecord,
  span,
  stateTrends,
  turnoutByState,
  turnoutRecord,
} from "@/lib/record";
import { MAPPABLE } from "@/lib/behaviour";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Election Analytics: one dashboard, six questions.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY SEVEN TABS BECAME ONE
 *
 *  The analytics head held seven surfaces — the brief, party ground, the
 *  ruling party, clusters, trends, the projection, the sample — and they were
 *  seven answers to one question asked seven ways. Worse, they were seven
 *  *entry points*, so a person wanting to know how a state has behaved since
 *  1999 had to guess which of the seven the answer was on, and the guess was
 *  wrong about half the time.
 *
 *  One dashboard, six tabs, in the order the questions are actually asked:
 *
 *    Overview     where we stand, in twelve figures
 *    Geography    where, on a map, with the ground classified
 *    Turnout      who came out, and who stopped coming
 *    Candidates   the parties, their runs, and who holds what now
 *    Historical   any two elections held against each other
 *    Trends       what has been moving, and in which direction
 *
 *  Planning is deliberately NOT here. "Where should we focus" is a different
 *  job with a different reader and a different output — a plan somebody is
 *  going to be asked to pay for — and mixing it into analysis is how a
 *  finding becomes a commitment nobody costed. See StrategicPlanning.jsx.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 1999 TO THE LAST ELECTION HELD, AND THE JOIN BETWEEN THEM ──────────────
 * The record runs from the 1999 presidential to the Osun governorship of
 * August 2026, and it is two series rather than one: seven presidential
 * elections, and the off-cycle governorships that run underneath them on
 * their own cycle. Every screen here keeps them apart, because a presidential
 * share and a governorship share are two different offices on two different
 * ballots and subtracting one from the other produces a confident sentence
 * about a swing that never happened. See lib/record.js.
 */

/* ── GEOGRAPHY, TURNOUT AND TRENDS HAVE GONE ──────────────────────────────
   Removed on the room's own instruction. Two of the three were also the
   longest way round to something this product answers better elsewhere:
   turnout is a layer on the live map, where it drills, and the classified
   ground each campaign stands on is the strategic brief's own subject. What
   is left is the record — the count, the candidates, and what happened
   before — which is what somebody opens an analytics head to read. */
const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "candidates", label: "Candidates", icon: LineChart },
  { id: "historical", label: "Historical", icon: CalendarRange },
];

/** One hue getting darker, for the trend grades, which have an order. */
const TREND_FILL = {
  STRONGHOLD: "var(--color-ink-900)",
  GROWING: "var(--color-ink-700)",
  DECLINING: "var(--color-ink-400)",
  SWING: "var(--color-amber-500)",
  EMERGING: "var(--color-class-opportunity)",
};

export default function ElectionAnalytics({
  /* The brief and its assumptions, from `useBrief` — the same computation the
     map is coloured by, so the Overview and Geography tabs cannot disagree. */
  brief: briefState,
  slots = [],
  place = "Nigeria",
  shapes = null,
  territory = null,
  ground = null,
  /* Who governs each state, and how they got there — built in the room, which
     is the only place that reads lib/governors.js. */
  governing = null,
  onOpen,
  onGo,
  pathOf,
}) {
  const [tab, setTab] = useState(TABS[0].id);

  return (
    <div className="flex flex-col gap-3">
      {/* ── SIX TABS, NOT A DROPDOWN ───────────────────────────────────────
          Every one of these is somewhere a person arrives wanting to be, and
          a destination behind a menu is a destination that stops being used.
          The same argument the room's own tab bar makes one level up. */}
      <div
        role="tablist"
        aria-label="Election analytics"
        className="flex flex-wrap gap-1 rounded-dash border border-dash-line bg-dash-card p-1"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold whitespace-nowrap transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              <item.icon size={15} strokeWidth={2.25} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <Executive
          state={briefState}
          slots={slots}
          place={place}
          onOpen={onOpen}
          onGo={onGo}
          pathOf={pathOf}
        />
      )}

      {tab === "candidates" && (
        <Candidates shapes={shapes} territory={territory} ground={ground} governing={governing} />
      )}

      {tab === "historical" && <Historical shapes={shapes} />}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ candidates */

/**
 * The parties: their runs, and who holds what now.
 *
 * ── A PARTY WITH NO PRESIDENTIAL RUN HAS NO NATIONAL SHARE ─────────────────
 * Accord has held Osun since August 2026 and has never stood a presidential
 * candidate in this record. Drawing it at 0% would put it at the bottom of a
 * ranking as though it had contested and lost. It has a governorship and no
 * national share, and those are two different facts.
 */
function Candidates({ shapes, territory, ground, governing }) {
  const record = useMemo(() => partyRecord(), []);
  const contested = record.filter((party) => party.latest !== null);
  const seatsOnly = record.filter((party) => party.latest === null && party.governorships.length);
  const [half, setHalf] = useState("record");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Presidential share, most recent"
          figure={`${contested.length} parties`}
          foot="Share of the valid vote at the last presidential election."
        >
          <Split
            segments={contested.slice(0, 5).map((party) => ({
              id: party.id,
              label: party.id,
              value: Math.round(party.latest * 10),
              color: PARTY_FILL[party.id] ?? "var(--color-party-other)",
            }))}
          />
          <ul className="mt-4 space-y-0.5">
            {contested.slice(0, 6).map((party) => (
              <li key={party.id}>
                <Readout
                  label={party.name}
                  value={formatShare(party.latest)}
                  sub={
                    party.drift === null
                      ? `${party.elections} election${party.elections === 1 ? "" : "s"}`
                      : `${party.drift > 0 ? "+" : "−"}${formatShare(Math.abs(party.drift))} since ${party.run[0].year}`
                  }
                />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Governorships in the record"
          figure={`${TIMELINE.filter((row) => row.kind === "GOVERNORSHIP").length} contests`}
          foot="Off-cycle governorships, November 2023 to the most recent. Counted apart from the presidential shares beside them: different office, different ballot."
        >
          <ul className="space-y-0.5">
            {TIMELINE.filter((row) => row.kind === "GOVERNORSHIP")
              .slice()
              .reverse()
              .map((row) => (
                <li key={row.id}>
                  <Readout
                    label={`${row.place} ${row.year}`}
                    value={row.winner}
                    sub={row.candidate}
                  />
                </li>
              ))}
          </ul>

          {seatsOnly.length > 0 && (
            <p className="mt-3 border-t border-dash-line pt-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
              <strong className="text-dash-ink">
                {seatsOnly.map((party) => party.name).join(", ")}
              </strong>{" "}
              {seatsOnly.length === 1 ? "holds a state" : "hold states"} and has never stood a
              presidential candidate in this record, so {seatsOnly.length === 1 ? "it has" : "they have"}{" "}
              no national share — which is a different thing from a national share of nothing.
            </p>
          )}
        </Panel>
      </div>

      {/* The two big party surfaces, kept whole, behind a switch: one is a
          party's ground across the country, the other is who governs where. */}
      <div className="flex gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {[
          { id: "record", label: "One party's ground" },
          { id: "ruling", label: "Who governs now" },
        ].map((item) => {
          const active = half === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setHalf(item.id)}
              aria-pressed={active}
              className={cn(
                "flex-1 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {half === "record" ? (
        <PartyStrength shapes={shapes} territory={territory} ground={ground} />
      ) : governing ? (
        <RulingParty
          rows={governing.rows}
          shapes={shapes}
          fct={governing.fct}
          seats={governing.seats}
          moves={governing.moves}
        />
      ) : (
        <p className="rounded-dash border border-dash-line bg-dash-card px-4 py-8 text-center text-[0.875rem] text-dash-muted">
          Who governs each state is not loaded for this contest.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ historical */

/**
 * What twenty-seven years of results tell you to do tonight.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A RECORD IS NOT A DASHBOARD UNTIL IT ANSWERS "SO WHAT"
 *
 *  This screen used to open on a pair of dropdowns — pick two elections, see
 *  the swing between them. Every figure on it was correct and nobody could
 *  say what it was for, which is the most expensive kind of screen there is:
 *  it costs a tab, a click and a moment of confusion, and returns nothing.
 *
 *  The record is worth having because it answers three questions the live
 *  count cannot, and each of them changes what somebody does:
 *
 *    IS TONIGHT'S FIGURE NORMAL?   A state reporting 71% is a landslide or a
 *                                  Tuesday depending entirely on what that
 *                                  state has always done. The baseline is the
 *                                  only thing that tells them apart, and it is
 *                                  the single most useful column here.
 *
 *    WHERE IS THE ELECTION?        Most states are settled and will not move
 *                                  whatever anybody does. The handful that
 *                                  change hands are where a campaign is won,
 *                                  and the record is the only place that
 *                                  knows which those are.
 *
 *    WHICH WAY IS IT RUNNING?      A state lost once is an accident. A state
 *                                  whose margin has narrowed at every election
 *                                  is a trend, and the two need opposite
 *                                  responses.
 *
 *  So the screen leads with the answers and keeps the two-election comparison
 *  underneath as the tool it always was — genuinely useful, but only once you
 *  know which pair is worth looking at.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE MAP HAS TWO ENCODINGS AND NEITHER IS INVENTED ──────────────────────
 * "Who holds it" is the party colours, bound to the party and never to rank —
 * the encoding every other map in this product uses. "How contested" is one
 * hue getting darker, which is the rule for anything ordered.
 *
 * There is deliberately no third scale colouring the five trend classes in
 * five hues. Five categorical hues is the shape that failed a colour-vision
 * check elsewhere in this room — amber and orange separate by ΔE 1.6 for a
 * deuteranope — and the trends are named in type on every row anyway, which
 * is a stronger encoding than a hue nobody can name.
 */

/* One hue getting darker, for the one thing on this screen that is ordered. */
const CONTEST_FILLS = [
  "var(--color-ink-200)",
  "var(--color-ink-400)",
  "var(--color-ink-600)",
  "var(--color-ink-900)",
];

/**
 * The bands the map is shaded in, taken from the data rather than assumed.
 *
 * ── WHY THESE ARE NOT 40 / 25 / 10 ─────────────────────────────────────────
 * They were, and the render showed why that fails: across this record no state
 * is held on a margin under sixteen points, so the "knife edge" band was empty
 * and the darkest shade never appeared. A legend with a step nothing can reach
 * is a legend that teaches people the map is broken.
 *
 * Quartiles of the margins actually present always produce four populated
 * bands, whatever election is loaded, and the legend prints the real figures
 * so nobody has to guess what a shade means. The cost is that the shades are
 * relative — comparing two different records by colour alone is not valid —
 * which is why the figure is on every row of the table underneath.
 */
function contestBands(margins) {
  const sorted = [...margins].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const cuts = [at(0.25), at(0.5), at(0.75)];

  return [
    { from: cuts[2], fill: CONTEST_FILLS[0], label: `Safest quarter · ${Math.round(cuts[2])}%+` },
    { from: cuts[1], fill: CONTEST_FILLS[1], label: `${Math.round(cuts[1])}–${Math.round(cuts[2])}%` },
    { from: cuts[0], fill: CONTEST_FILLS[2], label: `${Math.round(cuts[0])}–${Math.round(cuts[1])}%` },
    { from: -Infinity, fill: CONTEST_FILLS[3], label: `Tightest quarter · under ${Math.round(cuts[0])}%` },
  ];
}

const LAYERS = [
  { id: "holder", label: "Who holds it" },
  { id: "contest", label: "How contested" },
  { id: "turnout", label: "Turnout normally" },
];

function Historical({ shapes }) {
  const trends = useMemo(() => stateTrends(), []);
  const turnout = useMemo(() => turnoutByState(), []);
  const cover = useMemo(() => span(), []);

  const [layer, setLayer] = useState("holder");
  const [only, setOnly] = useState("ALL");

  /* Turnout by state, keyed, so the baseline can sit on the same row as the
     trend without a second pass over 37 states on every render. */
  const baseline = useMemo(
    () => Object.fromEntries(turnout.map((row) => [row.code, row])),
    [turnout]
  );

  const counts = useMemo(() => {
    const out = { ALL: trends.length };
    for (const id of Object.keys(TRENDS)) {
      out[id] = trends.filter((row) => row.trend === id).length;
    }
    return out;
  }, [trends]);

  const shown = useMemo(
    () => (only === "ALL" ? trends : trends.filter((row) => row.trend === only)),
    [trends, only]
  );

  /* ── THE STATES THAT ARE ACTUALLY MOVING ────────────────────────────────
     Sorted by how far the margin has travelled since the previous election,
     in either direction. A settled state at the top of an alphabetical list
     is a row nobody needs; the state that moved eleven points is the whole
     point of keeping a record. */
  const moving = useMemo(
    () => [...shown].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)),
    [shown]
  );

  const bands = useMemo(() => contestBands(trends.map((row) => row.margin)), [trends]);
  /* Memoised because the fills below depend on it, and a function rebuilt on
     every render would rebuild all thirty-seven fills with it. */
  const contestFill = useCallback(
    (margin) => (bands.find((band) => margin >= band.from) ?? bands.at(-1))?.fill ?? CONTEST_FILLS[0],
    [bands]
  );

  const fills = useMemo(() => {
    const index = {};
    for (const row of shown) {
      index[row.code] =
        layer === "holder"
          ? (PARTY_FILL[row.holder] ?? PARTY_FILL.OTH)
          : layer === "contest"
            ? contestFill(row.margin)
            : /* Turnout, as one hue: darker is more of the register voting. */
              (baseline[row.code]?.turnout ?? 0) >= 40
              ? "var(--color-ink-900)"
              : (baseline[row.code]?.turnout ?? 0) >= 30
                ? "var(--color-ink-600)"
                : (baseline[row.code]?.turnout ?? 0) >= 20
                  ? "var(--color-ink-400)"
                  : "var(--color-ink-200)";
    }
    return index;
  }, [shown, layer, baseline, contestFill]);

  const notes = useMemo(() => {
    const index = {};
    for (const row of shown) {
      const turn = baseline[row.code];
      index[row.code] =
        layer === "turnout"
          ? `${turn ? formatShare(turn.turnout) : "—"} normally · ${formatNumber(turn?.stayedHome ?? 0)} stayed home`
          : `${row.holder} by ${formatShare(row.margin)} · ${TRENDS[row.trend].label}${
              row.changes ? ` · changed hands ${row.changes}×` : " · never changed hands"
            }`;
    }
    return index;
  }, [shown, layer, baseline]);

  /* ── THE THREE FINDINGS, AND WHY THEY ARE NOT THE TREND COUNTS ─────────
     The first version read "33 of 37 states decide it", by adding the Swing
     and Newly-taken buckets. That is true and useless: a headline naming
     nine states in ten is a headline nobody can act on.

     The classifier is not at fault — across this record twenty-two states
     have genuinely changed hands more than once, which is what makes them
     swing states. It is the wrong cut for a headline. These three are the
     ones that name a short list somebody can actually work: the states that
     keep changing hands, the ones losing ground now, and the ones no amount
     of spending will move. */
  const volatile_ = trends.filter((row) => row.changes >= 2);
  const slipping = trends.filter((row) => row.drift < -2);
  const locked = trends.filter((row) => row.changes === 0);


  return (
    <div className="flex flex-col gap-3">
      {/* ── WHAT THE RECORD SAYS, BEFORE ANY CONTROL ──────────────────────
          Three findings, each a figure and a sentence that names what to do
          with it. This is the panel that answers "what is this screen for". */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Finding
          figure={volatile_.length}
          of={trends.length}
          label="Keep changing hands"
          why={`Held by two or more parties across the record${
            volatile_.length ? `. Tightest: ${[...volatile_].sort((a, b) => a.margin - b.margin)[0].name}` : ""
          }.`}
          onGo={() => setOnly("SWING")}
        />
        <Finding
          figure={slipping.length}
          of={trends.length}
          label="Losing ground now"
          why="The holder's margin narrowed at the most recent election. A trend, not an accident."
          onGo={() => setOnly("DECLINING")}
          tone="warn"
        />
        <Finding
          figure={locked.length}
          of={trends.length}
          label="Never changed hands"
          why="One party throughout the record. Spending here buys the least."
          onGo={() => setOnly("STRONGHOLD")}
          tone="muted"
        />
      </div>

      {/* ── THE FILTERS, IN ONE ROW ABOVE WHAT THEY FILTER ────────────────*/}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip id="ALL" label="Every state" count={counts.ALL} active={only} onPick={setOnly} />
        {Object.values(TRENDS).map((trend) => (
          <Chip
            key={trend.id}
            id={trend.id}
            label={trend.label}
            count={counts[trend.id] ?? 0}
            title={trend.why}
            active={only}
            onPick={setOnly}
          />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        {/* ─────────────────────────────────────────────────────── the map */}
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-dash-line px-5 py-3">
            <div>
              <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                {cover.from}–{cover.to}, {shown.length} of {trends.length} states
              </h2>
              <p className="text-[0.75rem] text-dash-muted">
                {cover.elections} elections on record, ending with {cover.lastLabel}
              </p>
            </div>
            <div className="flex gap-1">
              {LAYERS.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setLayer(row.id)}
                  aria-pressed={layer === row.id}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[0.75rem] font-semibold transition-colors",
                    layer === row.id
                      ? "bg-dash-ink text-white"
                      : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
                  )}
                >
                  {row.label}
                </button>
              ))}
            </div>
          </header>

          {/* Big. This is the object of the screen, not a thumbnail beside a
              table — a 200-pixel Nigeria is one in which Bayelsa is a smudge
              and nobody can tell a thin state from a blank one. */}
          <div className="px-4 py-4">
            {shapes ? (
              <MiniMap shapes={shapes} fills={fills} notes={notes} height={460} />
            ) : (
              <p className="px-4 py-12 text-center text-[0.875rem] text-dash-muted">
                No map available.
              </p>
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dash-line px-5 py-3">
            {layer === "holder" ? (
              <p className="text-[0.75rem] text-dash-muted">
                Each state in the colour of the party holding it at {cover.lastLabel}. The colour
                follows the party, never its rank.
              </p>
            ) : layer === "contest" ? (
              bands.map((band) => (
                <span key={band.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-[2px]"
                    style={{ background: band.fill }}
                  />
                  <span className="text-[0.6875rem] text-dash-muted">{band.label}</span>
                </span>
              ))
            ) : (
              <p className="text-[0.75rem] text-dash-muted">
                What share of the register normally votes, darker for more. The yardstick a live
                turnout figure has to be read against.
              </p>
            )}
          </footer>
        </section>

        {/* ────────────────────────────────────────────── what is moving */}
        <div className="flex flex-col gap-3">
          <Panel
            title="Moving fastest"
            figure={`${moving.length}`}
            foot="How far the winner's margin travelled since the previous election. The record's most actionable column."
          >
            {moving.length === 0 ? (
              <p className="text-[0.875rem] text-dash-muted">No state in this group.</p>
            ) : (
              <ul className="space-y-2.5">
                {moving.slice(0, 10).map((row) => (
                  <li key={row.code}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <PartyMark id={row.holder} size={16} />
                        <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                          {row.name}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "figure shrink-0 text-[0.8125rem] font-bold tabular-nums",
                          row.drift > 0 ? "text-emerald-600" : row.drift < 0 ? "text-red-600" : "text-dash-muted"
                        )}
                      >
                        {row.drift > 0 ? "+" : row.drift < 0 ? "−" : ""}
                        {formatShare(Math.abs(row.drift))}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      {/* The state's whole run, so a one-off and a slide are
                          not the same picture. */}
                      <Sparkline values={row.run.map((step) => Math.max(0, step.margin))} />
                      <span className="text-[0.6875rem] text-dash-muted">
                        {TRENDS[row.trend].label}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Turnout to expect"
            figure={`${formatShare(
              turnout.reduce((sum, row) => sum + row.turnout, 0) / Math.max(1, turnout.length)
            )} median-ish`}
            foot="Against the current register in both years, so this compares votes cast rather than two true turnouts."
          >
            <Ranked
              rows={[...turnout]
                .sort((a, b) => b.turnout - a.turnout)
                .slice(0, 6)
                .map((row) => ({ id: row.code, label: row.name, value: Math.round(row.turnout) }))}
              showShare={false}
              empty="No register held."
            />
            <p className="mt-3 border-t border-dash-line pt-2.5 text-[0.75rem] text-dash-muted">
              A state reporting 71% tonight is a landslide or an ordinary evening depending on
              this column. It is the only thing that tells them apart.
            </p>
          </Panel>
        </div>
      </div>

      {/* ── EVERY STATE, WITH ITS BASELINE ────────────────────────────────
          The table the record exists to produce: who holds it, by how much,
          which way it is going, and what turnout to expect. Four columns a
          planner reads down before a night and checks against during one. */}
      <Panel title="The record, state by state" figure={`${shown.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-[0.8125rem]">
            <thead>
              <tr className="border-b border-dash-line text-left text-[0.625rem] tracking-[0.08em] text-dash-muted uppercase">
                <th className="pb-2 font-semibold">State</th>
                <th className="pb-2 font-semibold">Holder</th>
                <th className="pb-2 text-right font-semibold">Margin</th>
                <th className="pb-2 text-right font-semibold">Since last</th>
                <th className="pb-2 text-right font-semibold">Changed hands</th>
                <th className="pb-2 text-right font-semibold">Turnout</th>
                <th className="pb-2 font-semibold">Reads as</th>
              </tr>
            </thead>
            <tbody>
              {[...shown]
                .sort((a, b) => a.margin - b.margin)
                .map((row) => (
                  <tr key={row.code} className="border-b border-dash-line/60 last:border-0">
                    <td className="py-1.5 font-semibold text-dash-ink">{row.name}</td>
                    <td className="py-1.5">
                      <span className="flex items-center gap-1.5">
                        <PartyMark id={row.holder} size={16} />
                        {!partyLogo(row.holder) && (
                          <span className="figure font-semibold text-dash-ink">{row.holder}</span>
                        )}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "figure py-1.5 text-right font-bold tabular-nums",
                        row.margin < COMPETITIVE ? "text-red-600" : "text-dash-ink"
                      )}
                    >
                      {formatShare(row.margin)}
                    </td>
                    <td
                      className={cn(
                        "figure py-1.5 text-right tabular-nums",
                        row.drift > 0 ? "text-emerald-600" : row.drift < 0 ? "text-red-600" : "text-dash-muted"
                      )}
                    >
                      {row.drift > 0 ? "+" : row.drift < 0 ? "−" : ""}
                      {formatShare(Math.abs(row.drift))}
                    </td>
                    <td className="figure py-1.5 text-right text-dash-muted tabular-nums">
                      {row.changes === 0 ? "never" : `${row.changes}×`}
                    </td>
                    <td className="figure py-1.5 text-right text-dash-muted tabular-nums">
                      {baseline[row.code] ? formatShare(baseline[row.code].turnout) : "—"}
                    </td>
                    <td className="py-1.5 text-dash-muted" title={TRENDS[row.trend].why}>
                      {TRENDS[row.trend].label}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── THE TOOL, KEPT ────────────────────────────────────────────────
          Comparing two named elections is genuinely useful — once you know
          which pair is worth comparing, which is what everything above is
          for. It was the whole screen; it is now the last panel on it. */}
      <SwingTool shapes={shapes} cover={cover} />
    </div>
  );
}

/** One of the three findings the screen opens with. */
function Finding({ figure, of, label, why, onGo, tone = "ink" }) {
  return (
    <button
      type="button"
      onClick={onGo}
      className="rounded-dash border border-dash-line bg-dash-card p-4 text-left transition-colors hover:border-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
    >
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "figure text-[2rem] leading-none font-bold tracking-[-0.03em] tabular-nums",
            tone === "warn" ? "text-amber-700" : tone === "muted" ? "text-dash-muted" : "text-dash-ink"
          )}
        >
          {figure}
        </span>
        <span className="figure text-[0.875rem] text-dash-muted tabular-nums">of {of}</span>
      </span>
      <span className="mt-1 block text-[0.8125rem] font-bold text-dash-ink">{label}</span>
      <span className="mt-0.5 block text-[0.75rem] leading-snug text-dash-muted">{why}</span>
    </button>
  );
}

function Chip({ id, label, count, title, active, onPick }) {
  const on = active === id;
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={on}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold transition-colors",
        on
          ? "border-dash-ink bg-dash-ink text-white"
          : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
      )}
    >
      {label}
      <span className="figure tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/**
 * Any two elections, held against each other.
 *
 * ── WHY THE CHOOSER REFUSES SOME PAIRS ─────────────────────────────────────
 * Two of the seven presidential elections — 2007 and 2011 — have no published
 * by-state table, so they cannot appear in a per-state comparison at all. The
 * chooser says why rather than silently omitting them.
 *
 * And a governorship is never on either side. See lib/record.js.
 */
function SwingTool({ shapes, cover }) {
  const years = MAPPABLE.map((election) => election.year);
  const [from, setFrom] = useState(years[years.length - 2]);
  const [to, setTo] = useState(years[years.length - 1]);
  const [party, setParty] = useState("");
  const [open, setOpen] = useState(false);

  const seen = useMemo(() => compare(from, to, party || null), [from, to, party]);

  const fills = useMemo(() => {
    if (!seen.ok) return {};
    const index = {};
    for (const row of seen.rows) {
      index[row.code] =
        row.change >= 10
          ? "var(--color-class-stronghold)"
          : row.change >= 2
            ? "var(--color-ink-500)"
            : row.change <= -10
              ? "var(--color-class-weak)"
              : row.change <= -2
                ? "var(--color-class-opportunity)"
                : "var(--color-dash-line)";
    }
    return index;
  }, [seen]);

  const notes = useMemo(() => {
    if (!seen.ok) return {};
    return Object.fromEntries(
      seen.rows.map((row) => [
        row.code,
        `${formatShare(row.was.share)} → ${formatShare(row.now.share)} (${row.change > 0 ? "+" : "−"}${formatShare(Math.abs(row.change))})`,
      ])
    );
  }, [seen]);

  const parties = useMemo(() => {
    const seenIds = new Set();
    for (const election of MAPPABLE) {
      for (const row of election.rows) {
        for (const id of Object.keys(row.votes)) if (id !== "OTH") seenIds.add(id);
      }
    }
    return [...seenIds].sort();
  }, []);

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <span>
          <span className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Compare any two elections
          </span>
          <span className="mt-0.5 block text-[0.75rem] text-dash-muted">
            The swing between one year and another, state by state
          </span>
        </span>
        <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink">
          {open ? "Close" : "Open"}
        </span>
      </button>

      {open && (
        <div className="border-t border-dash-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Choose label="From" value={from} onChange={setFrom} options={years} />
            <Choose label="To" value={to} onChange={setTo} options={years} />
            <label className="flex items-center gap-2">
              <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Measuring
              </span>
              <select
                value={party}
                onChange={(event) => setParty(event.target.value)}
                className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
              >
                <option value="">the winner&rsquo;s share</option>
                {parties.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-2 text-[0.75rem] text-dash-muted">
            No by-state table is published for {cover.missingStateTables.join(" or ")}, so neither
            can appear here.
          </p>

          {!seen.ok ? (
            <p className="mt-3 rounded-dash border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-[0.875rem] leading-relaxed text-dash-ink">
              {seen.why}
            </p>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
              <div>
                <p className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                    {seen.from.year} to {seen.to.year}
                    {party ? `, ${party}` : ", the winner in each state"}
                  </span>
                  <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                    {seen.national.change > 0 ? "+" : "−"}
                    {formatShare(Math.abs(seen.national.change))} nationally
                  </span>
                </p>
                {shapes && <MiniMap shapes={shapes} fills={fills} notes={notes} height={360} />}
                <p className="mt-2 text-[0.75rem] leading-relaxed text-dash-muted">
                  Green is a gain of ten points or more, red a loss of ten or more; the pale states
                  moved by under two either way. The national figure is the sum of the votes over
                  the sum of the vote cast, never an average of the thirty-seven states — an
                  average weights Bayelsa like Kano.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Panel title="Biggest gains" figure={party || "winner"}>
                  <Ranked
                    rows={[...seen.rows]
                      .sort((a, b) => b.change - a.change)
                      .slice(0, 6)
                      .map((row) => ({
                        id: row.code,
                        label: row.name,
                        value: Math.round(row.change * 10) / 10,
                      }))}
                    showShare={false}
                    empty="Nothing moved."
                  />
                </Panel>
                <Panel title="Biggest losses" figure={party || "winner"}>
                  <Ranked
                    rows={[...seen.rows]
                      .sort((a, b) => a.change - b.change)
                      .slice(0, 6)
                      .map((row) => ({
                        id: row.code,
                        label: row.name,
                        value: Math.round(Math.abs(row.change) * 10) / 10,
                        tone: "alert",
                      }))}
                    showShare={false}
                    empty="Nothing moved."
                  />
                </Panel>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Choose({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
