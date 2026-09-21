"use client";

import { useState } from "react";
import { Target } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import PartyMark from "./PartyMark";
import { partyById, partyLogo } from "@/lib/party-register";
import { STATES_REQUIRED } from "@/lib/spread";
import { partyFill } from "@/lib/party-pattern";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The command dashboard: the room's front door, from the principal's side.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT IS THE RESULTS SCREEN'S SKELETON, ANSWERING A DIFFERENT QUESTION
 *
 *  Results is the best-composed screen in this room — a strip of figures, one
 *  large map that drills, and a single narrow column beside it — and the
 *  reason it works is that it has exactly one subject per region and nothing
 *  competing for the eye. Command borrows that skeleton deliberately. A room
 *  that has learnt where to look on one tab should not have to learn again on
 *  the next; changing the layout between two tabs a person alternates between
 *  every few minutes spends their attention on navigation instead of on the
 *  count.
 *
 *  What changes is the subject. Results answers "who is winning". Command
 *  answers "are *we* winning", which is a different question with a different
 *  answer, and the gap between them is written into section 134 — see
 *  lib/spread.js.
 *
 *  ── TWO SLOTS, BECAUSE THE FRAME OWNS THE MIDDLE ────────────────────────
 *  The map is the room's own, drilling state → local government → ward →
 *  polling unit, and it is drawn by the frame rather than by this file. So
 *  this file exports the two pieces that go around it:
 *
 *    CommandBrief    the narrow column beside the map — who we are, and
 *                    where every party on the paper stands
 *    CommandLedger   the full-width band under it — what has just landed,
 *                    what would have to change, and every state
 *
 *  Splitting them is what keeps the map big. An earlier version rendered one
 *  tall block above the frame and pushed the map off the bottom of the
 *  screen, which is the opposite of what a wall display is for.
 *
 *  ── AND THE FIGURES ARE NEVER THE REPLAY'S ──────────────────────────────
 *  Everything here is built on the server from the live count — see
 *  `commandBoard` in app/room/page.jsx. Fed the 2023 replay this screen would
 *  report a real campaign's share of somebody else's election, beside a real
 *  person's photograph. It reads zero instead, and says why.
 * ══════════════════════════════════════════════════════════════════════════
 */


/**
 * The screen saying it has nothing, and why.
 *
 * ── A CLEAN SLATE AND A BROKEN PAGE LOOK IDENTICAL ─────────────────────────
 * A wall of zeroes at six in the morning is read as a fault in the software
 * about as often as it is read as a quiet night, and the reader who guesses
 * wrong either rings an engineer or trusts a count that is not running. So the
 * screen says which it is, in one sentence, above the zeroes it is explaining.
 *
 * It is deliberately not an empty state that hides the screen. The tiles, the
 * map and the tables stay exactly where they will be when returns arrive, so
 * a room learns the layout before the night rather than during it.
 */
function Awaiting({ principal }) {
  return (
    <section className="rounded-dash border-l-4 border-l-flag-500 bg-flag-50 px-4 py-3">
      <p className="text-[0.8125rem] leading-snug font-bold text-flag-900">
        No transmission connected
      </p>
      <p className="mt-1 text-[0.75rem] leading-relaxed text-flag-800">
        Every figure on this screen is {principal.party}&rsquo;s own count, and nothing is coming in
        yet. The zeroes are real: this is the shape of the screen, waiting.
      </p>
    </section>
  );
}

/**
 * Where the figures on this screen came from.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A BOARD BUILT FROM TWO SOURCES HAS TO SAY SO
 *
 *  This screen now counts returns filed into this product *and* returns Data
 *  Bank holds for booths this product never heard from. That is strictly more
 *  of the count than it had before, and it is also a claim somebody will have
 *  to defend: the first question anybody asks about a total that moved is
 *  where the new figures came from.
 *
 *  It is the same discipline this product applies to coverage. A leader on 4%
 *  of booths is not a leader, and a total whose provenance is unstated is a
 *  total nobody can check. So the split is printed, always, in one line.
 *
 *  ── AND THE REFUSALS ARE PRINTED TOO ────────────────────────────────────
 *  The interesting number is not what was added, it is what was not. A
 *  machine's reading of a photograph is not a vote; a figure the hub's own
 *  arithmetic calls impossible is not a vote; and a booth we already hold is
 *  not counted a second time. Each of those is a decision this screen made on
 *  the reader's behalf, and a decision made silently is one nobody can
 *  disagree with. See lib/hub-returns.js.
 * ══════════════════════════════════════════════════════════════════════════
 */
