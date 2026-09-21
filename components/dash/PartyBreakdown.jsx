"use client";

import { PARTY_FILL } from "./Charts";
import PartyMark from "./PartyMark";
import { parties, others } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The whole contest in one place, at whatever level you are standing on.
 *
 * ── WHY EVERY PARTY, NOT JUST THE WINNER ───────────────────────────────────
 * A choropleth can only say one thing per shape: who came first. That is the
 * least interesting fact about most places. Whether Kano was 51/49 or 80/20,
 * whether the party that lost nationally is second or fourth here, whether the
 * fourth party is worth 200 votes or 200,000, none of it survives a fill
 * colour, and all of it is what a room is actually arguing about.
 *
 * So selecting anywhere, a state, a local government, a ward, a booth, opens
 * the full card: every party, ranked, with its share, its bar and the margin
 * between first and second, plus the turnout arithmetic underneath.
 *
 * ── AND WHY THE BAR IS SCALED TO THE LEADER ────────────────────────────────
 * Bars run against the leading party rather than against 100%, because in a
 * four-way race with a 38% winner every bar scaled to 100 is short and the
 * shape of the contest disappears. Scaled to the leader, second place at 31%
 * is visibly close and fourth at 6% is visibly nowhere. The percentage is
 * printed regardless, so nothing depends on reading a bar.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function PartyBreakdown({
  place,
  row,
  coverage,
  level,
  compact = false,
  /**
   * ── WHO IS ON THIS PAPER ───────────────────────────────────────────────
   * The party list used to be hard-coded to the presidential four plus a
   * bucket, because that is the shape of the 2023 declared record. On a live
   * count it was wrong and quietly so: an agent files eighteen parties off
   * the sheet in front of them — ADC, APM, NDC, SDP, YPP and the rest — and
   * this card folded every one of them into a grey line called "other".
   * A party that stood, and whose votes we hold by name, is named.
   *
   * So the list comes from the board's own ballot. It falls back to the four
   * only where the caller genuinely has nothing else: the 2023 replay, whose
   * vote arrays are positional over exactly those five slots.
   */
  slots,
  /* ── WHOSE NAME GOES UNDER THE PARTY ──────────────────────────────────
     The candidate names in lib/election2023 are the 2023 presidential ones.
     Printed under a governorship they are simply wrong: a room looking at the
     Edo result was told Bola Tinubu, who was not on that ballot and did not
     stand in that election. A party is a party in every contest; a candidate
     belongs to one. So the name appears only where it is the right name, and
     everywhere else the party stands on its own. */
  candidates = true,
}) {
  const all = slots?.length ? slots : [...parties, others];

  const ranked = all
    .map((party, index) => ({
      id: party.id,
      name: party.name,
      candidate: candidates ? party.candidate : null,
      votes: row?.votes?.[index] ?? 0,
    }))
    .sort((a, b) => (a.id === "OTH" ? 1 : b.id === "OTH" ? -1 : b.votes - a.votes));

  const total = ranked.reduce((sum, party) => sum + party.votes, 0);

  /* ── EVERY PARTY THAT POLLED, AND A LINE FOR THE ONES THAT DID NOT ──────
     Eighteen rows of which twelve are zero is not a fuller picture, it is the
     same picture with the interesting part pushed off the screen. So the
     parties that took votes here get a row each, by name, and the ones that
     took none are named on one line underneath — named, not counted away,
     because "ADC stood here and got nothing" is a fact somebody may need and
     "other" never was. */
  const polled = ranked.filter((party) => party.votes > 0);
  const silent = ranked.filter((party) => party.votes === 0);
  const shown = polled.length ? polled : ranked.slice(0, 1);
  const top = ranked[0];
  const second = ranked[1];
  const lead = top && second ? top.votes - second.votes : 0;
  const leadShare = total ? (lead / total) * 100 : 0;
  const scale = Math.max(top?.votes ?? 0, 1);

  /* The call, on the same conservative rule the rest of the product uses:
     coverage first, margin second. */
  const call =
    coverage !== undefined && coverage < 25
      ? { label: "Too early", tone: "muted" }
      : leadShare < 5
        ? { label: "Too close", tone: "warn" }
        : leadShare >= 12
          ? { label: "Decided", tone: "good" }
          : { label: "Leaning", tone: "muted" };

  if (!row || total === 0) {
    return (
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="border-b border-dash-line px-4 py-3">
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">{place}</h3>
        </header>
        <p className="px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
          No returns from here yet. Grey means nobody has reported, never a low score.
        </p>
      </section>
    );
  }

  return (
    <section className="@container overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      {/* ------------------------------------------------------------ head */}
      <header className="border-b border-dash-line px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              {level}
            </p>
            <h3 className="truncate font-display text-[1.125rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink">
              {place}
            </h3>
          </div>

          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase",
              call.tone === "good"
                ? "bg-ok-50 text-ok-800"
                : call.tone === "warn"
                  ? "bg-flag-50 text-flag-800"
                  : "bg-dash-bg text-dash-muted"
            )}
          >
            {call.label}
          </span>
        </div>

        {/* ── THE HEADLINE THAT SAID ROW ONE AGAIN ───────────────────────
            A block stood here drawing the leader's code, the leader's share
            and the margin, at three times the size — directly above a list
            whose first row is the leader's code, the leader's share and the
            leader's votes. The same two figures, twice, four centimetres
            apart, and the larger copy was the one with no bar next to it to
            put it in proportion.

            The public board on the home page does not do this and never did:
            it prints the standings once and puts the margin on one quiet line
            under them, because "who is ahead" is already legible from the
            bars, and the only thing the bars cannot say is by how much. That
            is the shape this panel takes now — see components/board/Standings.
            The margin has moved to the foot, in one line, next to the
            arithmetic it belongs with. */}
      </header>

      {/* ----------------------------------------------------- every party */}
      <ul className={cn("divide-y divide-dash-line", compact && "text-[0.8125rem]")}>
        {shown.map((party, index) => {
          const share = total ? (party.votes / total) * 100 : 0;
          return (
            <li key={party.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2.5">
                <span className="figure w-4 shrink-0 text-[0.6875rem] text-dash-muted">
                  {index + 1}
                </span>
                {/* ── THE PARTY'S OWN MARK, WHERE ONE EXISTS ──────────────
                    This was a 10px dot of the party's colour, which is a
                    perfectly good encoding and is not what a reader
                    recognises at arm's length on a result board. PartyMark
                    draws the emblem for the parties that have one and the
                    same-sized coloured block with the code on it for the
                    rest, so the column stays one width either way — see the
                    head of components/dash/PartyMark.jsx for why that
                    uniformity matters more than the logos do. */}
                <PartyMark id={party.id} size={compact ? 18 : 22} className="self-center" />
                <span className="figure shrink-0 text-[0.875rem] font-bold text-dash-ink">
                  {party.id}
                </span>
                {!compact && (
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] text-dash-muted">
                    {party.candidate ?? party.name}
                  </span>
                )}
                <span className="figure ml-auto shrink-0 text-[0.875rem] font-bold text-dash-ink tabular-nums">
                  {formatShare(share)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-3">
                {/* ── SQUARE ENDS, AS ON THE PUBLIC BOARD ─────────────────
                    A bar that rounds its end reads as slightly short of the
                    value it is drawn at, and these bars are the only thing on
                    the panel a reader compares by length. The home page's
                    standings have been square for exactly this reason — see
                    components/board/Standings.jsx. The card keeps its radius;
                    the measurement inside it does not. */}
                <div className="h-2 flex-1 overflow-hidden bg-dash-bg">
                  <div
                    className="h-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.min(100, (party.votes / scale) * 100)}%`,
                      background: PARTY_FILL[party.id],
                    }}
                  />
                </div>
                <span className="figure w-20 shrink-0 text-right text-[0.75rem] text-dash-muted tabular-nums">
                  {formatNumber(party.votes)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── THE ONE THING THE BARS CANNOT SAY ──────────────────────────────
          Which party leads is legible from the list above without being told.
          By how much is not: two bars a few pixels apart and two bars a
          thumb's width apart are the difference between a contest and a
          result, and at national scale the eye cannot turn either into a
          number. So the margin is printed, once, in a line — the same place
          and the same weight the public board gives it. */}
      {second && (
        <p className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] text-dash-muted">
          {lead > 0 ? (
            <>
              <span className="figure font-bold text-dash-ink">{top.id}</span> leads{" "}
              <span className="figure font-bold text-dash-ink">{second.id}</span> by{" "}
              <span className="figure font-bold text-dash-ink">{formatNumber(lead)}</span>
              {total > 0 && <> · {formatShare(leadShare)} of the votes counted here</>}
            </>
          ) : (
            <>
              <span className="figure font-bold text-dash-ink">{top.id}</span> and{" "}
              <span className="figure font-bold text-dash-ink">{second.id}</span> are level here.
            </>
          )}
        </p>
      )}

      {silent.length > 0 && (
        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          <span className="font-semibold text-dash-ink">No votes recorded here:</span>{" "}
          {silent.map((party) => party.id).join(", ")}.
        </p>
      )}

      {/* ------------------------------------------------- the arithmetic */}
      {/* ── FOUR ACROSS ONLY WHERE FOUR FIT ──────────────────────────────
          This was `sm:grid-cols-4`, which asks the *viewport* whether there is
          room and then draws four columns inside a 21rem panel on a 1600px
          screen. Each cell got about five and a half rem, and the national
          register — 89,284,124 — printed as "89,284,1". A truncated total is
          not a smaller total, it is a wrong one. The question is how wide this
          card is, not how wide the screen is, so it is asked of the container. */}
      <dl className="grid grid-cols-2 gap-px border-t border-dash-line bg-dash-line @md:grid-cols-4">
        <Cell label="Votes" value={formatNumber(total)} />
        <Cell label="Register" value={formatNumber(row.registered ?? 0)} />
        <Cell label="Turnout" value={formatShare(row.turnout ?? 0)} />
        <Cell
          label={coverage === undefined ? "Booths" : "Counted"}
          value={coverage === undefined ? formatNumber(row.booths ?? 0) : formatShare(coverage)}
        />
      </dl>
    </section>
  );
}

function Cell({ label, value }) {
  return (
    <div className="bg-dash-card px-4 py-3">
      <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd className="figure mt-1 text-[0.9375rem] font-bold text-dash-ink tabular-nums">{value}</dd>
    </div>
  );
}
