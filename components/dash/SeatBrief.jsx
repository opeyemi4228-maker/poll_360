"use client";

import { AlertTriangle, ArrowLeftRight, CalendarDays, FileText } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { formatNumber, formatShare } from "@/lib/utils";

/**
 * The seat, and the last election for it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This is the panel that replaces "Ruling party" for a room that holds a
 *  ground. That map draws 37 states and answers a national question; a
 *  senatorial campaign in Adamawa Central opens a screen to find out two
 *  things about one place — who holds it, and what it took to win it last
 *  time — and neither was anywhere in this product.
 *
 *  ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────
 *  Fill a gap with a number from a different election. Where no figures were
 *  published for a contest — every Senate, House and council seat in the
 *  country — it prints the winner, the party and the plain sentence that the
 *  totals are not held. A bar chart of the state governorship under a heading
 *  naming a senatorial district would be the most convincing wrong thing on
 *  the screen.
 *
 *  ── AND WHY THE TWO PARTIES ARE BOTH SHOWN ──────────────────────────────
 *  A governor elected under one party and sitting under another is the
 *  ordinary case since 2025, and the difference is the whole story for a
 *  campaign: the seat was won from a party that no longer holds it, without
 *  anybody voting on the change. Both are printed, with the date of the move.
 * ══════════════════════════════════════════════════════════════════════════
 */
/**
 * How each contest is named in a sentence.
 *
 * `raceLabel` is a column heading — "Local government", "Representatives" —
 * and dropping it into "the last ___ here" produced "the last local government
 * here", which reads as a question about geography. These are the same six
 * contests said the way somebody says them out loud.
 */
const CONTEST = {
  PRESIDENTIAL: "presidential election",
  GOVERNORSHIP: "governorship election",
  SENATE: "senatorial election",
  REPRESENTATIVES: "House of Representatives election",
  ASSEMBLY: "House of Assembly election",
  LGA: "local government election",
};