function Sources({ sources }) {
  if (!sources) return null;

  const { ours = 0, hub = 0, duplicate = 0, readings = 0, impossible = 0, hubAvailable } = sources;

  /* Nothing has been filed anywhere. The empty board already says so in large
     type above; a provenance line under it would be explaining a blank. */
  if (!ours && !hub) return null;

  const held = [
    readings ? `${formatNumber(readings)} machine reading${readings === 1 ? "" : "s"}` : null,
    impossible ? `${formatNumber(impossible)} the hub calls impossible` : null,
  ].filter(Boolean);

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card px-4 py-3">
      <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
        Where these figures came from
      </p>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-dash-ink">
        <span className="figure font-bold tabular-nums">{formatNumber(ours)}</span> filed into this
        product
        {hub > 0 ? (
          <>
            {" "}
            and{" "}
            <span className="figure font-bold tabular-nums">{formatNumber(hub)}</span> more that
            reached Data Bank from booths this product never heard from.
          </>
        ) : hubAvailable ? (
          <>. Data Bank holds nothing this product has not already counted.</>
        ) : (
          <>. Data Bank is not connected, so any return that reached it alone is not on this board.</>
        )}
      </p>
      {(duplicate > 0 || held.length > 0) && (
        <p className="mt-1 text-[0.75rem] leading-relaxed text-dash-muted">
          {duplicate > 0 && (
            <>
              <span className="figure tabular-nums">{formatNumber(duplicate)}</span> of the hub&rsquo;s
              rows are copies of returns already counted here and were not counted again
              {held.length ? "; " : "."}
            </>
          )}
          {held.length > 0 && <>not counted: {held.join(", ")}.</>}
        </p>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════ the narrow column */

export function CommandBrief({
  principal,
  spread,
  benchmark = null,
  standings = [],
  ballot = [],
  total = 0,
  margin = 0,
  isDemoProject = false,
  /* The feed is switched off at the source — see app/room/page.jsx. */
  awaiting = false,
  /* What this board was built from: our own returns, the ones added from Data
     Bank, and what the hub sent that was deliberately not counted. */
  sources = null,
  className,
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* First, because it governs how every figure under it should be read. */}
      {awaiting && <Awaiting principal={principal} />}
      {!awaiting && <Sources sources={sources} />}
      {/* ── WHOSE ROOM THIS IS ──────────────────────────────────────────
          First, and permanent. Every figure on this screen is computed for
          this party; a screen reporting "38.2%" without saying whose is a
          screen somebody will one day read as the leader's. */}
      <section className="rounded-dash border border-dash-line bg-dash-card p-5">
        <div className="flex items-center gap-4">
          <Portrait principal={principal} />
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
              {principal.room}
            </p>
            <p className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em] text-dash-ink">
              {principal.candidate}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[0.8125rem] text-dash-muted">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: principal.token }}
                hidden={Boolean(partyLogo(principal.party))}
              />
              {/* Whose dashboard this is. The mark stands in for the swatch as
                  well as the code where there is a logo: an emblem beside a
                  dot of the same party's colour is the same fact twice. */}
              {partyLogo(principal.party) ? (
                <PartyMark id={principal.party} size={20} title={false} />
              ) : (
                <span className="figure font-bold text-dash-ink">{principal.party}</span>
              )}
              <span className="truncate">{principal.partyName}</span>
            </p>
          </div>
        </div>

        {/* ── THE ONE FIGURE THAT DECIDES IT, UNDER THE NAME ────────────
            The share and the states are already on the strip at the top of
            the room, so they are not repeated as tiles. What is not up there
            is the *distance*: how far our share is from the share that won
            last time, and how many states are still needed. Both are drawn
            rather than stated, because a position is read faster than a
            subtraction. */}
        {spread && (
          <div className="mt-5 space-y-4 border-t border-dash-line pt-4">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  Our share
                </span>
                <span className="figure text-[0.875rem] font-bold text-dash-ink">
                  {formatShare(spread.share)}
                </span>
              </div>
              <div className="relative mt-2 h-1.5 w-full rounded-full bg-dash-bg">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, spread.share)}%`,
                    background: principal.token,
                  }}
                />
                {benchmark != null && (
                  <span
                    className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-dash-ink"
                    style={{ left: `${Math.min(100, benchmark)}%` }}
                    title={`${formatShare(benchmark)} won the last presidential election`}
                  />
                )}
              </div>
              {benchmark != null && (
                <p className="mt-1.5 text-[0.75rem] text-dash-muted">
                  {formatShare(benchmark)} won in 2023
                  {spread.share >= benchmark ? " — we are past it" : ""}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  <Target size={12} strokeWidth={2.5} />
                  States at a quarter
                </span>
                <span className="figure text-[0.875rem] font-bold text-dash-ink">
                  {spread.quarterStates}
                  <span className="text-dash-muted"> / {STATES_REQUIRED}</span>
                </span>
              </div>
              {/* Ticks, not a bar: the unit is a state, and twenty-four
                  discrete things drawn as a continuous fill invites reading a
                  half-state. */}
              <div className="mt-2 flex gap-[2px]" aria-hidden="true">
                {Array.from({ length: STATES_REQUIRED }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 flex-1 rounded-[1px]",
                      index < spread.quarterStates
                        ? spread.clearsSpread
                          ? "bg-ok-600"
                          : "bg-dash-ink"
                        : "bg-dash-line"
                    )}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[0.75rem] text-dash-muted">
                {spread.clearsSpread
                  ? "Clears the spread test."
                  : `${spread.statesShort} more needed · ${spread.statesWon} state${
                      spread.statesWon === 1 ? "" : "s"
                    } led outright`}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── EVERY PARTY ON THE PAPER, BY NAME, FROM THE FIRST BOOTH ─────
          Built from the ballot rather than from whoever has votes. Filtered
          on votes it is empty before the first booth lands — so the one party
          a campaign's dashboard must never hide, its own, was the one missing
          — and afterwards it grows and reorders under the reader's eye. Our
          own row is marked rather than moved: a list that promotes us would
          be a list nobody outside the room could trust. */}
      <Parties
        principal={principal}
        standings={standings}
        ballot={ballot}
        total={total}
        margin={margin}
      />

      {/* Only where the feed is on: with it off, `Awaiting` above has already
          said the stronger and more specific version of this, and two notices
          explaining the same zeroes is one notice nobody reads. */}
      {isDemoProject && !awaiting && (
        <p className="rounded-dash border border-dash-line bg-dash-bg px-4 py-3 text-[0.75rem] leading-relaxed text-dash-muted">
          The open project is a <span className="font-semibold text-dash-ink">demonstration</span>.
          Every figure here is {principal.party}&rsquo;s own live count, which has not started. The
          2023 replay is on <span className="font-semibold text-dash-ink">Results</span>.
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ the parties */

function Parties({ principal, standings, ballot, total, margin }) {
  const votesOf = new Map(standings.map((row) => [row.id, row.votes ?? 0]));
  const nameOfParty = new Map(
    (ballot.length ? ballot : standings).map((party) => [party.id, party.name])
  );

  /* ── THREE NAMED, THE REST SUMMED ────────────────────────────────────────
     The paper carries eighteen parties and this panel showed all of them.
     Fifteen were zero all night, and the three that decide the election were
     ranked down among them — a spreadsheet where a room needed a scoreboard.

     Which three is configuration, not a judgement made here: the principal
     plus the named opposition, from lib/principal.js. Everything else is
     summed into one honest line that says how many parties it stands for.

     This folds nothing away from the count. Every party keeps its box on the
     filing form, its column in an export and its own figure in the state
     table below. It is folded out of one ranked list on one screen, which is
     a presentation decision and is reversible by one environment variable. */
  const headline = principal.headline ?? [principal.party];

  const named = headline
    .map((id) => ({
      id,
      /* ── A NAME, AND NOT THE CODE A SECOND TIME ────────────────────────
         The ballot's own entry is preferred, because a board carries what was
         actually on that paper. Where it has no name the register is asked,
         which knows every party this product can name — without it the row
         read "ADC  Us  ADC", the code printed twice with a badge between. The
         id is the last resort and now genuinely is one. */
      name: nameOfParty.get(id) || partyById(id)?.name || id,
      votes: votesOf.get(id) ?? 0,
    }))
    .sort((a, b) => b.votes - a.votes);

  /* The remainder, by subtraction from the total rather than by adding up the
     tail: the total already includes the `others` bucket, and a sum of named
     rows would quietly drop it. Anything the arithmetic cannot account for
     belongs here rather than nowhere. */
  const namedVotes = named.reduce((sum, row) => sum + row.votes, 0);
  /* ── Math.max(0, NaN) IS NaN ──────────────────────────────────────────
     It does not clamp, so a single bad figure upstream used to arrive here
     and leave as one. The root cause is fixed in lib/tally.js, and this stays
     because a dashboard is the wrong place to discover arithmetic: one number
     going wrong should cost one row, never the whole screen. */
  const restVotes = Number.isFinite(total - namedVotes)
    ? Math.max(0, total - namedVotes)
    : 0;
  const restCount = Math.max(
    0,
    (ballot.length ? ballot : standings).filter((party) => !headline.includes(party.id)).length
  );

  const rows = restCount > 0
    ? [...named, { id: "OTH", name: `${formatNumber(restCount)} other ${restCount === 1 ? "party" : "parties"}`, votes: restVotes, rest: true }]
    : named;

  const top = Math.max(...rows.map((row) => (Number.isFinite(row.votes) ? row.votes : 0)), 1);

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
          Votes counted
        </h3>
        <p className="figure text-[0.875rem] font-bold text-dash-ink">
          {Number.isFinite(total) ? formatNumber(total) : "—"}
        </p>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => {
          const ours = row.id === principal.party;
          return (
            <li key={row.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2">
                  {/* ── THE PARTY'S OWN MARK ────────────────────────────────
                      A party with a logo file is named by it and the code is
                      dropped: the emblem is what a reader recognises, and
                      "APC" beside the APC broom is the same word twice. A
                      party with no file keeps its code, because a colour
                      alone names nothing. The slot is one size either way, so
                      the shares stay in a column — see PartyMark. */}
                  <PartyMark id={row.id} size={22} title={Boolean(partyLogo(row.id))} />
                  {!partyLogo(row.id) && (
                    <span className="figure text-[0.875rem] font-bold text-dash-ink">
                      {row.id}
                    </span>
                  )}
                  {/* Ours is marked, never moved. A badge says "this is you"
                      without touching the ordering the figures earned. */}
                  {ours && (
                    <span className="shrink-0 rounded-dash-sm bg-dash-ink px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] text-white uppercase">
                      Us
                    </span>
                  )}
                  <span className="truncate text-[0.75rem] text-dash-muted">{row.name}</span>
                </p>
                <p className="figure shrink-0 text-[0.875rem] font-bold text-dash-ink tabular-nums">
                  {total && Number.isFinite(row.votes)
                    ? formatShare((row.votes / total) * 100)
                    : "0%"}
                </p>
              </div>

              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-dash-bg">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      /* Clamped through a guard rather than by Math.min
                         alone: `width: NaN%` is discarded by the browser, the
                         element falls back to `width: auto`, and a block
                         element then fills its entire track. That is how a
                         broken figure came to look like a landslide. */
                      width: `${Number.isFinite(row.votes) ? Math.min(100, (row.votes / top) * 100) : 0}%`,
                      background: row.rest
                        ? "var(--color-party-other-l)"
                        : partyFill(row.id, "scope", PARTY_FILL[row.id] ?? PARTY_FILL.OTH),
                    }}
                  />
                </div>
                <span className="figure w-20 shrink-0 text-right text-[0.75rem] text-dash-muted tabular-nums">
                  {Number.isFinite(row.votes) ? formatNumber(row.votes) : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-dash-line pt-3 text-[0.75rem] text-dash-muted">
        {total > 0 ? (
          <>
            Lead over second place{" "}
            <span className="figure font-bold text-dash-ink">{formatNumber(margin)}</span>
          </>
        ) : (
          "Nothing counted yet. Each line fills as booths file."
        )}
      </p>
    </section>
  );
}

/* ═════════════════════════════════════════════════════ the band underneath */

export function CommandLedger({
  principal,
  spread,
  ticker = [],
  ballot = [],
  byState = [],
  /* The national standings and the running total, for the standing panel: it
     answers "are we first, and by how much", which is a national question and
     not one the per-state rows can settle. */
  standings = [],
  total = 0,
  className,
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── WHAT HAS JUST LANDED ────────────────────────────────────────
            Fixed-height rows in the mono face, so a batch arriving never
            reflows the panel beside it — the single most distracting thing a
            live board can do to a room full of people reading it. The booth
            code is first because it is the identifier a coordinator can act
            on: eleven characters naming state, local government, ward, unit. */}
        <section className="rounded-dash border border-dash-line bg-dash-card p-5">
          <h3 className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
            Latest returns
          </h3>

          {ticker.length === 0 ? (
            <p className="mt-4 rounded-dash-sm bg-dash-bg px-4 py-6 text-center text-[0.875rem] text-dash-muted">
              Nothing has arrived yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-dash-line">
              {ticker.slice(0, 8).map((row, index) => (
                <li key={`${row.code}-${index}`} className="flex items-center gap-3 py-2">
                  <span className="figure w-[7.5rem] shrink-0 text-[0.75rem] text-dash-muted">
                    {row.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-dash-ink">
                    {row.state}
                  </span>
                  <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                    +{formatNumber(row.votes)}
                  </span>
                  {/* `leader` is an index into the board's own slots. Resolved
                      against the list the figures were added up in — never a
                      fixed four, which is the assumption that printed "n/a"
                      for every party past the fourth. */}
                  <span className="figure w-14 shrink-0 text-right text-[0.75rem] font-bold text-dash-ink">
                    {ballot[row.leader]?.id ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── WHAT WOULD HAVE TO CHANGE ──────────────────────────────────
            The only actionable list on the screen: "3.1 points short in
            Plateau" is an instruction, "you are short in nineteen states" is
            a mood. Drawn only while it is still a live question. */}
        <section className="rounded-dash border border-dash-line bg-dash-card p-5">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
              Nearest to a quarter
            </h3>
            {spread && !spread.clearsSpread && (
              <span className="text-[0.75rem] text-dash-muted">
                {spread.statesShort} more needed
              </span>
            )}
          </div>

          {!spread || spread.nearest.length === 0 ? (
            <p className="mt-4 rounded-dash-sm bg-dash-bg px-4 py-6 text-center text-[0.875rem] text-dash-muted">
              {spread?.clearsSpread
                ? "Every state needed is already at a quarter."
                : "Nothing has reported yet, so nothing is near."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {spread.nearest.map((row) => (
                <li key={row.code} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-dash-ink">
                    {row.name}
                  </span>
                  {/* The bar runs to the quarter, not to a hundred: the whole
                      question is the distance to one line, and a bar scaled to
                      100% renders that distance as a sliver. */}
                  <span className="hidden h-1.5 w-24 shrink-0 rounded-full bg-dash-bg sm:block">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (row.share / 25) * 100)}%`,
                        background: principal.token,
                      }}
                    />
                  </span>
                  <span className="figure w-14 shrink-0 text-right text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                    {formatShare(row.share)}
                  </span>
                  <span className="figure w-14 shrink-0 text-right text-[0.75rem] text-flag-700 tabular-nums">
                    −{formatShare(row.gap)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          WHERE WE STAND, AND WHAT IS LEFT TO STAND ON

          ── WHAT WAS HERE AND WHY IT WENT ────────────────────────────────
          A table of every state, its leader, its share and its status. The
          map beside this screen already lists exactly that, vertically,
          state by state, and drills into each one. The same thirty-seven
          rows twice on one screen is not thoroughness — it is a reader
          checking whether the two agree instead of reading either.

          ── AND WHAT A COMMAND ROOM ACTUALLY LACKED ──────────────────────
          Both halves of section 134 in one place, with the arithmetic that
          decides whether the night is still winnable: how far behind the
          lead we are, and how much of the country has not spoken yet. A
          campaign 400,000 votes behind with nine states outstanding is in a
          completely different position from one 400,000 behind with none,
          and no other panel on this screen can tell those apart.
          ══════════════════════════════════════════════════════════════════ */}
      <Standing
        principal={principal}
        spread={spread}
        standings={standings}
        byState={byState}
        total={total}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ where we stand */

function Standing({ principal, spread, standings, byState, total }) {
  const ranked = [...standings]
    .filter((row) => row.id !== "OTH")
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));

  const leader = ranked[0] ?? null;
  const usIndex = ranked.findIndex((row) => row.id === principal.party);
  const us = usIndex >= 0 ? ranked[usIndex] : null;
  const behind = leader && us ? (leader.votes ?? 0) - (us.votes ?? 0) : 0;
  const leading = Boolean(us && leader && us.id === leader.id && total > 0);

  /* What has not spoken. The register of every state with nothing in yet is
     the honest measure of what is still to play for — coverage is a share of
     booths, and booths are not votes. */
  const silent = byState.filter((row) => !row.reported);
  const outstanding = silent.reduce((sum, row) => sum + (row.registered ?? 0), 0);

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card p-5">
      <h3 className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
        Where we stand
      </h3>

      <div className="mt-4 grid gap-px overflow-hidden rounded-dash border border-dash-line bg-dash-line sm:grid-cols-3">
        {/* ── CONDITION ONE: THE MOST VOTES ────────────────────────────── */}
        <Condition
          label="Most votes nationally"
          met={leading}
          pending={total === 0}
          value={
            total === 0
              ? "—"
              : leading
                ? "Leading"
                : `${formatNumber(behind)} behind`
          }
          foot={
            total === 0
              ? "Nothing counted yet"
              : leading
                ? `${formatNumber(us.votes ?? 0)} votes`
                : `${leader?.id ?? "The leader"} leads`
          }
        />

        {/* ── CONDITION TWO: THE SPREAD ────────────────────────────────── */}
        <Condition
          label="A quarter in 24 states"
          met={Boolean(spread?.clearsSpread)}
          pending={!spread || spread.quarterStates === 0}
          value={spread ? `${spread.quarterStates} of ${STATES_REQUIRED}` : "—"}
          foot={
            spread
              ? spread.clearsSpread
                ? "Both conditions would be met"
                : `${spread.statesShort} more state${spread.statesShort === 1 ? "" : "s"} needed`
              : "Nothing counted yet"
          }
        />

        {/* ── AND WHAT IS LEFT TO WIN IT WITH ──────────────────────────── */}
        <Condition
          label="Still to report"
          neutral
          value={`${formatNumber(silent.length)} state${silent.length === 1 ? "" : "s"}`}
          foot={
            outstanding > 0
              ? `${formatNumber(outstanding)} registered voters not yet counted`
              : "Every state has reported"
          }
        />
      </div>

      <p className="mt-4 text-[0.75rem] leading-relaxed text-dash-muted">
        To be elected president both conditions must hold: the highest number of votes cast, and
        not less than a quarter of the votes in at least {STATES_REQUIRED} of the 36 states.
        Leading the count alone does not win it — and neither does the spread.
      </p>
    </section>
  );
}

