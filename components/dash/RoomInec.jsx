"use client";

import { useMemo } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Download, Landmark, Loader2 } from "lucide-react";

import { gatherElection, refreshList } from "@/app/admin/irev/actions";
import { cn, formatNumber } from "@/lib/utils";

/**
 * INEC's published sheets against our own returns: the parts of the
 * verification screen that are about the commission's sheets and nothing
 * else.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS PIECES AND NOT A SCREEN
 *
 *  This file used to lay out the verification screen itself: its own map,
 *  its own rail, its own colours. So the screen had two of everything — two
 *  maps on one switch, two lists of what was wrong, two ideas of what red
 *  meant — and the comparison with what was announced lived in a third place
 *  altogether.
 *
 *  There is one screen now, components/dash/RoomEvidence.jsx, and one verdict
 *  for every place, lib/verification.js. What is left here is what only the
 *  INEC account knows how to draw: how far the gathering has got, the place
 *  by place table, the three results as a spreadsheet, and what to press when
 *  there is nothing gathered yet.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const plain = (value) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** The party with the most votes in a tally, or null. */
function leader(votes) {
  const [first] = Object.entries(votes ?? {}).sort((a, b) => b[1] - a[1]);
  return first && first[1] > 0 ? { party: first[0], votes: first[1] } : null;
}

/** The box a set of drawn outlines sits in, with a little room around it. */
export function boxOf(paths) {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const d of paths) {
    const numbers = (String(d).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      left = Math.min(left, numbers[i]);
      right = Math.max(right, numbers[i]);
      top = Math.min(top, numbers[i + 1]);
      bottom = Math.max(bottom, numbers[i + 1]);
    }
  }
  if (!Number.isFinite(left)) return null;
  const pad = Math.max(right - left, bottom - top) * 0.05;
  return [left - pad, top - pad, right - left + pad * 2, bottom - top + pad * 2];
}

/**
 * How far along the work is, said on the map while there is work left.
 *
 * ── ONLY WHAT IS TRUE FOR WHOEVER IS READING IT ────────────────────────────
 * It used to end "it carries on by itself while this room is open", and for
 * most accounts that was not so: only the system console's pages ask for the
 * next turn. And it counted our polling units "read into figures" beside a
 * turning wheel on an election whose sheets nobody had asked to be read,
 * which is a wait for something that is not coming. So it says how far the
 * gathering has got and, only where sheets are being read, how many of ours
 * can be compared yet. Once both are done it is gone.
 */
export function Progress({ election }) {
  const at = election.progress;
  if (!at) return null;

  const reading = election.reading && at.ours > 0 && at.ours_read < at.ours_up;
  if (!election.gathering && !reading) return null;

  const parts = [];
  if (election.gathering) {
    parts.push(
      at.wards
        ? `INEC's sheets are still being gathered: ${formatNumber(at.wards - at.wards_left)} of ${formatNumber(at.wards)} wards so far, so every figure here is still growing.`
        : "Fetching the election's list of wards from INEC's portal; this first step takes about half a minute."
    );
  }
  if (reading) {
    parts.push(
      `Of the ${formatNumber(at.ours)} polling units our agents filed from, ${formatNumber(at.ours_up)} have a sheet up and ${formatNumber(at.ours_read)} of those have been read so far.`
    );
  }

  return (
    <p className="flex items-start gap-2 border-b border-board-line bg-board-raised px-4 py-2 text-[0.75rem] leading-snug text-white/80">
      <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-white/60" />
      <span>{parts.join(" ")}</span>
    </p>
  );
}

