"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, FileWarning, Loader2 } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

/**
 * What is wrong with what INEC published, counted and listed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PART OF VERIFICATION THAT NEEDS NOTHING BUT THE PORTAL
 *
 *  Holding INEC's sheets against our returns needs the sheets read and an
 *  agent of ours at the unit. This needs neither. It is the publishing
 *  itself: which polling units have no sheet at all, which sheets went up
 *  days after the poll, which were replaced, which the portal lists and are
 *  not there. For a past election that is every polling unit in the country
 *  the moment it is gathered. See lib/irev/faults.js.
 *
 *  ── ONE FAULT AT A TIME, AS A SHARE ─────────────────────────────────────
 *  Pick a fault and everything below answers for that one: the places under
 *  the one that is open, set in order of how much of each it touches, and the
 *  polling units behind the count. A share and not a tally, because Lagos
 *  has thirteen thousand polling units and Bayelsa two thousand, and the
 *  same count means very different things in each.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It fetches for itself (GET /api/irev/faults), so it can be set down on any
 * verification screen with nothing handed to it, and it draws nothing at all
 * where no election of INEC's has been gathered for the project.
 */

/** The four that are about publishing are always shown, even at nought. */
const ALWAYS = ["missing", "late", "replaced", "gone"];

const share = (count, of) => (of > 0 ? (count / of) * 100 : 0);
const percent = (value) => (value === 0 ? "0%" : value < 0.1 ? "under 0.1%" : `${value.toFixed(1)}%`);

const STEP_DOWN = { state: "State", lga: "Local government", ward: "Ward", unit: "Polling unit" };