function Condition({ label, value, foot, met = false, pending = false, neutral = false }) {
  return (
    <div className="bg-dash-card px-4 py-3.5">
      <p className="flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
        {!neutral && (
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              pending ? "bg-dash-line" : met ? "bg-ok-600" : "bg-flag-600"
            )}
          />
        )}
        {label}
      </p>
      <p
        className={cn(
          "figure mt-2 text-[1.5rem] leading-none font-bold tracking-[-0.01em]",
          neutral || pending ? "text-dash-ink" : met ? "text-ok-700" : "text-dash-ink"
        )}
      >
        {value}
      </p>
      {foot && <p className="mt-1.5 text-[0.75rem] text-dash-muted">{foot}</p>}
      {/* Never colour alone: the dot has a word beside it and the state is
          written out underneath. */}
      {!neutral && !pending && (
        <p className="sr-only">{met ? "Condition met" : "Condition not yet met"}</p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ the portrait
 *
 * ── A PICTURE IF THERE IS ONE, INITIALS IF THERE IS NOT ────────────────────
 * This product ships with no photographs of anybody, deliberately: a picture
 * of a real person is somebody's copyright and somebody's likeness, and
 * neither belongs in a repository by default. The room looks for a file at the
 * path lib/principal.js names and draws a monogram when there is not one.
 *
 * The monogram is not an apology. A room showing initials is finished; a room
 * showing a broken image icon is not, and the difference is that this path is
 * allowed to stay empty forever. `onError` is why this is a client component —
 * there is no server-side way to know whether a file 404s.
 */
function Portrait({ principal }) {
  const [failed, setFailed] = useState(false);
  const ring = { boxShadow: `inset 0 0 0 2px ${principal.token}` };

  if (failed || !principal.portrait) {
    return (
      <span
        style={ring}
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-dash-bg"
        aria-hidden="true"
      >
        <span className="figure text-base font-bold text-dash-ink">{principal.initials}</span>
      </span>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element --
       Deliberately not next/image. That component runs the file through the
       optimiser, and this file is expected to be missing — the whole design
       above is that a room with no portrait is a finished room. A missing
       source is a clean 404 and an `onError` here; through the optimiser it is
       a 500 from a route nobody is looking at, and the monogram never draws. */
    <img
      src={principal.portrait}
      alt={principal.candidate}
      width={56}
      height={56}
      style={ring}
      onError={() => setFailed(true)}
      className="size-14 shrink-0 rounded-full object-cover"
    />
  );
}
