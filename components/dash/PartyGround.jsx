"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Users, Vote } from "lucide-react";

import { MiniMap, Panel } from "./Figures";
import { PARTY_FILL } from "./Charts";
import {
  TIER_LABEL,
  childTier,
  childrenOf,
  coverage,
  coveredStates,
  membersAt,
  qualityOf,
  registerFor,
  votesAt,
} from "@/lib/members";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Party strength on the ground: members and votes, from a state to a booth.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TWO MEASURES ARE NEVER ADDED UP, AND THIS SCREEN SAYS WHY
 *
 *  A member is somebody who filled in a form. A vote is a mark on a ballot,
 *  counted. They are two different measurements of two different things, and
 *  the temptation to read the first as a forecast of the second is the single
 *  most expensive mistake available on this screen.
 *
 *  The Sokoto register makes the point better than any argument: it holds
 *  66,474 ADC members, and 1,900 of them are recorded as under eighteen. A
 *  campaign that plans 66,474 votes against it has already counted nineteen
 *  hundred people who cannot lawfully cast one.
 *
 *  So the two run in two columns, with their own headings, and there is no
 *  third column combining them. See lib/members.js, which has no field that
 *  could produce one.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT THIS DEPLOYMENT ACTUALLY HOLDS ────────────────────────────────────
 *   MEMBERS  one real register: ADC, Sokoto, to polling-unit level. Every
 *            other party shows a dash, because "no register imported" and
 *            "no members there" are different statements and a zero says the
 *            wrong one.
 *   VOTES    every party, by STATE. No by-local-government vote table is
 *            published for any Nigerian election in the sources this product
 *            holds, so below a state the vote column says so rather than
 *            dividing a state total by its wards.
 *
 * Both absences are drawn as absences. A screen that filled either of them in
 * would be inventing the exact figure a campaign would plan against.
 */

/* The parties this screen offers. Registers are keyed independently of the
   ballot, because a party can have a register and no separate vote line — the
   ADC's 2023 presidential vote sits inside the "other" column — and a party
   can have a vote line and no register, which is every other one here. */
const OFFERED = [
  { id: "ADC", name: "African Democratic Congress" },
  { id: "APC", name: "All Progressives Congress" },
  { id: "PDP", name: "Peoples Democratic Party" },
  { id: "LP", name: "Labour Party" },
  { id: "NNPP", name: "New Nigeria Peoples Party" },
];