export default function InecFaults({ className, initial = null }) {
  const [want, setWant] = useState({ under: "", kind: "missing" });
  /* `initial` is the country's account where the page already has it, so the
     panel is there on the first paint; without it the panel fetches. */
  const [got, setGot] = useState(initial?.children ? { asked: "|missing", account: initial } : null);
  const [failed, setFailed] = useState(false);

  const asked = `${want.under}|${want.kind}`;

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function fetchIt() {
      try {
        const query = new URLSearchParams({ under: want.under, kind: want.kind });
        const answer = await fetch(`/api/irev/faults?${query}`, { cache: "no-store" });
        const account = answer.ok ? await answer.json() : null;
        if (cancelled) return;
        setFailed(!answer.ok);
        if (answer.ok) setGot({ asked, account });
        /* While the election is still coming in, the counts are moving. */
        if (account?.election?.gathering) timer = setTimeout(fetchIt, 30000);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    fetchIt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [asked, want.under, want.kind]);

  const account = got?.account ?? null;
  const busy = got?.asked !== asked && !failed;

  /* The places one step down, the one the fault touches most at the top. */
  const ranked = useMemo(() => {
    if (!account?.children) return [];
    const kind = account.kind ?? "missing";
    return account.children
      .map((place) => ({ ...place, count: place.faults[kind] ?? 0, share: share(place.faults[kind] ?? 0, kind === "missing" ? place.units : Math.max(place.sheets, 1)) }))
      .sort((a, b) => b.share - a.share || b.count - a.count || a.name.localeCompare(b.name));
  }, [account]);

  if (!account?.children) return null;

  const { election, whole, words, crumbs, level, uploads, flags } = account;
  /* The single-sheet screens are the system console's. Nobody is offered a
     link they would be turned back from. */
  const sheets = Boolean(account.canOpenSheets);
  const kind = account.kind ?? "missing";
  const here = crumbs.at(-1);
  const shown = Object.keys(words).filter((name) => ALWAYS.includes(name) || whole.faults[name] > 0);
  /* A missing sheet is a share of the polling units; every other fault is
     something about a sheet, so it is a share of the sheets that are up. */
  const base = (name) => (name === "missing" ? whole.units : whole.sheets);
  const baseWord = (name) => (name === "missing" ? "polling units" : "sheets up");
  const top = Math.max(1, ...ranked.map((place) => place.share));
  const count = whole.faults[kind] ?? 0;

  const open = (under) => setWant((now) => ({ ...now, under }));
  const pick = (name) => setWant((now) => ({ ...now, kind: name }));

  return (
    <section className={cn("overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2", className)} aria-label="What is wrong with what INEC published">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-[1.0625rem] leading-snug font-bold tracking-[-0.01em] text-dash-ink">
            <FileWarning size={17} strokeWidth={2.25} className="shrink-0 text-red-600" />
            What INEC published, and what is wrong with it
          </h2>
          <p className="mt-0.5 max-w-3xl text-[0.8125rem] leading-snug text-dash-muted">
            {election.name}. Counted from INEC&rsquo;s own result portal for every polling unit it lists, before any
            sheet is read. Each of these is a fact about the publishing, not a finding against anybody.
          </p>
        </div>
        {(busy || failed) && (
          <p className={cn("flex items-center gap-1.5 text-[0.8125rem]", failed ? "text-red-600" : "text-dash-muted")}>
            {failed ? "That could not be fetched. It will be tried again when you pick something." : (<><Loader2 size={14} className="animate-spin" /> Adding up…</>)}
          </p>
        )}
      </header>

      {election.gathering && (
        <p className="mx-5 mb-4 flex items-start gap-2 rounded-dash-sm bg-dash-bg px-3.5 py-2.5 text-[0.8125rem] leading-snug text-dash-ink sm:mx-6">
          <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-dash-muted" />
          <span>
            Still being gathered from INEC&rsquo;s portal:{" "}
            {election.wards
              ? `${formatNumber(election.wards - election.wardsLeft)} of ${formatNumber(election.wards)} wards so far`
              : "the list of wards is being fetched"}
            {election.expected ? `, ${formatNumber(whole.units)} of ${formatNumber(election.expected)} polling units` : ""}. Every
            figure below is for what has come in, and grows as the rest does.
          </span>
        </p>
      )}

      {/* ══════════════════════════════════════════════════ where you are */}
      <nav aria-label="Place" className="flex flex-wrap items-center gap-1 border-t border-dash-line px-5 py-2.5 text-[0.8125rem] sm:px-6">
        {crumbs.map((crumb, index) => (
          <span key={crumb.key || "nigeria"} className="flex items-center gap-1">
            {index > 0 && <ChevronRight size={13} className="shrink-0 text-dash-muted" />}
            {index === crumbs.length - 1 ? (
              <span className="font-bold text-dash-ink">{crumb.name}</span>
            ) : (
              <button type="button" onClick={() => open(crumb.key)} className="font-semibold text-dash-muted underline underline-offset-2 hover:text-dash-ink">
                {crumb.name}
              </button>
            )}
          </span>
        ))}
        <span className="ml-auto text-dash-muted">
          <span className="figure font-bold text-dash-ink">{formatNumber(whole.units)}</span> polling units ·{" "}
          <span className="figure font-bold text-dash-ink">{formatNumber(whole.sheets)}</span> with a sheet up
          {whole.noVoters > 0 && <> · {formatNumber(whole.noVoters)} with no voters</>}
        </span>
      </nav>

      {/* ═══════════════════════════════════════════════ the faults, to pick */}
      <div role="group" aria-label="Which fault to look at" className="grid grid-cols-2 gap-px border-y border-dash-line bg-dash-line lg:grid-cols-4">
        {shown.map((name) => {
          const value = whole.faults[name] ?? 0;
          const on = name === kind;
          return (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              aria-pressed={on}
              title={words[name].what}
              className={cn(
                "px-4 py-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dash-ink sm:px-5",
                on ? "bg-dash-ink text-white" : "bg-dash-card hover:bg-dash-bg"
              )}
            >
              <span className={cn("block text-[0.75rem] font-medium", on ? "text-white/75" : "text-dash-muted")}>{words[name].label}</span>
              <span className={cn("figure mt-1 block text-[1.5rem] leading-none font-bold", on ? "text-white" : value > 0 ? "text-red-600" : "text-dash-ink")}>
                {formatNumber(value)}
              </span>
              <span className={cn("mt-1.5 block text-[0.75rem]", on ? "text-white/75" : "text-dash-muted")}>
                {percent(share(value, base(name)))} of {baseWord(name)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-5 pt-4 text-[0.875rem] leading-relaxed text-dash-ink sm:px-6">
        <strong className="font-bold">{words[kind].label}.</strong> {words[kind].what}
      </p>

      <div className="grid gap-x-8 gap-y-6 px-5 py-5 sm:px-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        {/* ═════════════════════════════════════ the places one step down */}
        <div className="min-w-0">
          <h3 className="text-[0.8125rem] font-bold text-dash-ink">
            {here.name}, by {STEP_DOWN[level].toLowerCase()}: the share with this fault
          </h3>
          {ranked.length === 0 ? (
            <p className="mt-3 text-[0.8125rem] text-dash-muted">INEC lists no polling unit here for this election.</p>
          ) : (
            <ol className="mt-3 max-h-[26rem] space-y-1.5 overflow-y-auto pr-2">
              {ranked.map((place) => (
                <li key={place.key} title={`${place.name}: ${formatNumber(place.count)} of ${formatNumber(kind === "missing" ? place.units : place.sheets)} ${baseWord(kind)}`}>
                  <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                    {level === "unit" && sheets ? (
                      <Link href={`/admin/irev/${election.id}/${place.unitId}`} className="min-w-0 truncate font-semibold text-dash-ink underline underline-offset-2">
                        {place.name}
                      </Link>
                    ) : level === "unit" ? (
                      <span className="min-w-0 truncate font-semibold text-dash-ink">{place.name}</span>
                    ) : (
                      <button type="button" onClick={() => open(place.key)} className="min-w-0 truncate text-left font-semibold text-dash-ink underline underline-offset-2">
                        {place.name}
                      </button>
                    )}
                    <span className="figure shrink-0 tabular-nums text-dash-muted">
                      <span className="font-bold text-dash-ink">{formatNumber(place.count)}</span>
                      {level !== "unit" && <> · {percent(place.share)}</>}
                    </span>
                  </div>
                  {level !== "unit" && (
                    <div className="mt-1 h-1.5 rounded-full bg-dash-bg">
                      <div className="h-1.5 rounded-full bg-dash-ink" style={{ width: `${(place.share / top) * 100}%`, minWidth: place.count > 0 ? "2px" : 0 }} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ═══════════════════════════════════════ when the sheets went up */}
        <div className="min-w-0">
          <h3 className="text-[0.8125rem] font-bold text-dash-ink">When the sheets in {here.name} went up</h3>
          {uploads ? <Uploads uploads={uploads} sheets={whole.sheets} lateFrom={election.lateFrom} /> : (
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
              The files of this election do not carry the time they went up, so there is nothing to draw here.
            </p>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════ the polling units behind the count */}
      <div className="border-t border-dash-line">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 sm:px-6">
          <h3 className="text-[0.8125rem] font-bold text-dash-ink">
            {words[kind].label} in {here.name}: <span className="figure">{formatNumber(count)}</span> polling unit{count === 1 ? "" : "s"}
          </h3>
          {count > 0 && (
            <span className="flex flex-wrap gap-2">
              <a
                href={`/api/irev/faults?${new URLSearchParams({ under: account.under, kind, download: "1" })}`}
                className="inline-flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 py-1.5 text-[0.8125rem] font-semibold text-dash-ink hover:border-dash-ink"
              >
                <Download size={14} /> Download all {formatNumber(count)} as a spreadsheet
              </a>
              {sheets && (
                <Link
                  href={`/admin/irev/${election.id}?${new URLSearchParams({ show: kind, ...(account.under ? { under: account.under } : {}) })}`}
                  className="inline-flex items-center rounded-dash-sm border border-dash-line px-3 py-1.5 text-[0.8125rem] font-semibold text-dash-ink hover:border-dash-ink"
                >
                  Page through them all
                </Link>
              )}
            </span>
          )}
        </div>

        {flags.length === 0 ? (
          <p className="px-5 py-4 text-[0.8125rem] text-dash-muted sm:px-6">
            {busy ? "Looking…" : `No polling unit in ${here.name} has this fault among what has been gathered.`}
          </p>
        ) : (
          <>
            <ul className="mt-3 max-h-[24rem] divide-y divide-dash-line overflow-y-auto border-t border-dash-line">
              {flags.map((flag) => (
                <li key={flag.unitCode} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-[0.8125rem] sm:px-6">
                  <span className="min-w-0 flex-1">
                    <span className="figure font-bold text-dash-ink">{flag.unitCode}</span>
                    <span className="ml-2 text-dash-ink">{flag.name}</span>
                    {flag.where && <span className="ml-2 text-dash-muted">{flag.where}</span>}
                    <span className="mt-0.5 block text-dash-muted">{flag.what.join(" · ")}</span>
                  </span>
                  {sheets && (
                    <Link href={`/admin/irev/${election.id}/${flag.unitId}`} className="shrink-0 font-semibold text-dash-ink underline underline-offset-2">
                      Open the polling unit
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            {count > flags.length && (
              <p className="border-t border-dash-line px-5 py-2.5 text-[0.75rem] text-dash-muted sm:px-6">
                The first {formatNumber(flags.length)} of {formatNumber(count)}. Open a place above to narrow them, or
                download them all.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * How many sheets went up on each step from polling day, as bars.
 *
 * One measure, so one colour: the product's navy. The steps that count as
 * late carry the word beside them and are drawn in the brand red, which here
 * means what it means everywhere else on the dashboards.
 */
function Uploads({ uploads, sheets, lateFrom }) {
  const top = Math.max(1, ...uploads.steps.map((step) => step.sheets));
  const late = uploads.steps.filter((step) => step.late).reduce((sum, step) => sum + step.sheets, 0);
  const untimed = Math.max(0, sheets - uploads.timed);

  return (
    <>
      <ul className="mt-3 space-y-2">
        {uploads.steps.map((step) => {
          const flagged = step.late || step.odd;
          return (
            <li key={step.key} title={`${step.label}: ${formatNumber(step.sheets)} sheets, ${percent(share(step.sheets, uploads.timed))} of those with a time`}>
              <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                <span className="text-dash-ink">
                  {step.label}
                  {flagged && <span className="ml-2 text-[0.6875rem] font-bold text-red-600">{step.odd ? "before the poll" : "late"}</span>}
                </span>
                <span className="figure shrink-0 tabular-nums text-dash-muted">
                  <span className="font-bold text-dash-ink">{formatNumber(step.sheets)}</span> · {percent(share(step.sheets, uploads.timed))}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-dash-bg">
                <div
                  className={cn("h-2 rounded-full", flagged ? "bg-red-500" : "bg-dash-ink")}
                  style={{ width: `${(step.sheets / top) * 100}%`, minWidth: step.sheets > 0 ? "2px" : 0 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[0.75rem] leading-relaxed text-dash-muted">
        {formatNumber(late)} of the {formatNumber(uploads.timed)} sheets with a time on them
        ({percent(share(late, uploads.timed))}) went up {lateFrom} or more days after polling day; the last one {formatNumber(uploads.lastDay)} days
        after. The time is the one INEC&rsquo;s own system put in each file&rsquo;s name when it received it, on a Lagos
        calendar.{untimed > 0 && ` ${formatNumber(untimed)} sheet${untimed === 1 ? " carries" : "s carry"} no time.`}
      </p>
    </>
  );
}
