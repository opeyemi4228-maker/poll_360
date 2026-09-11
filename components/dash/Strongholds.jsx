"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, Layers, Loader2, MapPin, Scale, Sliders } from "lucide-react";

import { MiniMap, Panel, Ranked, Readout, Split } from "./Figures";
import { PARTY_FILL } from "./Charts";
import PartyMark from "./PartyMark";
import {
  COUNTED_STATES,
  ELECTIONS,
  MAPPABLE,
  NATIONAL_ONLY,
  STRONGHOLD,
  bandOf,
  biggest,
  bucketOf,
  carriedBy,
  concentration,
  electionOf,
  modelState,
  numberOf,
  runsOf,
  scenario,
  stateSeries,
  tally,
  unitsOfWard,
  winnerOf,
} from "@/lib/strongholds";
import { MODELLED } from "@/lib/data/units-modelled";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Strongholds: where a candidate's vote actually lives, down to the booth.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE THING TO UNDERSTAND BEFORE READING ANY NUMBER HERE
 *
 *  Two tiers, never blended, and the screen says which it is drawing at every
 *  level:
 *
 *    COUNTED   Who carried each state, in the five elections that published a
 *              state table. The national totals for 2007 and 2011, which
 *              published none. Every ward and booth by its real name and INEC
 *              code. And — for Anambra 2023 alone — the actual votes cast in
 *              3,679 named polling units, transcribed from Form EC8A.
 *
 *    MODELLED  Every other vote figure below a state. The published state
 *              total apportioned across that state's real wards and booths, so
 *              the parts always sum back to what INEC declared.
 *
 *  A modelled stronghold answers "what shape does a state of this composition
 *  have", which is the question a scenario needs. It is not evidence about a
 *  named booth. The band beside every panel says which tier it came from, and
 *  that band is not decoration — it is the difference between a plan and a
 *  claim.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* The candidates worth offering. Everybody with more than one run, plus the
   two who won on their only one — a list of every name ever on a ballot would
   be forty entries long and mostly people who polled four figures. */
const OFFERED = [
  "Atiku Abubakar",
  "Muhammadu Buhari",
  "Olusegun Obasanjo",
  "Goodluck Jonathan",
  "Bola Ahmed Tinubu",
  "Peter Obi",
];

export default function Strongholds({ shapes }) {
  const [who, setWho] = useState("Atiku Abubakar");
  const [picked, setYear] = useState(2023);
  const [swing, setSwing] = useState(0);
  const [turnoutShift, setTurnoutShift] = useState(0);
  const [basis, setBasis] = useState("result");
  const [open, setOpen] = useState(null);

  const runs = useMemo(() => runsOf(who), [who]);
  const readable = useMemo(() => runs.filter((run) => run.mappable), [runs]);

  /* ── THE YEAR IS DERIVED, NOT STORED AND THEN CORRECTED ────────────────
     Only elections this candidate actually contested, and that published a
     state table, can be drawn — offering 2011 for Atiku would be offering an
     election he did not stand in. Switching candidate therefore often makes
     the held year invalid.

     Done by falling back here rather than by an effect that writes the state
     back: an effect would render once with a year this candidate never
     contested, and every panel below would compute against it before the
     correction landed. */
  const run =
    readable.find((entry) => entry.year === picked) ?? readable.at(-1) ?? null;
  const year = run?.year ?? picked;
  const party = run?.party ?? null;
  const election = electionOf(year);
  const slot = election ? election.parties.findIndex((entry) => entry.id === party) : -1;

  return (
    <div className="space-y-4">
      <Ballot who={who} onWho={setWho} runs={runs} />

      <Tiers />

      <Runs runs={runs} year={year} onYear={setYear} />

      <Nation year={year} party={party} shapes={shapes} onOpen={setOpen} open={open} />

      <Consistency who={who} shapes={shapes} runs={readable} onOpen={setOpen} open={open} />

      <Years shapes={shapes} party={party} />

      <Scenario
        year={year}
        slot={slot}
        party={party}
        swing={swing}
        onSwing={setSwing}
        turnoutShift={turnoutShift}
        onTurnout={setTurnoutShift}
        basis={basis}
        onBasis={setBasis}
      />

      <Ground
        open={open}
        onOpen={setOpen}
        year={year}
        slot={slot}
        party={party}
        swing={basis === "scenario" ? swing : 0}
        turnoutShift={basis === "scenario" ? turnoutShift : 0}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ ballot */

function Ballot({ who, onWho, runs }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {OFFERED.map((name) => {
        const count = runsOf(name).length;
        const on = name === who;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onWho(name)}
            className={cn(
              "rounded-dash-sm border px-3 py-2 text-left text-[0.8125rem] leading-tight transition-colors",
              on
                ? "border-ink-950 bg-ink-950 text-white"
                : "border-dash-line bg-dash-card text-dash-ink hover:border-ink-950"
            )}
          >
            <span className="block font-bold">{name}</span>
            <span className={cn("figure text-[0.6875rem]", on ? "text-white/70" : "text-dash-muted")}>
              {count} run{count === 1 ? "" : "s"}
            </span>
          </button>
        );
      })}
      <span className="figure ml-auto text-[0.75rem] text-dash-muted">
        {runs.length} on the ballot · {runs.filter((run) => run.mappable).length} mappable
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════ tiers */

/**
 * What is counted and what is drawn, said once, at the top.
 *
 * ── SHORT, BECAUSE A CAVEAT NOBODY READS IS NOT A CAVEAT ───────────────────
 * Three lines. The long version lives in the module this screen reads from;
 * what a person standing in front of the board needs is which of the three
 * tiers the number they are looking at came from, and the same three words
 * appear as a tag on every panel below.
 */
function Tiers() {
  const counted = COUNTED_STATES[0];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tier
        tone="good"
        label="Counted"
        head="5 of 7 elections, by state"
        body="1999, 2003, 2015, 2019 and 2023 published a table by state. Every ward and booth here is real, by INEC's own code."
      />
      <Tier
        tone="warn"
        label="Counted, one state"
        head={`${formatNumber(counted.units)} booths in ${counted.name}`}
        body={`Actual votes, transcribed from Form EC8A — ${formatShare(counted.coverage)} of the state. The only unit-level figures that exist anywhere.`}
      />
      <Tier
        tone="alert"
        label="Modelled"
        head="Every other booth"
        body="The declared state total, apportioned across real wards and booths. Sums back to INEC's figure. Not evidence about a named booth."
      />
    </div>
  );
}