export default function PartyGround({ shapes = null }) {
  const [party, setParty] = useState("ADC");
  /* Which state the register is being read in, and how deep. The state is
     part of the path because a register belongs to one state and the product
     may hold several. */
  const [stateCode, setStateCode] = useState("SOK");
  const [path, setPath] = useState([]);

  const held = useMemo(() => coverage(), []);
  const register = registerFor(party, stateCode);
  const quality = useMemo(() => qualityOf(party, stateCode), [party, stateCode]);

  const rows = useMemo(() => childrenOf(party, stateCode, path), [party, stateCode, path]);
  const members = membersAt(party, stateCode, path);
  const votes = votesAt(party, stateCode, path);

  const nextTier = childTier(path);
  const canDrill = path.length < 3;

  /* The whole state, and where its members are, for the map. Only states with
     a register are coloured — the rest are left blank, which is what "nobody
     has counted them" looks like. */
  const covered = coveredStates(party);

  const crumbs = [
    { label: register?.state ?? stateCode, at: [] },
    ...path.map((name, index) => ({ label: name, at: path.slice(0, index + 1) })),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* ══════════════════════════════════════════════ what this screen is for */}
      <section className="rounded-dash border-l-4 border-l-dash-ink bg-dash-card px-5 py-4">
        <h1 className="font-display text-[1.125rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink">
          Where a party actually is
        </h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-dash-muted">
          Members from the party&rsquo;s own register, and votes from the published result, side by
          side from a state down to a single polling unit.{" "}
          <strong className="font-semibold text-dash-ink">They are never added together</strong> — a
          member filled in a form, a vote was counted, and one is not a forecast of the other.
        </p>
      </section>

      {/* ───────────────────────────────────────────────────────── the choosers */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-dash border border-dash-line bg-dash-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Party
          </span>
          <div className="flex flex-wrap gap-1">
            {OFFERED.map((item) => {
              const has = coveredStates(item.id).length > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setParty(item.id);
                    setPath([]);
                  }}
                  title={
                    has
                      ? `${item.name} — membership register loaded`
                      : `${item.name} — no membership register has been imported`
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-bold transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                    item.id === party
                      ? "text-white"
                      : "border border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                  )}
                  style={
                    item.id === party
                      ? { background: PARTY_FILL[item.id] ?? "var(--color-dash-ink)" }
                      : undefined
                  }
                >
                  {/* A dot only where a register exists, so the picker itself
                      says which parties this deployment can answer for. */}
                  {has && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        item.id === party ? "bg-white/80" : "bg-emerald-500"
                      )}
                    />
                  )}
                  {item.id}
                </button>
              );
            })}
          </div>
        </div>

        {held.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              State
            </span>
            <select
              value={stateCode}
              onChange={(event) => {
                setStateCode(event.target.value);
                setPath([]);
              }}
              className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
            >
              {held.map((row) => (
                <option key={row.stateCode} value={row.stateCode}>
                  {row.state}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="ml-auto text-[0.75rem] text-dash-muted">
          {held.length === 1
            ? `One register loaded: ${held[0].party} in ${held[0].state}, ${formatNumber(held[0].members)} members across ${formatNumber(held[0].units)} polling units.`
            : `${held.length} registers loaded.`}
        </p>
      </div>

      {!register ? (
        /* ── AN ABSENCE DRAWN AS AN ABSENCE ────────────────────────────────
            Not an empty table and not a row of zeroes. A party with no
            register is a party nobody has counted, and saying that plainly is
            the difference between a campaign ignoring a rival who is not
            there and ignoring a rival nobody has looked for. */
        <section className="rounded-dash border border-dash-line bg-dash-card px-6 py-12 text-center">
          <Users size={24} strokeWidth={2} className="mx-auto text-dash-muted" />
          <p className="mt-3 text-[1rem] font-bold text-dash-ink">
            No {party} membership register has been imported
          </p>
          <p className="mx-auto mt-2 max-w-prose text-[0.875rem] leading-relaxed text-dash-muted">
            That is not the same as the {party} having no members here — it means nobody has counted
            them into this product. The figure is left blank rather than drawn at nought, because a
            zero on this screen would be read as a rival who is not there.
          </p>
          <p className="mx-auto mt-3 max-w-prose text-[0.8125rem] leading-relaxed text-dash-muted">
            A register arrives as a PDF and is imported by{" "}
            <span className="figure">scripts/import-register.py</span>, which keeps the counts and
            discards every name, telephone number and identification number in it.
          </p>

          {/* The vote is a different measurement and this product does hold
              it, so the screen still answers half the question. */}
          {votes.known && (
            <p className="mt-5 border-t border-dash-line pt-4 text-[0.875rem] text-dash-ink">
              What is known: {party} took{" "}
              <strong className="figure font-bold">{formatNumber(votes.votes)}</strong> votes in{" "}
              {held[0]?.state ?? stateCode} at the 2023 presidential election —{" "}
              {formatShare(votes.share)} of the {formatNumber(votes.of)} cast.
            </p>
          )}
        </section>
      ) : (
        <>
          {/* ══════════════════════════════════════════════════ where you are */}
          <nav
            aria-label="Where you are"
            className="flex flex-wrap items-center gap-1 rounded-dash border border-dash-line bg-dash-card px-4 py-2.5"
          >
            {crumbs.map((crumb, index) => (
              <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-dash-muted" />}
                <button
                  type="button"
                  onClick={() => setPath(crumb.at)}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    index === crumbs.length - 1
                      ? "text-dash-ink"
                      : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <span className="ml-auto text-[0.75rem] text-dash-muted">
              {TIER_LABEL[childTier(path)]}
              {canDrill ? "s below" : ""}
            </span>
          </nav>

          {/* ══════════════════════════════════════ the two measures, side by side */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel
              title={`${party} members here`}
              figure={members === null ? "—" : formatNumber(members)}
              foot={
                path.length === 0
                  ? `The whole ${register.state} register.`
                  : `In ${path[path.length - 1]}.`
              }
            >
              <p className="flex items-center gap-2 text-[0.8125rem] text-dash-muted">
                <Users size={14} strokeWidth={2.5} className="shrink-0" />
                People who filled in a membership form. Not a vote, and not a promise of one.
              </p>
            </Panel>

            <Panel
              title={`${party} votes here`}
              figure={votes.known ? formatNumber(votes.votes) : "—"}
              foot={
                votes.known
                  ? `${formatShare(votes.share)} of the ${formatNumber(votes.of)} cast, 2023 presidential.`
                  : votes.why === "below-state"
                    ? "No published vote exists below a state."
                    : votes.why === "in-other"
                      ? `${party} is inside the "other" column of the 2023 state table.`
                      : "Not held."
              }
            >
              {votes.known ? (
                <p className="flex items-center gap-2 text-[0.8125rem] text-dash-muted">
                  <Vote size={14} strokeWidth={2.5} className="shrink-0" />
                  Marks on ballots, counted and declared.
                </p>
              ) : (
                <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-dash-muted">
                  <AlertTriangle size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
                  {votes.why === "below-state" ? (
                    <>
                      No Nigerian election publishes a vote table below the state, so this is not a
                      figure that exists to be looked up. Dividing {register.state}&rsquo;s total
                      among its wards would look precise and be invented.
                    </>
                  ) : votes.why === "in-other" ? (
                    <>
                      The 2023 state table has four parties and one bucket. {party} contested and
                      its vote is inside that bucket, undivided —{" "}
                      {formatNumber(votes.bucket)} votes shared with every other minor party.
                    </>
                  ) : (
                    <>Not held for this place.</>
                  )}
                </p>
              )}
            </Panel>
          </div>

          {/* ═══════════════════════════════════════════ the drill, and the map */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
            <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
                <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                  {TIER_LABEL[nextTier]}s in {crumbs[crumbs.length - 1].label}
                </h2>
                <p className="text-[0.8125rem] text-dash-muted">
                  {formatNumber(rows.length)} · share is of{" "}
                  {crumbs[crumbs.length - 1].label}, not of the state
                </p>
              </header>

              {rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-[0.875rem] text-dash-muted">
                  {path.length >= 3
                    ? "A polling unit is as deep as a register goes."
                    : "Nothing recorded below here."}
                </p>
              ) : (
                <ul className="divide-y divide-dash-line">
                  {rows.map((row) => {
                    const Tag = canDrill ? "button" : "div";
                    return (
                      <li key={row.name}>
                        <Tag
                          {...(canDrill
                            ? { type: "button", onClick: () => setPath([...path, row.name]) }
                            : {})}
                          className={cn(
                            "flex w-full items-center gap-4 px-5 py-2.5 text-left",
                            canDrill && "transition-colors hover:bg-dash-bg"
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.875rem] font-semibold text-dash-ink">
                              {row.name}
                            </span>
                            {/* The bar is the picture; the figure beside it is
                                the answer. Scaled to the biggest in this list
                                so a ward's shape is readable against its own
                                neighbours rather than against Sokoto South. */}
                            <span
                              aria-hidden="true"
                              className="mt-1 block h-1.5 rounded-full bg-dash-bg"
                            >
                              <span
                                className="block h-full rounded-full transition-[width] duration-500"
                                style={{
                                  width: `${(row.members / (rows[0]?.members || 1)) * 100}%`,
                                  background: PARTY_FILL[party] ?? "var(--color-dash-ink)",
                                }}
                              />
                            </span>
                          </span>

                          <span className="shrink-0 text-right">
                            <span className="figure block text-[0.9375rem] font-bold text-dash-ink tabular-nums">
                              {formatNumber(row.members)}
                            </span>
                            <span className="figure block text-[0.6875rem] text-dash-muted tabular-nums">
                              {formatShare(row.share)}
                            </span>
                          </span>

                          {canDrill && (
                            <ChevronRight size={15} className="shrink-0 text-dash-muted" />
                          )}
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="flex flex-col gap-3">
              <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
                <header className="border-b border-dash-line px-4 py-3">
                  <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
                    Where a register exists
                  </h3>
                </header>
                <div className="px-3 py-3">
                  {shapes ? (
                    <MiniMap
                      shapes={shapes}
                      fills={Object.fromEntries(
                        covered.map((code) => [code, PARTY_FILL[party] ?? "var(--color-dash-ink)"])
                      )}
                      notes={Object.fromEntries(
                        held.map((row) => [row.stateCode, `${formatNumber(row.members)} members`])
                      )}
                      height={200}
                    />
                  ) : (
                    <p className="px-4 py-8 text-center text-[0.875rem] text-dash-muted">
                      No map for this contest.
                    </p>
                  )}
                </div>
                <footer className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
                  A blank state is one no register covers, not one with no members. The two look
                  identical on a map that colours both, which is why this one does not.
                </footer>
              </section>

              {/* ── WHAT IS WRONG WITH THE REGISTER ──────────────────────────
                  Sixty-six thousand names look authoritative and a campaign
                  will plan against the total. It should learn here, and not
                  from a journalist, that nineteen hundred of them are too
                  young to vote. */}
              {quality && quality.notes.length > 0 && (
                <section className="overflow-hidden rounded-dash border border-amber-200 bg-amber-50">
                  <header className="flex items-baseline justify-between gap-3 border-b border-amber-200 px-4 py-3">
                    <h3 className="font-display text-[0.875rem] font-extrabold text-amber-900">
                      About this register
                    </h3>
                    <span className="figure text-[0.75rem] font-bold text-amber-900 tabular-nums">
                      {formatNumber(quality.votingAge)} of voting age
                    </span>
                  </header>
                  <ul className="divide-y divide-amber-200/70">
                    {quality.notes.map((note) => (
                      <li key={note.id} className="px-4 py-2.5">
                        <p className="text-[0.8125rem] leading-snug font-semibold text-amber-900">
                          {note.says}
                        </p>
                        <p className="mt-0.5 text-[0.75rem] leading-relaxed text-amber-800">
                          {note.why}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <footer className="border-t border-amber-200 px-4 py-2.5 text-[0.75rem] leading-relaxed text-amber-800">
                    None of these is an accusation. A repeated identification number is far more
                    often a typing error at registration than anything else.
                  </footer>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