/** A button that says it has been pressed, for an action that takes a moment. */
function Press({ className, children }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(className, pending && "cursor-wait opacity-70")}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Starting…
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/** Every place one step down, with what is known about each. */
export function Places({ account, onOpen, fills = {} }) {
  const { level, election } = account;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-[0.8125rem]">
        <thead>
          <tr className="border-b border-dash-line text-[0.75rem] font-medium text-dash-muted">
            <th className="px-4 py-2 sm:pl-5">{{ state: "State", lga: "Local government", ward: "Ward", unit: "Polling unit" }[level]}</th>
            <th className="px-2 py-2 text-right">Units</th>
            <th className="px-2 py-2 text-right">Sheets up</th>
            <th className="px-2 py-2 text-right">Read</th>
            <th className="px-2 py-2 text-right">In doubt</th>
            <th className="px-2 py-2 text-right">Both hold</th>
            <th className="px-2 py-2 text-right">Agree</th>
            <th className="px-2 py-2 text-right">Differ</th>
            <th className="px-2 py-2 text-right">Irregular sheets</th>
            <th className="px-4 py-2 sm:pr-5">Leading on INEC&rsquo;s sheets</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dash-line">
          {account.children.map((place) => {
            const first = leader(place.inec.votes);
            const name = (
              <>
                <span className="mr-2 inline-block size-2.5 rounded-[2px] align-middle" style={{ background: fills[place.key] ?? "var(--color-dash-line)" }} />
                <span className="font-bold">{place.name}</span>
                {level !== "state" && <span className="figure ml-2 text-[0.75rem] text-dash-muted">{place.key}</span>}
              </>
            );
            return (
              <tr key={place.key} className="hover:bg-dash-bg">
                <td className="px-4 py-2 text-dash-ink sm:pl-5">
                  {level === "unit" ? (
                    <Link href={`/admin/irev/${election.id}/${place.unitId}`} className="underline underline-offset-2">{name}</Link>
                  ) : (
                    <button type="button" onClick={() => onOpen(place.key)} className="text-left underline underline-offset-2">{name}</button>
                  )}
                </td>
                <td className="figure px-2 py-2 text-right tabular-nums">{formatNumber(place.units)}</td>
                <td className="figure px-2 py-2 text-right tabular-nums">{formatNumber(place.sheets)}</td>
                <td className="figure px-2 py-2 text-right tabular-nums">{formatNumber(place.sound)}</td>
                <td className={cn("figure px-2 py-2 text-right tabular-nums", place.doubt ? "text-flag-700" : "text-dash-muted")}>{formatNumber(place.doubt)}</td>
                <td className="figure px-2 py-2 text-right tabular-nums">{formatNumber(place.shared.units)}</td>
                <td className={cn("figure px-2 py-2 text-right tabular-nums", place.shared.agree ? "text-ok-700" : "text-dash-muted")}>{formatNumber(place.shared.agree)}</td>
                <td className={cn("figure px-2 py-2 text-right font-bold tabular-nums", place.shared.differ ? "text-red-600" : "text-dash-muted")}>{formatNumber(place.shared.differ)}</td>
                <td className={cn("figure px-2 py-2 text-right font-bold tabular-nums", place.irregular ? "text-red-600" : "text-dash-muted")}>{formatNumber(place.irregular)}</td>
                <td className="px-4 py-2 text-dash-ink sm:pr-5">
                  {first ? (
                    <>
                      <span className="font-bold">{first.party}</span>{" "}
                      <span className="figure tabular-nums text-dash-muted">{formatNumber(first.votes)}</span>
                    </>
                  ) : (
                    <span className="text-dash-muted">nothing read yet</span>
                  )}
                </td>
              </tr>
            );
          })}
          {account.children.length === 0 && (
            <tr>
              <td colSpan={10} className="px-5 py-6 text-center text-dash-muted">
                INEC lists no polling unit here for this election.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SAME PLACE AS A SPREADSHEET

   Three results for every place one step down, side by side:

     Announced   what INEC declared for that place, where it declared at
                 that level
     Ours        every return our agents filed there
     IReV        INEC's published sheets there, read and added up — which
                 moves as sheets go up and are read

   They cover different amounts of ground, so each carries how much it is
   made of (returns, sheets) beside its total. Reading "ours" against "IReV"
   as a discrepancy would be reading coverage as fraud; the map view's "gap"
   is the like-for-like figure, and the note under the table says so.
   ══════════════════════════════════════════════════════════════════════════ */

const SOURCES = [
  { key: "announced", label: "Announced by INEC", tint: "bg-dash-bg" },
  { key: "ours", label: "Our polling units", tint: "bg-ok-50" },
  { key: "irev", label: "IReV sheets, live", tint: "bg-flag-50" },
];

const sum = (votes) => Object.values(votes ?? {}).reduce((total, value) => total + Number(value ?? 0), 0);

/** One place's three results, in one shape. */
function three(place) {
  return {
    announced: place.announced?.votes ?? null,
    ours: place.ours.returns ? place.ours.votes : null,
    irev: place.sound ? place.inec.votes : null,
  };
}

export function Spreadsheet({ account, onOpen }) {
  const { children, whole, level, crumbs, election } = account;
  const here = crumbs.at(-1);

  /* Every party any of the three carries, the biggest first. The sheet shows
     the leading few and folds the rest into one column; the download carries
     them all. */
  const parties = useMemo(() => {
    const totals = {};
    for (const votes of [whole.announced.votes, whole.ours.votes, whole.inec.votes]) {
      for (const [party, value] of Object.entries(votes)) totals[party] = Math.max(totals[party] ?? 0, value);
    }
    return Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  }, [whole]);
  const shown = parties.slice(0, 6);
  const folded = parties.length > shown.length;

  const total = {
    key: "",
    name: `All of ${here.name}`,
    announced: whole.announced.places ? { votes: whole.announced.votes } : null,
    ours: whole.ours,
    inec: whole.inec,
    sound: whole.sound,
    isTotal: true,
  };

  function download() {
    const cell = (value) => (value == null ? "" : `"${String(value).replace(/"/g, '""')}"`);
    const head = ["Place", "Code"];
    for (const source of SOURCES) {
      for (const party of parties) head.push(`${source.label}: ${party}`);
      head.push(`${source.label}: total`);
    }
    head.push("Our returns", "IReV sheets read", "Polling units");

    const lines = [head.map(cell).join(",")];
    for (const place of [...children, total]) {
      const row = three(place);
      const out = [place.name, place.key];
      for (const source of SOURCES) {
        for (const party of parties) out.push(row[source.key] ? (row[source.key][party] ?? 0) : "");
        out.push(row[source.key] ? sum(row[source.key]) : "");
      }
      out.push(place.ours.returns, place.sound, place.units ?? whole.units);
      lines.push(out.map(cell).join(","));
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }));
    link.download = `${election.name} - ${here.name} - three results.csv`.replace(/[\\/:*?"<>|]/g, " ");
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const span = shown.length + (folded ? 1 : 0) + 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <p className="max-w-prose text-[0.8125rem] text-dash-muted">
          Three results for every {{ state: "state", lga: "local government", ward: "ward", unit: "polling unit" }[level]} in{" "}
          <span className="font-semibold text-dash-ink">{here.name}</span>: what INEC announced, what our own polling
          units returned, and what INEC&rsquo;s published sheets add up to as they are read.
        </p>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 py-2 text-[0.8125rem] font-semibold text-dash-ink hover:border-dash-ink"
        >
          <Download size={14} /> Download as a spreadsheet
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 border-y border-r border-dash-line bg-dash-card px-4 py-2 text-left text-[0.75rem] font-medium text-dash-muted sm:pl-5">
                Place
              </th>
              {SOURCES.map((source) => (
                <th key={source.key} colSpan={span} className={cn("border border-dash-line px-3 py-1.5 text-center text-[0.75rem] font-bold text-dash-ink", source.tint)}>
                  {source.label}
                </th>
              ))}
              <th rowSpan={2} className="border-y border-l border-dash-line px-3 py-2 text-right text-[0.75rem] font-medium text-dash-muted">
                Made of
              </th>
            </tr>
            <tr>
              {SOURCES.map((source) => (
                <FragmentHead key={source.key} source={source} shown={shown} folded={folded} />
              ))}
            </tr>
          </thead>
          <tbody>
            {[...children, total].map((place) => {
              const row = three(place);
              return (
                <tr key={place.key || "total"} className={place.isTotal ? "font-bold" : "hover:bg-dash-bg/60"}>
                  <th scope="row" className={cn("sticky left-0 z-10 border-b border-r border-dash-line bg-dash-card px-4 py-1.5 text-left whitespace-nowrap text-dash-ink sm:pl-5", place.isTotal && "border-t-2 border-t-dash-ink")}>
                    {place.isTotal ? (
                      place.name
                    ) : level === "unit" ? (
                      <Link href={`/admin/irev/${election.id}/${place.unitId}`} className="font-semibold underline underline-offset-2">{place.name}</Link>
                    ) : (
                      <button type="button" onClick={() => onOpen(place.key)} className="font-semibold underline underline-offset-2">{place.name}</button>
                    )}
                    {!place.isTotal && level !== "state" && <span className="figure ml-2 text-[0.6875rem] font-normal text-dash-muted">{place.key}</span>}
                  </th>
                  {SOURCES.map((source) => (
                    <FragmentCells key={source.key} votes={row[source.key]} shown={shown} folded={folded} strong={place.isTotal} tint={source.tint} />
                  ))}
                  <td className={cn("border-b border-l border-dash-line px-3 py-1.5 text-right text-[0.75rem] whitespace-nowrap text-dash-muted", place.isTotal && "border-t-2 border-t-dash-ink")}>
                    {formatNumber(place.ours.returns)} returns · {formatNumber(place.sound)} sheets
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-3 text-[0.75rem] leading-relaxed text-dash-muted sm:px-5">
        An empty cell means that result does not exist for the place: INEC did not announce at that level, we hold no
        return there, or none of its sheets has been read yet. The three cover different numbers of polling units
        (shown under &ldquo;Made of&rdquo;), so a difference between two totals is first a difference in coverage. Whether
        they agree is judged only on the polling units both sides hold, and that is what colours the map.
        {whole.announced.places > 0 &&
          whole.announced.places < children.length &&
          ` The announced total is the sum of the ${formatNumber(whole.announced.places)} of ${formatNumber(children.length)} places INEC announced.`}
      </p>
    </div>
  );
}

function FragmentHead({ source, shown, folded }) {
  const cell = "border border-dash-line px-2.5 py-1 text-right text-[0.6875rem] font-bold text-dash-muted";
  return (
    <>
      {shown.map((party) => (
        <th key={party} className={cn(cell, source.tint)}>{party}</th>
      ))}
      {folded && <th className={cn(cell, source.tint)}>Others</th>}
      <th className={cn(cell, source.tint, "text-dash-ink")}>Total</th>
    </>
  );
}

function FragmentCells({ votes, shown, folded, strong, tint }) {
  const cell = cn("figure border border-dash-line px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap", strong && "border-t-2 border-t-dash-ink");
  if (!votes) {
    return (
      <>
        {shown.map((party) => <td key={party} className={cell} />)}
        {folded && <td className={cell} />}
        <td className={cn(cell, tint, "text-dash-muted")}>—</td>
      </>
    );
  }

  const all = sum(votes);
  const named = shown.reduce((total, party) => total + Number(votes[party] ?? 0), 0);
  return (
    <>
      {shown.map((party) => (
        <td key={party} className={cn(cell, "text-dash-ink")}>{formatNumber(votes[party] ?? 0)}</td>
      ))}
      {folded && <td className={cn(cell, "text-dash-muted")}>{formatNumber(all - named)}</td>}
      <td className={cn(cell, tint, "font-bold text-dash-ink")}>{formatNumber(all)}</td>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   NOTHING TO COMPARE YET — AND WHY, AND WHAT TO PRESS

   This section used to draw nothing at all when it had nothing, which on the
   screen is the same as not existing. Each reason it can be empty is a
   different sentence and, for three of them, a different button — pressed
   here, without leaving the room.
   ══════════════════════════════════════════════════════════════════════════ */

const WHY = {
  "not-gathered": (account) => ({
    says: `INEC's own sheets for this project (${account.election.name}) have not been gathered yet. Once they are, the map shows them against our returns, state by state down to the polling unit. Gathering carries on by itself while this room is open.`,
    action: gatherElection,
    election: account.election.id,
    press: "Gather INEC's sheets for this project",
  }),
  "not-listed": () => ({
    says: "The list of elections INEC has published has not been fetched yet. Fetching it finds this project's election on INEC's result portal.",
    action: refreshList,
    press: "Fetch INEC's list of elections",
  }),
  "not-opened": () => ({
    says: "The INEC results account in Data Bank has not been opened yet. Opening it also fetches the list of elections INEC has published.",
    action: refreshList,
    press: "Open it and fetch INEC's list",
  }),
  "no-election": () => ({
    says: "No single election on INEC's result portal matches this project's contest, year and state, so none has been tied to it. Choose the one to hold it against on the INEC results screen.",
    href: "/admin/irev",
    press: "Choose it on INEC results",
  }),
  "no-bank": () => ({
    says: "This deployment has no address for Data Bank's database, which is where INEC's sheets are kept. Whoever looks after the hosting needs to set it.",
  }),
  error: (account) => ({
    says: `INEC's sheets could not be read from Data Bank just now${account.message ? ` (${account.message})` : ""}. The rest of this screen is unaffected.`,
    href: "/admin/irev",
    press: "Open INEC results",
  }),
};

export function Nothing({ account }) {
  const why = (WHY[account.why] ?? WHY.error)(account);
  const button =
    "mt-3 inline-block rounded-dash-sm border border-dash-ink bg-dash-ink px-3.5 py-2 text-[0.8125rem] font-semibold text-white hover:border-red-600 hover:bg-red-600";

  return (
    <section className="rounded-dash border border-l-4 border-dash-line border-l-flag-500 bg-dash-card px-4 py-3.5">
      <h3 className="flex items-center gap-2 font-display text-[0.9375rem] font-extrabold text-dash-ink">
        <Landmark size={15} strokeWidth={2.25} />
        Against INEC&rsquo;s sheets
      </h3>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-dash-muted">{why.says}</p>
      {why.action ? (
        <form action={why.action}>
          {why.election && <input type="hidden" name="election" value={why.election} />}
          <Press className={button}>{why.press}</Press>
        </form>
      ) : why.href ? (
        <Link href={why.href} className={button}>{why.press}</Link>
      ) : null}
    </section>
  );
}