export default function SeatBrief({ race, raceLabel, ground, holders = [], result = null }) {
  const contest = CONTEST[race] ?? String(raceLabel ?? "election").toLowerCase();
  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="border-b border-dash-line px-5 py-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            {holders.length === 1 ? "The seat" : `${holders.length} seats`} · {raceLabel}
          </p>
          <h2 className="mt-1 font-display text-[1.0625rem] font-extrabold text-dash-ink">{ground}</h2>
        </header>

        {holders.length === 0 ? (
          <Nothing race={race} ground={ground} />
        ) : (
          <ul className="divide-y divide-dash-line">
            {holders.map((seat) => (
              <li key={`${seat.place}-${seat.holder ?? seat.party}`} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-bold text-dash-ink">
                      {seat.holder ?? <span className="text-dash-muted">Not named in the declaration</span>}
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] text-dash-muted">
                      {seat.office}
                      {holders.length > 1 && ` · ${seat.place}`}
                    </p>
                  </div>
                  <Chip party={seat.party} />
                </div>

                {seat.defected && (
                  <p className="mt-2 flex gap-2 text-[0.8125rem] leading-relaxed text-amber-700">
                    <ArrowLeftRight size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
                    <span>
                      Won as <strong>{seat.wonAs}</strong>, sits as <strong>{seat.party}</strong>
                      {seat.moved?.on && ` since ${seat.moved.on}`}. Nobody voted on that change.
                      {seat.moved?.note && ` ${seat.moved.note}`}
                    </span>
                  </p>
                )}

                {seat.note && !seat.defected && (
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-muted">{seat.note}</p>
                )}

                {seat.since && (
                  <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-dash-muted">
                    <CalendarDays size={12} strokeWidth={2.5} />
                    Since {seat.since}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <LastResult result={result} contest={contest} ground={ground} holders={holders} />
    </div>
  );
}

/**
 * The last time this seat was contested.
 *
 * ── THE BARS ARE DRAWN ONLY WHERE THERE ARE FIGURES ────────────────────────
 * Not a bar of zero, not a flat grey placeholder. A chart is a claim that
 * there is something to compare, and where nothing was published the honest
 * shape on the screen is a sentence.
 */
function LastResult({ result, contest, ground, holders = [] }) {
  if (!result) {
    return (
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="border-b border-dash-line px-5 py-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            The last {contest} here
          </p>
        </header>
        <p className="px-5 py-6 text-[0.875rem] leading-relaxed text-dash-muted">
          We hold no record of the last {contest} for {ground}. That is a gap in what this product
          has transcribed, not a statement that none was held.
        </p>
      </section>
    );
  }

  const ranked = result.votes
    ? Object.entries(result.votes)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  const top = ranked[0]?.[1] ?? 0;
  const counted = ranked.reduce((sum, [, value]) => sum + value, 0);
  const margin = ranked.length > 1 ? ranked[0][1] - ranked[1][1] : null;

  /* ── SAID ONCE ────────────────────────────────────────────────────────
     A seat's note and its last result's note are frequently the same sentence
     — a council sweep carries one line explaining itself and both halves of
     this panel were printing it, side by side, in full. Repetition on a screen
     teaches a reader that this corner does not need reading. */
  const note = holders.some((seat) => seat.note === result.note) ? null : result.note;

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="border-b border-dash-line px-5 py-4">
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          The last {contest} here
        </p>
        {/* A winner nobody named — the 21 Adamawa chairmen, for instance — is
            not headlined by their party code alone, which reads as a label
            rather than as a result. The sentence says what happened. */}
        <p className="mt-1 text-[0.9375rem] font-bold text-dash-ink">
          {result.candidate ?? `${result.party} took this seat`}
          {result.candidate && <span className="font-normal text-dash-muted"> · {result.party}</span>}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-dash-muted">
          {result.place}
          {result.declaredOn
            ? ` · declared ${result.declaredOn}`
            : result.heldSince
              ? ` · held since ${result.heldSince}`
              : ""}
        </p>
      </header>

      {ranked.length > 0 ? (
        <div className="px-5 py-4">
          <ul className="space-y-2.5">
            {ranked.map(([party, value]) => (
              <li key={party}>
                <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="font-semibold text-dash-ink">{party}</span>
                  <span className="figure text-dash-ink tabular-nums">
                    {formatNumber(value)}
                    <span className="ml-2 text-dash-muted">
                      {counted ? formatShare((value / counted) * 100) : ""}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-dash-bg">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${top ? (value / top) * 100 : 0}%`,
                      background: PARTY_FILL[party] ?? "var(--color-party-other)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-dash-sm border border-dash-line bg-dash-line">
            <Figure label="Counted here" value={formatNumber(counted)} />
            <Figure
              label="Margin"
              value={margin === null ? "—" : formatNumber(margin)}
              tone={margin !== null && counted && margin / counted < 0.05 ? "alert" : "ink"}
            />
            <Figure label="Registered" value={result.registered ? formatNumber(result.registered) : "not held"} />
            {/* ── NOT "TURNOUT", BECAUSE IT IS NOT THE TURNOUT ──────────────
                It is the votes we hold as a share of the register, and where
                only the leading parties' totals were published that is below
                the declared turnout — 37.8% against 39.90% in Adamawa. Two
                percentages of the same election, differing, one labelled as
                the thing the other actually is, four lines apart on one
                screen. This one says what it is. */}
            <Figure
              label="Of the register"
              value={result.registered && counted ? formatShare((counted / result.registered) * 100) : "—"}
            />
          </dl>
        </div>
      ) : (
        <p className="flex gap-2 px-5 py-5 text-[0.875rem] leading-relaxed text-dash-muted">
          <AlertTriangle size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            Who won is on record. The vote totals are not: nothing was published for this contest in
            a form this product could read, so there is no chart here rather than an invented one.
          </span>
        </p>
      )}

      {(note || result.source) && (
        <footer className="border-t border-dash-line px-5 py-3">
          {note && <p className="text-[0.8125rem] leading-relaxed text-dash-muted">{note}</p>}
          {result.source && (
            <p className="mt-1.5 flex gap-1.5 text-[0.75rem] leading-relaxed text-dash-muted">
              <FileText size={12} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              {result.source}
            </p>
          )}
        </footer>
      )}
    </section>
  );
}

function Nothing({ race, ground }) {
  return (
    <p className="px-5 py-6 text-[0.875rem] leading-relaxed text-dash-muted">
      This product holds no record of who currently holds {ground} for this contest. Governors are
      transcribed for all 37 states; Senate, House of Representatives and council seats are
      transcribed for Adamawa only. It is a gap in the tables, not a statement about the seat.
      {race === "ASSEMBLY" && (
        <>
          {" "}
          A State House of Assembly seat is narrower than anything this product can draw in any
          case — the 990 state constituencies are carved out of local governments along ward lines,
          which nobody publishes in a form we hold.
        </>
      )}
    </p>
  );
}

function Chip({ party }) {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] font-bold text-white"
      style={{ background: PARTY_FILL[party] ?? "var(--color-party-other)" }}
    >
      {party}
    </span>
  );
}

function Figure({ label, value, tone = "ink" }) {
  return (
    <div className="bg-dash-card px-3 py-2.5">
      <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd
        className={`figure mt-0.5 text-[0.9375rem] font-bold tabular-nums ${
          tone === "alert" ? "text-red-600" : "text-dash-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