function Tier({ tone, label, head, body }) {
  const edge = {
    good: "border-l-emerald-500",
    warn: "border-l-amber-500",
    alert: "border-l-ink-400",
  }[tone];

  return (
    <div className={cn("rounded-dash border border-dash-line border-l-2 bg-dash-card p-4", edge)}>
      <p className="text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-[0.9375rem] font-extrabold text-dash-ink">{head}</p>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-dash-muted">{body}</p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════ runs */

/**
 * The candidate's own elections, and the ones that cannot be drawn.
 *
 * ── THE FINDING THIS PANEL EXISTS FOR ──────────────────────────────────────
 * "Since 2007" sounds like six elections. For Atiku it is three, and one of
 * them he fought for a different party against the one he now leads. A screen
 * that quietly mapped the PDP's column onto him would credit him with
 * Yar'Adua's 2007 and Jonathan's 2011 and 2015 — two elections he did not
 * contest and one he contested against.
 */
function Runs({ runs, year, onYear }) {
  if (runs.length === 0) {
    return (
      <Panel title="On the ballot">
        <p className="text-[0.875rem] text-dash-muted">
          This candidate does not appear on a presidential ballot in the record.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="On the ballot"
      figure={`${runs.length} run${runs.length === 1 ? "" : "s"}`}
      foot="Read off the ballot, not off a party column. A candidate's record and a party's record are not the same thing."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {runs.map((run) => {
          const on = run.year === year;
          return (
            <button
              key={run.year}
              type="button"
              disabled={!run.mappable}
              onClick={() => onYear(run.year)}
              className={cn(
                "rounded-dash-sm border p-3 text-left transition-colors",
                !run.mappable
                  ? "cursor-not-allowed border-dashed border-dash-line bg-dash-well/50"
                  : on
                    ? "border-ink-950 bg-ink-950/[0.03]"
                    : "border-dash-line hover:border-ink-950"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="figure text-[1.25rem] font-extrabold text-dash-ink">{run.year}</span>
                <PartyMark party={run.party} />
              </span>
              <span className="figure mt-1 block text-[1.0625rem] font-bold text-dash-ink">
                {run.votes === null ? "—" : formatNumber(run.votes)}
              </span>
              <span className="mt-1 block text-[0.75rem] leading-relaxed text-dash-muted">
                {run.mappable
                  ? `${run.partyName} · maps to 37 states`
                  : /* Stated on the card rather than left as a disabled
                       control with no explanation. */
                    `${run.partyName} · no state table was published`}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════════════════════════════════════════ nation */

/** How much of the register sits in the largest booths. The cuts the model holds. */
const CUT_LABEL = { 0.05: "Largest 5%", 0.1: "Largest 10%", 0.25: "Largest quarter", 0.5: "Largest half" };

/**
 * The whole country, booth by booth.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE HEADLINE NUMBER ON THIS PANEL IS MODELLED, AND IT SAYS SO TWICE
 *
 *  "N booths carried" is not a count of booths. Nobody holds one: INEC
 *  published 167,443 photographs of Form EC8A for 2023 and no table, and the
 *  only transcription anyone has made covers 3,679 booths in one state.
 *
 *  What this is: the declared state totals apportioned across all 176,623 real
 *  booths, so the parts sum back to INEC's figures and the distribution has the
 *  shape a country of that composition has. That makes it a planning
 *  instrument — how many places a campaign has to defend, and how concentrated
 *  the register is — and it makes it useless as evidence about any one booth.
 *
 *  So the figure is prefixed "about", the tag says modelled, and the footnote
 *  says why. None of those three is decoration.
 * ══════════════════════════════════════════════════════════════════════════
 */
function Nation({ year, party, shapes, onOpen, open }) {
  const [cut, setCut] = useState(0.1);

  const block = MODELLED[year] ?? null;
  const slot = block ? block.slots.indexOf(party) : -1;

  const figures = useMemo(() => {
    if (!block || slot < 0) return null;

    let booths = 0;
    let carried = 0;
    let counted = 0;
    let register = 0;
    let inBiggest = 0;

    for (const state of block.states) {
      booths += state.units;
      carried += state.won[slot];
      counted += state.counted;
      register += state.registered;
      const band = state.concentration.find((entry) => entry.cut === cut);
      if (band) inBiggest += (band.share / 100) * state.registered;
    }

    return {
      booths,
      carried,
      counted,
      register,
      /* Weighted by each state's own register rather than averaged across
         states — a mean of 37 percentages would give Bayelsa the same say as
         Kano, and the whole question here is where the voters are. */
      biggestShare: register > 0 ? (inBiggest / register) * 100 : 0,
      biggestBooths: Math.round(booths * cut),
    };
  }, [block, slot, cut]);

  const fills = useMemo(() => {
    if (!block || slot < 0) return {};
    const index = {};
    for (const state of block.states) {
      const share = state.units > 0 ? (state.won[slot] / state.units) * 100 : null;
      index[state.code] = bandOf(share)?.fill ?? "var(--color-ink-050)";
    }
    return index;
  }, [block, slot]);

  const notes = useMemo(() => {
    if (!block || slot < 0) return {};
    const index = {};
    for (const state of block.states) {
      const share = state.units > 0 ? (state.won[slot] / state.units) * 100 : 0;
      index[state.code] =
        `about ${formatNumber(state.won[slot])} of ${formatNumber(state.units)} booths · ${formatShare(share)}` +
        (state.counted > 0 ? ` · ${formatNumber(state.counted)} transcribed` : "");
    }
    return index;
  }, [block, slot]);

  const leaders = useMemo(() => {
    if (!block || slot < 0) return [];
    return [...block.states]
      .map((state) => ({ label: state.code, value: state.won[slot] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [block, slot]);

  if (!figures) return null;

  return (
    <Panel
      title="Every booth in the country"
      figure={`about ${formatNumber(figures.carried)}`}
      foot={`Modelled. There is no published table of Nigerian presidential results by polling unit for any year — INEC published photographs of ${formatNumber(167443)} result sheets for 2023 and no figures. These are the declared state totals apportioned across all ${formatNumber(figures.booths)} real booths, summing back to what INEC declared. ${formatNumber(figures.counted)} of them are an actual transcription.`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tag tone="alert">Modelled booths</Tag>
        <Tag tone="good">{`${formatNumber(figures.counted)} counted`}</Tag>
        <Tag tone="neutral">{`${year} · ${party}`}</Tag>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <MiniMap shapes={shapes} fills={fills} notes={notes} height={420} selected={open} onOpen={onOpen} />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Readout
              label="Booths carried"
              value={`~${formatNumber(figures.carried)}`}
              sub={`of ${formatNumber(figures.booths)}`}
              tone="alert"
            />
            <Readout
              label="Share of booths"
              value={formatShare((figures.carried / figures.booths) * 100)}
              sub="places, not votes"
            />
          </div>

          {/* ── WHERE THE VOTERS ACTUALLY ARE ──────────────────────────────
              The planning question behind "the biggest polling units": if a
              tenth of the booths hold a third of the register, a campaign that
              can only reach a fraction of the country knows which fraction. */}
          <div>
            <Heading icon={Scale}>Where the register sits</Heading>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {Object.keys(CUT_LABEL).map((key) => {
                const value = Number(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCut(value)}
                    className={cn(
                      "rounded-dash-sm border px-2.5 py-1.5 text-[0.75rem] font-bold transition-colors",
                      value === cut
                        ? "border-ink-950 bg-ink-950 text-white"
                        : "border-dash-line text-dash-muted hover:border-ink-950"
                    )}
                  >
                    {CUT_LABEL[key]}
                  </button>
                );
              })}
            </div>
            <p className="text-[0.875rem] leading-relaxed text-dash-muted">
              The largest{" "}
              <span className="figure font-bold text-dash-ink">
                {formatNumber(figures.biggestBooths)}
              </span>{" "}
              booths hold{" "}
              <span className="figure font-bold text-dash-ink">
                {formatShare(figures.biggestShare)}
              </span>{" "}
              of the national register.
            </p>
          </div>

          <div>
            <Heading icon={Crosshair}>Most booths carried</Heading>
            <Ranked rows={leaders} showShare={false} empty="No booths carried." />
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════ consistency */

/** How many of the candidate's readable runs each state carried. */
function Consistency({ who, shapes, runs, onOpen, open }) {
  const rows = useMemo(() => {
    const out = [];
    for (const election of MAPPABLE) {
      for (const row of election.rows) {
        if (!out.some((entry) => entry.code === row.code)) out.push({ code: row.code });
      }
    }
    return out.map((entry) => ({ ...entry, record: carriedBy(entry.code, who) }));
  }, [who]);

  const of = runs.length;

  const fills = useMemo(() => {
    const index = {};
    for (const row of rows) {
      const { carried, of: checked, streak } = row.record;
      index[row.code] =
        checked === 0
          ? "var(--color-ink-050)"
          : carried === checked && streak === checked
            ? "var(--color-ink-950)"
            : carried > 0
              ? "var(--color-ink-400)"
              : "var(--color-ink-100)";
    }
    return index;
  }, [rows]);

  const notes = useMemo(() => {
    const index = {};
    for (const row of rows) {
      const { carried, of: checked, streak } = row.record;
      index[row.code] =
        checked === 0
          ? "Nothing readable for this state"
          : `Carried ${carried} of ${checked}${streak === checked && checked > 0 ? " · never lost it" : streak ? ` · holding a run of ${streak}` : " · not held now"}`;
    }
    return index;
  }, [rows]);

  const always = rows.filter((row) => row.record.always);
  const never = rows.filter((row) => row.record.of > 0 && row.record.carried === 0);

  return (
    <Panel
      title="Where the vote has stayed"
      figure={`${always.length} of ${rows.length}`}
      foot={
        of > 0
          ? `Across ${of} readable run${of === 1 ? "" : "s"}. 2007 and 2011 published no state table, so no state can be checked for them.`
          : "This candidate has no run that can be drawn on a map."
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <MiniMap
          shapes={shapes}
          fills={fills}
          notes={notes}
          height={420}
          selected={open}
          onOpen={onOpen}
        />

        <div className="space-y-3">
          <Legend
            items={[
              { fill: "var(--color-ink-950)", label: "Carried every time", count: always.length },
              {
                fill: "var(--color-ink-400)",
                label: "Carried some of the time",
                count: rows.length - always.length - never.length,
              },
              { fill: "var(--color-ink-100)", label: "Never carried", count: never.length },
            ]}
          />

          <Ranked
            rows={always
              .map((row) => ({ label: row.code, value: row.record.carried }))
              .slice(0, 12)}
            empty="No state has been carried in every readable run."
            showShare={false}
          />
        </div>
      </div>
    </Panel>
  );
}

function Legend({ items }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2.5 text-[0.8125rem]">
          <span
            className="size-3 shrink-0 rounded-[3px] border border-dash-line"
            style={{ background: item.fill }}
            aria-hidden="true"
          />
          <span className="text-dash-ink">{item.label}</span>
          <span className="figure ml-auto font-bold text-dash-ink">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

/* ════════════════════════════════════════════════════════════════════ years */

/** One map per election, so a reader sees the country change. */
function Years({ shapes, party }) {
  return (
    <Panel
      title="Every election, side by side"
      figure={`${MAPPABLE.length} mapped`}
      foot={`${NATIONAL_ONLY.map((election) => election.year).join(" and ")} published a national total and no state table. They are not drawn, because a blank map of them would read as a country that did not vote.`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MAPPABLE.map((election) => (
          <YearMap key={election.year} election={election} shapes={shapes} party={party} />
        ))}

        {NATIONAL_ONLY.map((election) => (
          <div
            key={election.year}
            className="flex flex-col rounded-dash-sm border border-dashed border-dash-line bg-dash-well/40 p-4"
          >
            <p className="figure text-[1.125rem] font-extrabold text-dash-ink">{election.year}</p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">
              National totals only. No table by state was published for this election, so nothing
              below the country can be drawn or modelled from it.
            </p>
            <div className="mt-auto space-y-1 pt-3">
              {election.parties
                .filter((entry) => entry.id !== "OTH")
                .slice(0, 3)
                .map((entry) => (
                  <p key={entry.id} className="flex items-baseline gap-2 text-[0.75rem]">
                    <PartyMark party={entry.id} />
                    <span className="truncate text-dash-muted">{entry.candidate}</span>
                    <span className="figure ml-auto font-bold text-dash-ink">
                      {formatNumber(election.national[entry.id] ?? 0)}
                    </span>
                  </p>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function YearMap({ election, shapes, party }) {
  const { fills, notes, held } = useMemo(() => {
    const fill = {};
    const note = {};
    let won = 0;

    for (const row of election.rows) {
      const total = row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
      const order = Object.entries(row.votes)
        .filter(([id]) => id !== "OTH")
        .sort((a, b) => b[1] - a[1]);
      const winner = order[0]?.[0] ?? null;

      if (winner === party) won += 1;
      fill[row.code] = PARTY_FILL[winner] ?? PARTY_FILL.OTH;
      note[row.code] = `${winner} · ${formatShare(total > 0 ? ((order[0]?.[1] ?? 0) / total) * 100 : 0)}`;
    }
    return { fills: fill, notes: note, held: won };
  }, [election, party]);

  return (
    <div className="rounded-dash-sm border border-dash-line bg-dash-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="figure text-[1.125rem] font-extrabold text-dash-ink">{election.year}</p>
        {party && (
          <p className="figure text-[0.75rem] text-dash-muted">
            <span className="font-bold text-dash-ink">{held}</span> for {party}
          </p>
        )}
      </div>
      <MiniMap shapes={shapes} fills={fills} notes={notes} height={200} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ scenario */

/**
 * Move the vote and watch the map change.
 *
 * ── THE TOGGLE IS THE POINT, NOT THE SLIDERS ───────────────────────────────
 * A screen that only ever draws a scenario is a screen where nobody can tell
 * what actually happened from what somebody typed into a box. So the basis is
 * an explicit switch with two positions, the result is the default, and the
 * scenario position is coloured differently everywhere it reaches.
 */
function Scenario({
  year,
  slot,
  party,
  swing,
  onSwing,
  turnoutShift,
  onTurnout,
  basis,
  onBasis,
}) {
  const election = electionOf(year);

  const bucket = useMemo(
    () => bucketOf(election?.parties.map((entry) => entry.id) ?? []),
    [election]
  );

  const rows = useMemo(() => {
    if (!election?.stateLevel || slot < 0) return [];
    const slots = election.parties.map((entry) => entry.id);
    return election.rows.map((row) => ({
      code: row.code,
      votes: slots.map((id) => row.votes[id] ?? 0),
      total: row.total ?? slots.reduce((sum, id) => sum + (row.votes[id] ?? 0), 0),
    }));
  }, [election, slot]);

  const after = useMemo(
    () =>
      basis === "scenario"
        ? scenario(rows, { slot, swing, turnout: turnoutShift, bucket })
        : rows,
    [rows, basis, slot, swing, turnoutShift, bucket]
  );

  const now = useMemo(() => tally(after, slot, bucket), [after, slot, bucket]);
  const was = useMemo(() => tally(rows, slot, bucket), [rows, slot, bucket]);

  if (slot < 0 || rows.length === 0) return null;

  return (
    <Panel
      title="Scenario"
      figure={`${year} · ${party}`}
      foot="A swing takes its points off the other parties in proportion, so the shares still sum to a hundred. Turnout scales a place without moving who wins it."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Toggle
            value={basis}
            onChange={onBasis}
            options={[
              { id: "result", label: "What happened", icon: Scale },
              { id: "scenario", label: "What if", icon: Sliders },
            ]}
          />

          <Slider
            label="Swing"
            value={swing}
            onChange={onSwing}
            min={-25}
            max={25}
            step={0.5}
            disabled={basis !== "scenario"}
            format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`}
          />

          <Slider
            label="Turnout"
            value={turnoutShift}
            onChange={onTurnout}
            min={-40}
            max={40}
            step={1}
            disabled={basis !== "scenario"}
            format={(value) => `${value > 0 ? "+" : ""}${value}%`}
          />

          {basis === "scenario" && (swing !== 0 || turnoutShift !== 0) && (
            <button
              type="button"
              onClick={() => {
                onSwing(0);
                onTurnout(0);
              }}
              className="text-[0.8125rem] font-bold text-dash-muted underline underline-offset-4 hover:text-dash-ink"
            >
              Back to the result
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Readout
            label="States carried"
            value={`${now.won}`}
            sub={basis === "scenario" && now.won !== was.won ? `was ${was.won}` : `of ${now.places}`}
            tone={basis === "scenario" && now.won !== was.won ? "alert" : "ink"}
          />
          <Readout
            label="Changed hands"
            value={basis === "scenario" ? `${now.moved}` : "—"}
            sub={basis === "scenario" ? "under this scenario" : "switch to What if"}
          />
          <Readout
            label="Vote share"
            value={formatShare(now.voteShare)}
            sub={
              basis === "scenario" && Math.abs(now.voteShare - was.voteShare) > 0.05
                ? `was ${formatShare(was.voteShare)}`
                : "of valid votes"
            }
          />
          <Readout label="Votes" value={formatNumber(now.votes)} sub={`of ${formatNumber(now.cast)} cast`} />
          <Readout
            label="Basis"
            value={basis === "scenario" ? "Modelled" : "Counted"}
            sub={basis === "scenario" ? "a swing somebody typed" : "as declared by INEC"}
            tone={basis === "scenario" ? "alert" : "good"}
          />
        </div>
      </div>
    </Panel>
  );
}

function Toggle({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-dash-sm border border-dash-line p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const on = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-[5px] px-3 py-2 text-[0.8125rem] font-bold transition-colors",
              on ? "bg-ink-950 text-white" : "text-dash-muted hover:text-dash-ink"
            )}
          >
            {Icon && <Icon size={14} strokeWidth={2.5} aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step, format, disabled }) {
  return (
    <label className={cn("block", disabled && "opacity-40")}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[0.8125rem] font-bold text-dash-ink">{label}</span>
        <span className="figure text-[0.875rem] font-extrabold text-dash-ink">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-ink-950"
      />
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════════════ ground */

/**
 * One state, down to the booth.
 *
 * ── LOADED ON DEMAND, BECAUSE THE TREE IS 8.3 MEGABYTES ────────────────────
 * The unit files are per state and are fetched when a state is opened. Sending
 * all thirty-seven to every reader would cost more than the rest of this
 * dashboard put together, for a drill most readers never open.
 */
function Ground({ open, onOpen, year, slot, party, swing, turnoutShift }) {
  /* ── ONE PIECE OF STATE, CARRYING WHICH STATE IT IS FOR ─────────────────
     `loaded` holds the fetched tree *and* the state number it belongs to, so
     "are we still loading" is a comparison rather than a second flag somebody
     has to remember to turn off on every exit path — including the error one,
     which is where a loading spinner gets stranded forever. */
  const [loaded, setLoaded] = useState(null);
  /* The ward likewise remembers its state. Opening Kano while a ward of Sokoto
     was selected must not leave that ward's key pointing into a tree it does
     not belong to. */
  const [held, setHeld] = useState(null);

  const number = open ? numberOf(open) : null;
  const book = loaded?.number === number ? loaded.book : null;
  const busy = Boolean(number) && loaded?.number !== number;
  const ward = held?.number === number ? held.key : null;
  const setWard = useCallback(
    (key) => setHeld(key ? { number, key } : null),
    [number]
  );

  useEffect(() => {
    if (!number) return undefined;

    let live = true;
    fetch(`/geo/units/${number}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((book) => {
        /* Stamped with the number it was fetched for, so a slow response for a
           state the reader has already navigated away from is ignored by the
           comparison above rather than painted over the new one. */
        if (live) setLoaded({ number, book });
      })
      .catch(() => {
        if (live) setLoaded({ number, book: null });
      });

    return () => {
      live = false;
    };
  }, [number]);

  const model = useMemo(
    () => (book ? modelState({ book, year }) : null),
    [book, year]
  );

  const wardRows = useMemo(() => {
    if (!model || slot < 0) return [];
    const rows = model.wardRows.map((row) => ({ ...row }));
    return swing || turnoutShift
      ? scenario(rows, { slot, swing, turnout: turnoutShift, bucket: model.bucket })
      : rows;
  }, [model, slot, swing, turnoutShift]);

  const units = useMemo(() => {
    if (!model || !ward) return [];
    const rows = unitsOfWard({ model, wardKey: ward });
    /* Scenarios are never applied to a counted booth. A transcription is what
       was cast; moving it by a slider would produce a figure that is neither
       the result nor a model, and there is no honest label for that. */
    if (model.counted) return rows;
    return swing || turnoutShift
      ? scenario(rows, { slot, swing, turnout: turnoutShift, bucket: model.bucket })
      : rows;
  }, [model, ward, slot, swing, turnoutShift]);

  const series = useMemo(() => (open ? stateSeries(open) : []), [open]);

  if (!open) {
    return (
      <Panel title="Down to the booth">
        <p className="flex items-center gap-2 text-[0.875rem] text-dash-muted">
          <MapPin size={16} strokeWidth={2.5} aria-hidden="true" />
          Pick a state on the map above to open its wards and polling units.
        </p>
      </Panel>
    );
  }

  const counted = Boolean(model?.counted);

  return (
    <Panel
      title={`Down to the booth · ${open}`}
      figure={busy ? "…" : `${wardRows.length} wards`}
      foot={
        counted
          ? `Polling unit figures here are transcribed from Form EC8A — ${formatNumber(model.counted.meta.units)} of the state's ${formatNumber(model.counted.meta.unitsInState)} booths. A booth with no sheet is drawn as unknown, never as nothing.`
          : "Ward and booth figures here are apportioned from the declared state total across the state's real wards and booths. They sum back to INEC's figure and are not evidence about a named booth."
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tag tone={counted ? "good" : "alert"}>
          {counted ? "Counted booths" : "Modelled booths"}
        </Tag>
        {(swing || turnoutShift) && !counted ? <Tag tone="warn">Scenario applied</Tag> : null}
        {counted && (swing || turnoutShift) ? (
          <Tag tone="neutral">Scenario not applied to counted booths</Tag>
        ) : null}
        <button
          type="button"
          onClick={() => onOpen(null)}
          className="ml-auto text-[0.8125rem] font-bold text-dash-muted underline underline-offset-4 hover:text-dash-ink"
        >
          Close
        </button>
      </div>

      {busy ? (
        <p className="flex items-center gap-2 py-8 text-[0.875rem] text-dash-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading the wards and booths of {open}…
        </p>
      ) : !model ? (
        <p className="py-8 text-[0.875rem] text-dash-muted">
          {electionOf(year)?.stateLevel
            ? "This state's geography could not be loaded."
            : `${year} published no table by state, so nothing below the country can be drawn for it.`}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <Heading icon={Layers}>Wards</Heading>
            <Bands rows={wardRows} slot={slot} party={party} />
            <WardList rows={wardRows} slot={slot} open={ward} onOpen={setWard} model={model} />
          </div>

          <div>
            <Heading icon={Crosshair}>
              {ward ? `Booths in ${model.byKey.get(ward)?.name ?? ward}` : "Booths"}
            </Heading>
            {ward ? (
              <Units rows={units} slot={slot} counted={counted} />
            ) : (
              <p className="py-6 text-[0.875rem] text-dash-muted">
                Pick a ward to open its polling units.
              </p>
            )}
            {series.length > 0 && <Series rows={series} party={party} />}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Heading({ icon: Icon, children }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
      <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      {children}
    </p>
  );
}

function Tag({ tone, children }) {
  const tones = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    alert: "border-dash-line bg-dash-well text-dash-muted",
    neutral: "border-dash-line bg-dash-card text-dash-muted",
  };
  return (
    <span
      className={cn(
        "rounded-dash-sm border px-2 py-1 text-[0.6875rem] font-bold tracking-[0.08em] uppercase",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

/** How the places break down across the five bands. */
function Bands({ rows, slot, party }) {
  const segments = useMemo(() => {
    const counts = Object.fromEntries(STRONGHOLD.map((band) => [band.id, 0]));
    for (const row of rows) {
      const total = row.total ?? row.votes.reduce((sum, n) => sum + n, 0);
      const band = bandOf(total > 0 ? ((row.votes[slot] ?? 0) / total) * 100 : null);
      if (band) counts[band.id] += 1;
    }
    /* `color`, not `fill`. Split falls back to its own ramp for a segment that
       does not carry one, so the wrong key here does not throw — it paints the
       five stronghold bands in five unrelated colours, with the legend still
       naming them correctly. A "Lost" band drawn in the ramp's darkest tone is
       the exact misreading this screen exists to prevent. */
    return STRONGHOLD.map((band) => ({
      id: band.id,
      label: band.label,
      value: counts[band.id],
      color: band.fill,
    })).filter((segment) => segment.value > 0);
  }, [rows, slot]);

  if (segments.length === 0) return null;

  return (
    <div className="mb-3">
      <Split segments={segments} total={rows.length} />
      <p className="mt-1.5 text-[0.75rem] text-dash-muted">
        Wards by {party}&rsquo;s share of the vote cast in them.
      </p>
    </div>
  );
}

function WardList({ rows, slot, open, onOpen, model }) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const share = (row) => {
          const total = row.total ?? row.votes.reduce((sum, n) => sum + n, 0);
          return total > 0 ? (row.votes[slot] ?? 0) / total : 0;
        };
        return share(b) - share(a);
      }),
    [rows, slot]
  );

  return (
    <ul className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
      {sorted.map((row) => {
        const total = row.total ?? row.votes.reduce((sum, n) => sum + n, 0);
        const share = total > 0 ? ((row.votes[slot] ?? 0) / total) * 100 : null;
        const band = bandOf(share);
        const ward = model.byKey.get(row.name);
        const on = row.name === open;

        return (
          <li key={row.name}>
            <button
              type="button"
              onClick={() => onOpen(on ? null : row.name)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-dash-sm border px-2.5 py-2 text-left transition-colors",
                on ? "border-ink-950 bg-ink-950/[0.03]" : "border-transparent hover:border-dash-line"
              )}
            >
              <span
                className="size-3 shrink-0 rounded-[3px] border border-dash-line"
                style={{ background: band?.fill ?? "var(--color-ink-050)" }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-bold text-dash-ink">
                  {ward?.name ?? row.name}
                </span>
                <span className="figure block truncate text-[0.6875rem] text-dash-muted">
                  {ward?.lga} · {row.booths} booths
                  {row.moved ? " · changed hands" : ""}
                </span>
              </span>
              <span className="figure shrink-0 text-[0.875rem] font-extrabold text-dash-ink">
                {share === null ? "—" : formatShare(share)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Units({ rows, slot, counted }) {
  const known = rows.filter((row) => row.total !== null);
  const missing = rows.length - known.length;
  const spread = useMemo(() => concentration(known, 0.1), [known]);
  const top = useMemo(() => biggest(known, 8), [known]);

  return (
    <div className="space-y-3">
      {counted && missing > 0 && (
        <p className="rounded-dash-sm border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-[0.8125rem] leading-relaxed text-amber-900">
          {missing} of {rows.length} booths here have no transcription — INEC published no readable
          sheet for them. They are left out of the figures below rather than counted as zero.
        </p>
      )}

      {known.length > 0 && (
        <p className="text-[0.8125rem] text-dash-muted">
          The largest tenth of these booths hold{" "}
          <span className="figure font-bold text-dash-ink">{formatShare(spread.registerShare)}</span>{" "}
          of the register and{" "}
          <span className="figure font-bold text-dash-ink">{formatShare(spread.voteShare)}</span> of
          the votes cast.
        </p>
      )}

      <ul className="max-h-[20rem] space-y-1 overflow-y-auto pr-1">
        {top.map((row) => {
          const share = row.total > 0 ? ((row.votes[slot] ?? 0) / row.total) * 100 : null;
          const band = bandOf(share);
          return (
            <li
              key={row.code}
              className="flex items-center gap-2.5 rounded-dash-sm border border-dash-line px-2.5 py-2"
            >
              <span
                className="size-3 shrink-0 rounded-[3px] border border-dash-line"
                style={{ background: band?.fill ?? "var(--color-ink-050)" }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-bold text-dash-ink">
                  {row.label}
                </span>
                <span className="figure block text-[0.6875rem] text-dash-muted">
                  {row.code} · {formatNumber(row.registered ?? 0)} registered
                </span>
              </span>
              <span className="figure shrink-0 text-[0.875rem] font-extrabold text-dash-ink">
                {share === null ? "—" : formatShare(share)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What this state has done across the record. */
function Series({ rows, party }) {
  return (
    <div className="mt-4 border-t border-dash-line pt-3">
      <Heading icon={Layers}>This state, every election</Heading>
      <ul className="space-y-1">
        {rows.map((row) => {
          const mine = row.shares[party] ?? null;
          return (
            <li key={row.year} className="flex items-center gap-2.5 text-[0.8125rem]">
              <span className="figure w-10 shrink-0 font-bold text-dash-ink">{row.year}</span>
              <PartyMark party={row.winner} />
              <span className="truncate text-dash-muted">
                {row.gap === null ? "unopposed" : `by ${formatShare(row.gap)}`}
              </span>
              <span className="figure ml-auto shrink-0 font-bold text-dash-ink">
                {mine === null ? "—" : formatShare(mine)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[0.75rem] text-dash-muted">
        Right-hand column is {party}&rsquo;s own share. Blank where the party did not stand.
      </p>
    </div>
  );
}
