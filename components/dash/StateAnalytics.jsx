"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  Landmark,
  Split,
  TrendingDown,
  Users,
  Vote,
} from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { states2023, allParties } from "@/lib/election2023";
import { GOVERNORS, crossedFloor, ruling, seatsBy } from "@/lib/governors";
import { NOT_LOADED, OFF_CYCLE } from "@/lib/offcycle";
import { ZONES } from "@/lib/zones";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Analytics for a contest fought in one state, or a handful.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE PRESIDENTIAL SCREEN WAS THE WRONG SCREEN, NOT A BADLY SCOPED ONE
 *
 *  Scoping the presidential projection to one state made every figure on it
 *  arithmetically correct and analytically worthless. It answered "how would
 *  the 2023 presidential result in Ekiti move under a national swing" — a
 *  question nobody planning an Ekiti governorship has ever asked.
 *
 *  A state election is not a small national election. It turns on things the
 *  federal contest does not have and does not measure:
 *
 *    Turnout collapses.   An off-cycle governorship draws a fraction of the
 *                         presidential vote. Every projection built off a
 *                         presidential baseline is therefore inflated from
 *                         the first line.
 *    Tickets split.       States elect a governor of one party and give the
 *                         presidency to another, routinely and deliberately.
 *                         The federal result is a poor predictor and the size
 *                         of the gap is itself the finding.
 *    Incumbency is local. Who holds the state, under whose party, and whether
 *                         they still sit under the party that elected them.
 *    The floor moves.     Governors defect between elections, in numbers, and
 *                         a party map drawn from election results alone is
 *                         wrong for a third of the country.
 *
 *  So this screen answers those, from data that is actually recorded, and it
 *  refuses to project a vote total it has no basis for.
 *
 * ── WHAT IT WILL NOT DO ────────────────────────────────────────────────────
 *  There are no past governorship vote totals in this product. Inventing them
 *  to fill a chart — even labelled — would put a fabricated number next to
 *  eight real ones on a screen a broadcast reads from. Where the figure does
 *  not exist, the panel says what is missing and what it would take to have
 *  it, which is worth more than a plausible shape.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function StateAnalytics({ scopeStates = [], title = null, raceLabel = "Governorship" }) {
  const rows = useMemo(() => {
    const held = new Map(ruling().map((row) => [row.code, row]));
    const zoneOf = {};
    for (const [zone, codes] of Object.entries(ZONES)) for (const code of codes) zoneOf[code] = zone;

    return scopeStates
      .map((code) => {
        const state = states2023.find((row) => row.code === code);
        if (!state) return null;

        const order = allParties
          .map((party, index) => ({ party, votes: state.votes[index] }))
          .sort((a, b) => b.votes - a.votes);

        const seat = held.get(code) ?? null;

        /* The last time this state elected a governor, as declared. Real
           totals with a source on them, not a projection of anything. */
        const last = OFF_CYCLE.find((row) => row.code === code) ?? null;
        const lastTotal = last
          ? Object.values(last.votes).reduce((sum, value) => sum + value, 0)
          : 0;
        const gap = NOT_LOADED.find((row) => row.code === code) ?? null;

        return {
          last,
          lastTotal,
          lastTurnout: last ? (lastTotal / state.registered) * 100 : null,
          /* ── TWO RECORDS OF THE SAME EVENT, CHECKED AGAINST EACH OTHER ──
             The governors table and the off-cycle results table both carry
             the date a state last elected a governor, and they were written
             from different sources at different times. Where they disagree,
             at least one is wrong, and a screen that silently prefers one is
             a screen that will brief a room on a date nobody has checked.

             This product's whole premise is holding two independently sourced
             numbers against each other rather than averaging them, and there
             is no reason its own data should be exempt from that. */
          dateConflict:
            seat && (last?.votesOn ?? gap?.votesOn) && seat.votedOn !== (last?.votesOn ?? gap?.votesOn)
              ? { governors: seat.votedOn, results: last?.votesOn ?? gap?.votesOn }
              : null,
          /* The figure that matters, and the one I had guessed at: how the
             governorship vote compared with the presidential in this state. */
          versusPresidential: last && state.total ? (lastTotal / state.total) * 100 : null,
          gap,
          code,
          name: state.name,
          zone: zoneOf[code] ?? "Unzoned",
          registered: state.registered,
          booths: state.booths,
          presidentialVotes: state.total,
          presidentialTurnout: state.turnout,
          /* Who the state gave the presidency to, which is a different
             question from who governs it. */
          federal: order[0].party.id,
          federalShare: (order[0].votes / (state.total || 1)) * 100,
          runnerUp: order[1].party.id,
          federalMargin: ((order[0].votes - order[1].votes) / (state.total || 1)) * 100,
          seat,
        };
      })
      .filter(Boolean);
  }, [scopeStates]);

  const floor = useMemo(() => crossedFloor(), []);
  const seats = useMemo(() => seatsBy("current"), []);
  const elected = useMemo(() => seatsBy("elected"), []);

  if (!rows.length) {
    return (
      <p className="rounded-dash border border-dash-line bg-dash-card px-4 py-6 text-[0.875rem] text-dash-muted">
        This project has no states set, so there is nothing to analyse yet. Set the states this
        election is fought in and this screen fills itself.
      </p>
    );
  }

  const one = rows.length === 1 ? rows[0] : null;

  return (
    <div className="space-y-4">
      {/* ───────────────────────────────────────────────── who holds it now */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <Head
          icon={Landmark}
          title={one ? `Who holds ${one.name}` : "Who holds these states"}
          foot={`${raceLabel}${title ? ` · ${title}` : ""}`}
        />

        <div className="divide-y divide-dash-line">
          {rows.map((row) => (
            <div key={row.code} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5">
              <div className="min-w-40">
                <p className="text-[0.9375rem] font-bold text-dash-ink">{row.name}</p>
                <p className="text-[0.75rem] text-dash-muted">{row.zone}</p>
              </div>

              {row.seat ? (
                <>
                  <div className="min-w-48">
                    <Label>Governor</Label>
                    <p className="text-[0.875rem] font-semibold text-dash-ink">
                      {row.seat.governor}
                    </p>
                  </div>

                  <div>
                    <Label>Elected under</Label>
                    <Chip party={row.seat.elected} />
                  </div>

                  {/* ── THE MOVE, WHERE THERE WAS ONE ────────────────────────
                      A party map drawn from election results alone is simply
                      wrong for any state whose governor has crossed the floor,
                      and it is wrong in the direction that flatters whoever is
                      in power federally. Both answers, always, with the date. */}
                  {row.seat.moved ? (
                    <div className="flex items-center gap-2">
                      <ArrowRight size={14} className="shrink-0 text-dash-muted" />
                      <div>
                        <Label>Sits under</Label>
                        <Chip party={row.seat.current} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>Sits under</Label>
                      <p className="text-[0.8125rem] text-dash-muted">Unchanged</p>
                    </div>
                  )}

                  <div className="ml-auto text-right">
                    <Label>Last voted</Label>
                    <p className="figure text-[0.8125rem] font-semibold text-dash-ink tabular-nums">
                      {new Date(row.seat.votedOn).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-[0.8125rem] text-dash-muted">
                  No governor on record for this state.
                </p>
              )}
            </div>
          ))}
        </div>

        {rows.some((row) => row.seat?.moved) && (
          <div className="border-t border-dash-line bg-amber-50 px-4 py-3">
            {rows
              .filter((row) => row.seat?.moved)
              .map((row) => (
                <p key={row.code} className="text-[0.8125rem] leading-relaxed text-amber-900">
                  <span className="font-bold">
                    {row.name}: {row.seat.governor} crossed to {row.seat.current}
                  </span>{" "}
                  on{" "}
                  {new Date(row.seat.moved.on).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                  . {row.seat.moved.note}{" "}
                  <span className="text-amber-700">({row.seat.moved.source})</span>
                </p>
              ))}
          </div>
        )}
      </section>

      {/* ──────────────────────────────────────── the split ticket, measured */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <Head
          icon={Split}
          title="Federal and state do not agree"
          foot="Who the state gave the presidency to, against who governs it"
        />

        <div className="divide-y divide-dash-line">
          {rows.map((row) => {
            const split = row.seat && row.seat.elected !== row.federal;
            return (
              <div key={row.code} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <p className="min-w-32 text-[0.9375rem] font-bold text-dash-ink">{row.name}</p>

                  <div>
                    <Label>President, 2023</Label>
                    <span className="flex items-center gap-2">
                      <Chip party={row.federal} />
                      <span className="figure text-[0.8125rem] text-dash-muted tabular-nums">
                        {formatShare(row.federalShare)} over {row.runnerUp}
                      </span>
                    </span>
                  </div>

                  <div>
                    <Label>Governor</Label>
                    <Chip party={row.seat?.elected ?? "—"} />
                  </div>

                  <span
                    className={cn(
                      "ml-auto rounded-full px-3 py-1 text-[0.6875rem] font-bold uppercase",
                      split ? "bg-amber-100 text-amber-900" : "bg-dash-bg text-dash-muted"
                    )}
                  >
                    {split ? "Split ticket" : "Same party"}
                  </span>
                </div>

                {split && (
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-muted">
                    {row.name} gave the presidency to {row.federal} and the government house to{" "}
                    {row.seat.elected}. A federal result is a weak predictor here, and planning that
                    treats {row.federal}&rsquo;s {formatShare(row.federalShare)} as a floor for this
                    contest is planning on the wrong election.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ──────────────────────────────────── the last time it elected one */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <Head
          icon={Vote}
          title="The last governorship, as declared"
          foot="The only real baseline for this contest"
        />

        <div className="divide-y divide-dash-line">
          {rows.map((row) => (
            <div key={row.code} className="px-4 py-4">
              {row.dateConflict && (
                <p className="mb-3 flex gap-2.5 rounded-dash-sm border border-red-200 bg-red-50 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-dash-ink">
                  <AlertTriangle size={15} strokeWidth={2.5} className="mt-px shrink-0 text-red-600" />
                  <span>
                    <span className="font-bold">Our own two records of {row.name} disagree.</span>{" "}
                    The governors table has it voting on{" "}
                    {new Date(row.dateConflict.governors).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                    ; the results table has{" "}
                    {new Date(row.dateConflict.results).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                    . One of them is wrong. Neither is preferred here, because picking one would
                    hide the fact that nobody has checked. Resolve it against the declaration
                    before this state is briefed on.
                  </span>
                </p>
              )}

              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-[0.9375rem] font-bold text-dash-ink">{row.name}</p>
                {row.last ? (
                  <>
                    <span className="figure text-[0.75rem] text-dash-muted tabular-nums">
                      {new Date(row.last.votesOn).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                    {row.last.unverified && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-amber-900 uppercase">
                        Totals unverified
                      </span>
                    )}
                  </>
                ) : null}
              </div>

              {row.last ? (
                <>
                  <p className="mt-1 text-[0.8125rem] text-dash-muted">
                    Won by {row.last.candidate} for {row.last.winner}
                  </p>

                  <ul className="mt-3 space-y-2">
                    {Object.entries(row.last.votes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([party, votes]) => (
                        <li key={party}>
                          <div className="flex items-baseline justify-between gap-2">
                            <Chip party={party} small />
                            <span className="figure text-[0.75rem] text-dash-muted tabular-nums">
                              {formatNumber(votes)} · {formatShare((votes / row.lastTotal) * 100)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-dash-bg">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(votes / row.lastTotal) * 100}%`,
                                background: PARTY_FILL[party] ?? "var(--color-dash-muted)",
                              }}
                            />
                          </div>
                        </li>
                      ))}
                  </ul>

                  <div className="mt-3 grid gap-px overflow-hidden rounded-dash-sm border border-dash-line bg-dash-line sm:grid-cols-3">
                    <Figure
                      icon={Vote}
                      label="Votes cast"
                      value={formatNumber(row.lastTotal)}
                      foot="Governorship, declared"
                    />
                    <Figure
                      icon={Users}
                      label="Turnout"
                      value={formatShare(row.lastTurnout)}
                      foot={`of ${formatNumber(row.registered)} registered`}
                    />
                    <Figure
                      icon={Split}
                      label="Against the presidential"
                      value={`${Math.round(row.versusPresidential)}%`}
                      foot={`Presidential drew ${formatNumber(row.presidentialVotes)}`}
                    />
                  </div>

                  {/* ── THE FINDING I HAD ASSUMED THE OPPOSITE OF ──────────
                      An earlier version of this panel asserted that off-cycle
                      turnout is "consistently and substantially lower" than
                      the presidential. That is the received wisdom and this
                      product holds the figures to check it, which is the
                      whole point of the product: in Kogi, Imo and Bayelsa the
                      governorship declared *more* votes than the presidential
                      did in the same state, by half again and more.

                      Whatever explains it, a room planning on the assumption
                      that fewer people turn out for a governorship would be
                      planning against its own state's record. So the figure
                      is computed and shown rather than generalised, and where
                      it runs the other way it is called out. */}
                  {row.versusPresidential > 105 && (
                    <p className="mt-3 flex gap-2.5 rounded-dash-sm border border-amber-200 bg-amber-50 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-amber-900">
                      <AlertTriangle size={15} strokeWidth={2.5} className="mt-px shrink-0 text-amber-700" />
                      <span>
                        <span className="font-bold">
                          The governorship declared more votes than the presidential here
                        </span>{" "}
                        — {formatNumber(row.lastTotal)} against {formatNumber(row.presidentialVotes)},{" "}
                        {Math.round(row.versusPresidential - 100)}% higher — in a state election held
                        on its own day. Plan on this state&rsquo;s own record rather than on the
                        assumption that an off-cycle contest draws fewer people.
                      </span>
                    </p>
                  )}

                  <p className="mt-2 text-[0.6875rem] text-dash-muted">{row.last.source}</p>
                </>
              ) : (
                /* ── A KNOWN GAP, NAMED ────────────────────────────────────
                   The absence is recorded in the data rather than left to be
                   noticed. A screen that silently omits the last contest is
                   how a room briefs on a state without realising the baseline
                   under everything they are looking at is missing. */
                <p className="mt-2 flex gap-2.5 rounded-dash-sm border border-dash-line bg-dash-bg px-3 py-2.5 text-[0.8125rem] leading-relaxed text-dash-ink">
                  <AlertTriangle size={15} strokeWidth={2.5} className="mt-px shrink-0 text-dash-muted" />
                  <span>
                    <span className="font-bold">No governorship result loaded for {row.name}.</span>{" "}
                    {row.gap
                      ? `It voted on ${new Date(row.gap.votesOn).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })}. ${row.gap.why}`
                      : "This state is not in the off-cycle set."}{" "}
                    Every figure on this screen therefore rests on the presidential result and on
                    who holds the seat, and there is no state-contest baseline under it until that
                    declaration is loaded.
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ────────────────────────────────────────────── the ground to cover */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <Head
          icon={Users}
          title="The ground"
          foot="What has to be covered, whatever the turnout turns out to be"
        />

        <div className="grid gap-px bg-dash-line sm:grid-cols-2 xl:grid-cols-4">
          <Figure
            icon={Users}
            label="On the register"
            value={formatNumber(rows.reduce((sum, row) => sum + row.registered, 0))}
            foot={one ? one.name : `${rows.length} states`}
          />
          <Figure
            icon={Building2}
            label="Polling units"
            value={formatNumber(rows.reduce((sum, row) => sum + row.booths, 0))}
            foot="Every one needs an agent"
          />
          <Figure
            icon={Vote}
            label="Voters per unit"
            value={formatNumber(
              Math.round(
                rows.reduce((sum, row) => sum + row.registered, 0) /
                  Math.max(1, rows.reduce((sum, row) => sum + row.booths, 0))
              )
            )}
            foot="Queue length, and count speed"
          />
          <Figure
            icon={TrendingDown}
            label="Never voted"
            value={formatNumber(
              rows.reduce(
                (sum, row) => sum + (row.registered - Math.max(row.presidentialVotes, row.lastTotal ?? 0)),
                0
              )
            )}
            foot="Beyond the best turnout on record here"
          />
        </div>
      </section>

      {/* ─────────────────────────────────────────── the wider ground moving */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <Head
          icon={CalendarDays}
          title="What is moving nationally"
          foot="Governors who changed party without an election"
        />

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
              {floor.length} of the {GOVERNORS.length} states have a governor sitting under a
              different party from the one that elected them. That is the single largest factor
              acting on state politics right now, it happened between elections rather than at one,
              and no results map shows it.
            </p>

            <ul className="mt-3 space-y-1.5">
              {floor.map((row) => (
                <li key={row.code} className="flex items-center gap-2 text-[0.8125rem]">
                  <span className="min-w-24 font-semibold text-dash-ink">{row.state}</span>
                  <Chip party={row.elected} small />
                  <ArrowRight size={12} className="text-dash-muted" />
                  <Chip party={row.current} small />
                  <span className="ml-auto figure text-[0.6875rem] text-dash-muted tabular-nums">
                    {new Date(row.moved.on).toLocaleDateString("en-NG", {
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Label>States held, as elected against as they sit</Label>
            <ul className="mt-2 space-y-2.5">
              {seats.map((row) => {
                const before = elected.find((item) => item.party === row.party)?.seats ?? 0;
                const change = row.seats - before;
                return (
                  <li key={row.party}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="figure text-[0.8125rem] font-bold text-dash-ink">
                        {row.party}
                      </span>
                      <span className="figure text-[0.8125rem] text-dash-muted tabular-nums">
                        {row.seats}
                        {change !== 0 && (
                          <span className={change > 0 ? "text-emerald-700" : "text-red-600"}>
                            {" "}
                            {change > 0 ? "+" : ""}
                            {change}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-dash-bg">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(row.seats / GOVERNORS.length) * 100}%`,
                          background: PARTY_FILL[row.party] ?? "var(--color-dash-muted)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          Defections are political events reported in the press, not matters of record. Every move
          listed carries its date and its source, and anything only rumoured is excluded rather than
          coloured in. Verify before broadcast.
        </p>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Head({ icon: Icon, title, foot }) {
  return (
    <header className="flex items-center gap-2.5 border-b border-dash-line px-4 py-3">
      <Icon size={17} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
      <div className="min-w-0">
        <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">{title}</h2>
        <p className="text-[0.75rem] text-dash-muted">{foot}</p>
      </div>
    </header>
  );
}

const Label = ({ children }) => (
  <p className="text-[0.5625rem] font-semibold tracking-[0.14em] text-dash-muted uppercase">
    {children}
  </p>
);

function Chip({ party, small }) {
  return (
    <span
      className={cn(
        "figure inline-flex items-center gap-1.5 rounded-full font-bold text-dash-ink",
        small ? "text-[0.6875rem]" : "text-[0.875rem]"
      )}
    >
      <span
        aria-hidden="true"
        className={cn("shrink-0 rounded-full", small ? "size-2" : "size-2.5")}
        style={{ background: PARTY_FILL[party] ?? "var(--color-dash-muted)" }}
      />
      {party}
    </span>
  );
}

function Figure({ icon: Icon, label, value, foot }) {
  return (
    <div className="bg-dash-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={13} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
        <Label>{label}</Label>
      </div>
      <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
        {value}
      </p>
      <p className="mt-1 truncate text-[0.6875rem] text-dash-muted">{foot}</p>
    </div>
  );
}
