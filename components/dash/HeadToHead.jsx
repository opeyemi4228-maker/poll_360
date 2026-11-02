"use client";

import PersonPhoto from "./PersonPhoto";
import PartyMark from "./PartyMark";
import { PARTY_FILL } from "./Charts";
import { states2023 } from "@/lib/election2023";
import { ROOM_CHOICES } from "@/lib/principal";
import { QUARTER, STATES_REQUIRED } from "@/lib/spread";
import { ZONE_ORDER, zoneOf } from "@/lib/stronghold-map";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Tinubu, Atiku and Obi at the 2023 presidential, side by side.
 *
 * ── THE THREE FIGURES SECTION 134 ASKS FOR, AND WHERE EACH VOTE CAME FROM ──
 * A winner needs the most votes and a quarter of the vote in two-thirds of
 * the states. So each candidate gets exactly those: votes, share, states
 * carried and states at a quarter — then the six zones, because the same
 * national share built in two zones and built in six are different campaigns.
 *
 * Every figure is the declared 2023 state result in lib/election2023.js,
 * added up here. Nothing is modelled.
 *
 * `columns` is the declared result's own slot order — APC, PDP, LP, NNPP and
 * the rest — and each candidate is read off the column they stood in that
 * year, which is not always the party they are in now; the card says both.
 */
const COLUMNS = ["APC", "PDP", "LP", "NNPP", "OTH"];

const CANDIDATES = [
  { id: "tinubu", name: "Bola Ahmed Tinubu", ran: "APC" },
  { id: "atiku", name: "Atiku Abubakar", ran: "PDP" },
  { id: "obi", name: "Peter Obi", ran: "LP" },
].map((entry) => ({ ...entry, now: ROOM_CHOICES.find((choice) => choice.id === entry.id)?.party ?? null }));

const FCT = "FCT";

/* On the room's list with no 2023 column of their own — the SDP. */
const OTHERS = ROOM_CHOICES.filter((choice) => !CANDIDATES.some((candidate) => candidate.id === choice.id));

function tally() {
  const total = states2023.reduce((sum, row) => sum + row.total, 0);
  const zoneTotals = Object.fromEntries(ZONE_ORDER.map((zone) => [zone, 0]));
  for (const row of states2023) {
    const zone = zoneOf(row.code);
    if (zone) zoneTotals[zone] += row.total;
  }

  const rows = CANDIDATES.map((candidate) => {
    const at = COLUMNS.indexOf(candidate.ran);
    let votes = 0;
    let won = 0;
    let quarter = 0;
    let fctQuarter = false;
    const zones = Object.fromEntries(ZONE_ORDER.map((zone) => [zone, 0]));

    for (const row of states2023) {
      const mine = row.votes[at] ?? 0;
      votes += mine;
      const zone = zoneOf(row.code);
      if (zone) zones[zone] += mine;
      /* Carried: the most votes among the named candidates. The "others"
         bucket is fourteen candidates and never carries a state. */
      const best = Math.max(...row.votes.slice(0, COLUMNS.length - 1));
      if (mine === best && mine > 0) won += 1;
      const share = row.total > 0 ? (mine / row.total) * 100 : 0;
      if (row.code === FCT) fctQuarter = share >= QUARTER;
      else if (share >= QUARTER) quarter += 1;
    }

    return {
      ...candidate,
      /* Drawn in the party they stand for now, so a card reads the same here
         as on the Command switch and the broadcast cards. The figures are
         still the 2023 ticket's, and the card says which. */
      party: candidate.now ?? candidate.ran,
      fill: PARTY_FILL[candidate.now ?? candidate.ran] ?? "var(--color-party-other)",
      votes,
      share: total > 0 ? (votes / total) * 100 : 0,
      won,
      quarter,
      fctQuarter,
      zones: Object.fromEntries(
        ZONE_ORDER.map((zone) => [zone, zoneTotals[zone] > 0 ? (zones[zone] / zoneTotals[zone]) * 100 : 0])
      ),
    };
  });

  return { rows, top: Math.max(...rows.map((row) => row.votes)) };
}

/* Declared figures that never change, so added up once when the file loads. */
const TALLY = tally();

