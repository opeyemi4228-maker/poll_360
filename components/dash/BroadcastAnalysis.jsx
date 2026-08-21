"use client";

import { useMemo, useState } from "react";

import { PartyBars, PARTY_FILL } from "./Charts";
import StateMap from "./StateMap";
import { Card, Badge } from "./DashCard";
import { parties, others } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The analysis surface a studio actually drives.
 *
 * ── TWO SOURCES, SIDE BY SIDE, NEVER MERGED ────────────────────────────────
 * The left column is what our own agents filed. The right is the commission's
 * declared figure. They are two independently sourced numbers for the same
 * booths, and the whole value of running a parallel count is being able to
 * hold one against the other, so they sit in separate columns and the
 * difference is computed rather than averaged into a single "result".
 *
 * ── AND IT IS BUILT FOR A FINGER ───────────────────────────────────────────
 * A presenter walks to this screen on air and pushes at it. So every state is
 * a target at least 44px on its shortest side, nothing is behind a hover, a
 * hover does not exist on a touch wall, and the selected state is held until
 * somebody chooses another, rather than following a cursor that is not there.
 * ───────────────────────────────────────────────────────────────────────────
 */
const SOURCES = [
  ["ours", "Our agents"],
  ["inec", "INEC declared"],
  ["gap", "The difference"],
];