export default function HeadToHead() {
  const { rows, top } = TALLY;
  /* The darkest cell in the zone table is the best zone result of anybody,
     so the three columns are drawn on one scale and can be compared. */
  const peak = Math.max(...rows.flatMap((row) => Object.values(row.zones)));

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card shadow-e2">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dash-line px-5 py-3.5">
        <div>
          <h3 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
            Head to head, 2023 presidential
          </h3>
          <p className="text-[0.75rem] text-dash-muted">
            Declared results for all 36 states and the FCT. To win outright: the most votes, and a quarter of
            the vote in {STATES_REQUIRED} states.
          </p>
        </div>
        <span className="figure text-[0.8125rem] font-bold text-dash-ink">
          {formatNumber(states2023.reduce((sum, row) => sum + row.total, 0))} valid votes
        </span>
      </header>

      <div className="grid gap-px bg-dash-line md:grid-cols-3">
        {rows.map((row, index) => (
          <article key={row.id} className="bg-dash-card p-5">
            <div className="flex items-center gap-3">
              <PersonPhoto name={row.name} ring={row.fill} size={56} />
              <div className="min-w-0">
                <p className="truncate font-display text-[1.0625rem] leading-tight font-extrabold text-dash-ink">
                  {row.name}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-dash-muted">
                  <PartyMark id={row.party} size={20} />
                  <span className="figure font-bold text-dash-ink">{row.party}</span>
                  {row.party !== row.ran && <span>· ran as {row.ran} in 2023</span>}
                </p>
              </div>
              {index === 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-ok-50 px-2 py-0.5 text-[0.625rem] font-bold text-ok-700">
                  Declared winner
                </span>
              )}
            </div>

            <p className="figure mt-4 text-[1.75rem] leading-none font-extrabold tracking-[-0.02em] text-dash-ink">
              {formatShare(row.share)}
            </p>
            <p className="figure mt-1 text-[0.75rem] text-dash-muted">{formatNumber(row.votes)} votes</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-dash-bg" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${(row.votes / top) * 100}%`, background: row.fill }} />
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-dash-line pt-3">
              <Fig label="States won" value={row.won} />
              <Fig label="At 25%" value={`${row.quarter}/36`} tone={row.quarter >= STATES_REQUIRED ? "ok" : "ink"} />
              <Fig label="FCT 25%" value={row.fctQuarter ? "Yes" : "No"} tone={row.fctQuarter ? "ok" : "muted"} />
            </dl>
          </article>
        ))}
      </div>

      {OTHERS.map((choice) => (
        <div key={choice.id} className="flex items-center gap-3 border-t border-dash-line bg-dash-bg px-5 py-3">
          <PersonPhoto name={choice.candidate} ring={PARTY_FILL[choice.party] ?? "var(--color-party-other)"} size={36} />
          <PartyMark id={choice.party} size={22} />
          <p className="min-w-0 text-[0.75rem] leading-snug text-dash-muted">
            <span className="font-bold text-dash-ink">{choice.candidate}</span> · {choice.party}. The 2023 declared results
            count the {choice.party} among the other fourteen candidates, so it has no separate figures to set beside these.
          </p>
        </div>
      ))}

      <div className="overflow-x-auto border-t border-dash-line px-5 py-4">
        <p className="mb-2 text-[0.75rem] font-medium text-dash-muted">Share of the vote, zone by zone</p>
        <table className="w-full min-w-[30rem] text-[0.8125rem]">
          <thead>
            <tr className="text-[0.6875rem] text-dash-muted">
              <th className="py-1.5 text-left font-semibold">Zone</th>
              {rows.map((row) => (
                <th key={row.id} className="py-1.5 text-right font-semibold">
                  {row.name.split(" ").at(-1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ZONE_ORDER.map((zone) => {
              const leader = rows.reduce((best, row) => (row.zones[zone] > best.zones[zone] ? row : best), rows[0]);
              return (
                <tr key={zone} className="border-t border-dash-line">
                  <td className="py-1.5 pr-3 font-semibold text-dash-ink">{zone}</td>
                  {rows.map((row) => (
                    <td key={row.id} className="py-1 pl-2 text-right">
                      <span
                        className={cn(
                          "figure inline-block min-w-[4.25rem] rounded-[5px] px-2 py-1 font-bold tabular-nums",
                          row === leader ? "text-white" : "text-dash-ink"
                        )}
                        style={{
                          background: row === leader ? row.fill : `color-mix(in oklch, ${row.fill} ${Math.round((row.zones[zone] / peak) * 45)}%, transparent)`,
                        }}
                      >
                        {formatShare(row.zones[zone])}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[0.6875rem] text-dash-muted">
          The filled cell is who carried the zone. Shares are of every valid vote cast in the zone, all eighteen
          candidates included.
        </p>
      </div>
    </section>
  );
}

function Fig({ label, value, tone = "ink" }) {
  return (
    <div>
      <dt className="text-[0.625rem] font-medium text-dash-muted">{label}</dt>
      <dd
        className={cn(
          "figure text-[1rem] font-extrabold",
          tone === "ok" ? "text-ok-700" : tone === "muted" ? "text-dash-muted" : "text-dash-ink"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