export default function BroadcastAnalysis({ declared, ours, shapes }) {
  const [selected, setSelected] = useState(null);
  const [source, setSource] = useState("ours");

  const byCode = useMemo(() => new Map(declared.map((state) => [state.code, state])), [declared]);
  const oursByCode = useMemo(() => new Map(Object.entries(ours)), [ours]);

  const state = selected ? byCode.get(selected) : null;
  const ourState = selected ? oursByCode.get(selected) : null;

  /* National, from whichever source is showing. */
  const national = useMemo(() => {
    const totals = {};
    for (const row of declared) {
      parties.forEach((party, index) => {
        totals[party.id] = (totals[party.id] ?? 0) + row.votes[index];
      });
      totals.OTH = (totals.OTH ?? 0) + row.votes[4];
    }
    return totals;
  }, [declared]);

  const rows = (votes) =>
    [...parties, others].map((party, index) => ({
      id: party.id,
      name: party.name,
      votes: Array.isArray(votes) ? votes[index] : (votes?.[party.id] ?? 0),
    }));

  const declaredTotal = Object.values(national).reduce((a, b) => a + b, 0);

  /* Who leads each state, by the source currently selected. "Our agents"
     colours only the states our own people have actually filed from, the
     rest stay grey, because silence is not a low score. */
  const leaders = useMemo(() => {
    const map = {};
    for (const row of declared) {
      if (source === "ours") {
        const mine = ours[row.code];
        if (!mine) continue;
        const ranked = parties
          .map((party) => [party.id, mine.votes[party.id] ?? 0])
          .sort((a, b) => b[1] - a[1]);
        if (ranked[0]?.[1] > 0) map[row.code] = ranked[0][0];
        continue;
      }
      const winner = row.votes.slice(0, 4).indexOf(Math.max(...row.votes.slice(0, 4)));
      map[row.code] = parties[winner]?.id ?? null;
    }
    return map;
  }, [declared, ours, source]);

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------- source */}
      <div className="flex flex-wrap items-center gap-2">
        {SOURCES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSource(value)}
            aria-pressed={source === value}
            className={cn(
              /* 48px tall: a target for a thumb on a wall, not a mouse. */
              "h-12 rounded-dash-sm border-2 px-5 text-[0.875rem] font-bold transition-colors",
              source === value
                ? "border-dash-ink bg-dash-ink text-white"
                : "border-dash-line bg-dash-card text-dash-ink hover:border-dash-ink"
            )}
          >
            {label}
          </button>
        ))}

        <p className="ml-auto text-[0.8125rem] text-dash-muted">
          {selected ? `Showing ${state.name}` : "Showing the federation, tap a state"}
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ml-3 font-semibold text-dash-ink underline underline-offset-4"
            >
              Back to national
            </button>
          )}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        {/* ------------------------------------------------------ figures */}
        <Card
          title={selected ? state.name : "Federation"}
          subtitle={
            source === "gap"
              ? "Our agents' figure against the declared one"
              : source === "inec"
                ? "As declared by the commission"
                : "As filed by our own agents"
          }
        >
          {source === "gap" ? (
            <GapPanel
              declared={selected ? state.votes : Object.values(national)}
              ours={ourState}
              rows={rows}
            />
          ) : source === "inec" ? (
            <>
              <PartyBars
                rows={rows(selected ? state.votes : Object.values(national))}
                total={selected ? state.total : declaredTotal}
              />
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-dash-line pt-5 text-[0.8125rem]">
                <div>
                  <dt className="text-dash-muted">Valid votes</dt>
                  <dd className="figure mt-1 text-[1.125rem] font-bold text-dash-ink">
                    {formatNumber(selected ? state.total : declaredTotal)}
                  </dd>
                </div>
                <div>
                  <dt className="text-dash-muted">Turnout</dt>
                  <dd className="figure mt-1 text-[1.125rem] font-bold text-dash-ink">
                    {selected ? `${state.turnout}%` : "26.9%"}
                  </dd>
                </div>
              </dl>
            </>
          ) : ourState ? (
            <PartyBars
              rows={rows(ourState.votes)}
              total={Object.values(ourState.votes).reduce((a, b) => a + b, 0)}
            />
          ) : (
            <div className="rounded-dash-sm bg-dash-bg px-4 py-8 text-center">
              <p className="text-[0.875rem] leading-relaxed text-dash-muted">
                {selected
                  ? `No returns from our agents in ${state.name} yet.`
                  : "No returns from our agents yet."}{" "}
                Grey means nobody has reported, never a low score.
              </p>
            </div>
          )}
        </Card>

        {/* -------------------------------------------------------- states */}
        <Card
          title="The federation"
          subtitle="Tap a state to drive every panel beside it. Colour is the declared winner; the code is printed on each one."
        >
          <StateMap
            shapes={shapes}
            leaders={leaders}
            selected={selected}
            onSelect={setSelected}
          />

          <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dash-line pt-4">
            {[...parties, others].map((party) => (
              <li key={party.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: PARTY_FILL[party.id] }}
                />
                <span className="figure text-[0.75rem] font-bold text-dash-ink">{party.id}</span>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full border border-dash-line bg-dash-bg"
              />
              <span className="text-[0.75rem] text-dash-muted">No returns yet</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/**
 * The difference between the two sources.
 *
 * Empty until our agents have filed in the place being looked at, and it says
 * so, an empty comparison panel is honest, a panel that quietly shows the
 * declared figure alone is not.
 */
function GapPanel({ declared, ours, rows }) {
  if (!ours) {
    return (
      <div className="rounded-dash-sm bg-dash-bg px-4 py-8 text-center">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">
          Nothing to compare here yet. The difference needs both numbers: ours and the declared
          one. Until our agents have filed, this panel stays empty rather than showing you one
          figure and letting it look like two.
        </p>
      </div>
    );
  }

  const ourRows = rows(ours.votes);
  const declaredRows = rows(declared);

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-dash-line">
          <th className="pb-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Party
          </th>
          <th className="pb-2 text-right text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Ours
          </th>
          <th className="pb-2 text-right text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Declared
          </th>
          <th className="pb-2 text-right text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Difference
          </th>
        </tr>
      </thead>
      <tbody>
        {ourRows.map((row, index) => {
          const gap = row.votes - declaredRows[index].votes;
          return (
            <tr key={row.id} className="border-b border-dash-line last:border-0">
              <td className="py-2.5">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ background: PARTY_FILL[row.id] }}
                  />
                  <span className="figure text-[0.875rem] font-bold text-dash-ink">{row.id}</span>
                </span>
              </td>
              <td className="figure py-2.5 text-right text-[0.875rem] text-dash-ink">
                {formatNumber(row.votes)}
              </td>
              <td className="figure py-2.5 text-right text-[0.875rem] text-dash-muted">
                {formatNumber(declaredRows[index].votes)}
              </td>
              <td className="py-2.5 text-right">
                <Badge tone={Math.abs(gap) > 0 ? "warn" : "neutral"}>
                  {gap > 0 ? "+" : ""}
                  {formatNumber(gap)}
                </Badge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
