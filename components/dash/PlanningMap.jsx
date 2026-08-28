"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, Layers, Loader2, MapPin, RotateCcw, Target, Users } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import UnitMap from "./UnitMap";
import {
  SEP,
  clearUnder,
  costPlan,
  isCovered,
  pathKey,
  statusOf as coverageStatus,
  toggle as toggleMark,
} from "@/lib/coverage";
import { boundsOf, extentOf } from "@/lib/bbox";
import { apportion, wardCount } from "@/lib/drill";
import { FACTOR_ROWS } from "@/lib/forecast";
import { allParties, parties, states2023 } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The planning map.
 *
 * ── A MAP WITH NO RESULT ON IT, DELIBERATELY ───────────────────────────────
 * Every other map in this product answers "what happened". This one answers
 * "where are we going to work", and that is a different question with a
 * different failure mode: a planning map coloured by last result quietly
 * argues for fighting the previous election again. So it starts blank, and
 * the only colour on it is the territory you have chosen.
 *
 * ── WHAT SELECTION IS FOR ──────────────────────────────────────────────────
 * Choosing places is not the output. The output is the running cost of
 * covering them: how many booths, how many agents at one each, and how much
 * of the country that reaches. A plan that names twelve states without those
 * numbers is a wish.
 *
 * ── AND THE PLANNER DECIDES WHAT "REACH" MEANS ─────────────────────────────
 * Coverage measured against the register is one answer, and often the wrong
 * one: a state with two million registered and a 17% turnout is not the same
 * prize as a state with two million registered and 40%. So the basis is a
 * control, not a constant. Register, accredited voters, votes actually cast,
 * or polling units to staff. The same selection, costed four ways, and the
 * ranking underneath it changes with the choice.
 * ───────────────────────────────────────────────────────────────────────────
 */

const NATIONAL = {
  registered: states2023.reduce((sum, state) => sum + state.registered, 0),
  booths: states2023.reduce((sum, state) => sum + state.booths, 0),
  cast: states2023.reduce((sum, state) => sum + state.total, 0),
};

/* Every party's national figure, summed from the same declared state rows the
   plan is costed against. The country's split and a state's split therefore
   come from one source and cannot drift apart. */
NATIONAL.votes = states2023.reduce(
  (running, state) => running.map((value, index) => value + (state.votes[index] ?? 0)),
  allParties.map(() => 0)
);

/**
 * INEC declared 25,286,616 accredited against 24,025,940 valid votes in 2023.
 * We hold the second figure per state and not the first, so accreditation is
 * carried at the national ratio rather than invented state by state. It is
 * labelled Derived everywhere it appears for exactly that reason: the shape is
 * right, the per-state detail is an assumption, and a planner is entitled to
 * know which is which before they budget against it.
 */
const ACCREDITATION = 25_286_616 / 24_025_940;
NATIONAL.accredited = Math.round(NATIONAL.cast * ACCREDITATION);

/** What coverage is measured against. The planner picks. */
const BASES = [
  {
    key: "registered",
    label: "Registered voters",
    short: "Register",
    unit: "voters",
    real: true,
    note: "Everybody entitled to vote. The widest measure, and the one that counts people who have never turned out.",
    of: (row) => row.registered ?? 0,
  },
  {
    key: "accredited",
    label: "Accredited voters",
    short: "Accredited",
    unit: "voters",
    real: false,
    note: "The people who actually turned up and were verified. Carried at the 2023 national accreditation ratio, because we hold valid votes per state and not accreditation.",
    of: (row) => Math.round((row.total ?? 0) * ACCREDITATION),
  },
  {
    key: "cast",
    label: "Votes cast",
    short: "Votes cast",
    unit: "votes",
    real: true,
    note: "Valid votes declared in 2023. The hardest measure of where the votes really are.",
    of: (row) => row.total ?? 0,
  },
  {
    key: "booths",
    label: "Polling units",
    short: "Booths",
    unit: "units",
    real: true,
    note: "What you have to physically staff. The measure that decides whether a plan is affordable.",
    of: (row) => row.booths ?? 0,
  },
];

const FACTOR_OF = new Map(FACTOR_ROWS.map((row) => [row.code, row]));

/**
 * How the shortlist is ranked. Every lens answers "where next", and they
 * disagree with each other on purpose: the argument between them is the
 * planning conversation.
 */
const LENSES = [
  {
    key: "size",
    label: "Size",
    real: true,
    note: "Simply the largest places on the basis you chose.",
    score: (state, basis) => basis.of(state),
    show: (state, basis) => formatNumber(basis.of(state)),
  },
  {
    key: "close",
    label: "Competitiveness",
    real: true,
    note: "Where 2023 was closest. A tight state is worth more per agent than a safe one.",
    score: (state) => 100 - marginOf(state),
    show: (state) => `${marginOf(state).toFixed(1)}% margin`,
  },
  {
    key: "headroom",
    label: "Voters not reached",
    real: true,
    note: "The register that did not vote. Almost always a bigger pool than the voters anybody hopes to persuade.",
    score: (state) => state.registered - state.total,
    show: (state) => `${formatNumber(state.registered - state.total)} stayed home`,
  },
  {
    key: "density",
    label: "Voters per unit",
    real: true,
    note: "Crowded booths mean long queues and a slow count. High density is where the day goes wrong.",
    score: (state) => state.registered / Math.max(state.booths, 1),
    show: (state) => `${formatNumber(Math.round(state.registered / Math.max(state.booths, 1)))} per unit`,
  },
  {
    key: "security",
    label: "Security pressure",
    real: false,
    note: "Where polling is under most pressure. Synthetic, and the strongest single depressant on turnout in the model.",
    score: (state) => FACTOR_OF.get(state.code)?.security ?? 0,
    show: (state) => `${FACTOR_OF.get(state.code)?.security ?? 0} of 100`,
  },
  {
    key: "hardship",
    label: "Economic hardship",
    real: false,
    note: "Where the cost of getting to a booth bites hardest. Synthetic.",
    score: (state) => FACTOR_OF.get(state.code)?.hardship ?? 0,
    show: (state) => `${FACTOR_OF.get(state.code)?.hardship ?? 0} of 100`,
  },
  {
    key: "rainRisk",
    label: "Rain on the day",
    real: false,
    note: "Chance of rain during polling hours. Synthetic, and it suppresses rural turnout hardest.",
    score: (state) => FACTOR_OF.get(state.code)?.rainRisk ?? 0,
    show: (state) => `${FACTOR_OF.get(state.code)?.rainRisk ?? 0}% chance`,
  },
];

/** The 2023 winning margin in a state, as a share of the votes cast there. */
function marginOf(state) {
  const order = [...state.votes].sort((a, b) => b - a);
  return ((order[0] - order[1]) / Math.max(state.total, 1)) * 100;
}

/* The four named parties, in the order every vote array in this product uses.
   Index 4 is everybody else and is deliberately never a "winner": a place is
   not carried by the aggregate of fourteen other candidates. */
const PARTY_ID = parties.map((party) => party.id);

/** Who carried a place in 2023, and by how much. */
function winnerOf(votes) {
  let best = 0;
  for (let index = 1; index < PARTY_ID.length; index += 1) {
    if ((votes[index] ?? 0) > (votes[best] ?? 0)) best = index;
  }
  const ranked = votes.slice(0, PARTY_ID.length).sort((a, b) => b - a);
  const total = votes.reduce((sum, value) => sum + (value ?? 0), 0);
  return {
    id: PARTY_ID[best],
    votes: votes[best] ?? 0,
    margin: total ? ((ranked[0] - ranked[1]) / total) * 100 : 0,
  };
}

/**
 * Every party's figure for one place, ranked, with the share behind each.
 *
 * Everybody else is an aggregate of fourteen candidates rather than a
 * contender, so it is pinned to the foot however many votes it holds. Sorting
 * it with the rest would let "other" outrank a party that actually stood, and
 * a reader scanning the second row would take an aggregate for a challenger.
 */
function standings(votes = []) {
  const total = votes.reduce((sum, value) => sum + (value ?? 0), 0);

  const rows = allParties.map((party, index) => ({
    id: party.id,
    /* "OTH" is the code this product uses in its data. It is not a word, so it
       is not what a reader is shown. */
    label: party.id === "OTH" ? "Others" : party.id,
    token: party.token,
    fill: PARTY_FILL[party.id] ?? PARTY_FILL.OTH,
    votes: votes[index] ?? 0,
    share: total ? ((votes[index] ?? 0) / total) * 100 : 0,
  }));

  const named = rows.slice(0, parties.length).sort((a, b) => b.votes - a.votes);

  return {
    rows: [...named, rows[rows.length - 1]],
    total,
    /* Never zero: it is a divisor for every bar drawn from this. */
    lead: Math.max(named[0]?.votes ?? 0, 1),
  };
}

/**
 * How long three taps have to arrive in to count as one gesture.
 *
 * ── WHY THIS IS GENEROUS ───────────────────────────────────────────────────
 * The usual double-click window is around 250ms, which is tuned for a mouse on
 * a desk. This map is driven with a finger on a touch wall between bulletins,
 * and a third deliberate tap is slower than a third reflexive one. Too short
 * and the gesture is unreachable for the people it was asked for; too long and
 * two unrelated taps on the same state start being read as one intention. 600ms
 * is long enough to be repeatable standing up and short enough that a pause to
 * look at the figures ends the sequence.
 */
const TRIPLE_MS = 600;

/**
 * How far the taps may wander and still be one gesture.
 *
 * ── WITHOUT THIS, TOGGLING TWO PLACES DROPS THE STATE ─────────────────────
 * Time alone cannot tell a triple-tap from somebody quickly ticking three
 * local governments inside an open state: both are three taps inside the
 * window. What separates them is that a triple-tap does not move. Requiring
 * every tap of a sequence to land within a few pixels of the first makes
 * deliberate taps on different places reset the count, which is what they
 * mean. Fourteen pixels is wide enough for a finger that shifts slightly
 * between taps and far narrower than any two adjacent shapes on this map.
 */
const TAP_SLOP = 14;

/**
 * Ward and booth divisions, kept once.
 *
 * Module scope rather than a ref, because `apportion` is a pure function of a
 * parent's figures and a seed string that is globally unique to the place —
 * the same key always yields the same rows, so there is nothing per-instance
 * about the answer and nothing that can go stale. It is also read while the
 * plan is being costed, which is during render, and a ref read during render
 * is a bug waiting for a reason.
 */
const SPLITS = new Map();

export default function PlanningMap({ shapes }) {
  const [openState, setOpenState] = useState(null);

  /**
   * ── HOW FAR DOWN THE READER HAS WALKED ───────────────────────────────────
   * A plan is costed in agents, and an agent stands at a polling unit, so a
   * planner has to be able to get to one. The map opens on the country, opens
   * a state into its local governments, and now opens a local government into
   * its wards and a ward into its booths.
   *
   * ── AND WHY SELECTION STOPS AT A LOCAL GOVERNMENT ────────────────────────
   * The plan's arithmetic folds every pick into one entry per state before it
   * costs anything, which is what stops a state and its parts being counted
   * twice — see the note on `picked` below, and the bug it was written for.
   * Wards and booths are read, costed and exported at full depth; what a tap
   * *selects* is still the local government they are in, and the panel says so
   * in those words. A four-deep selection model with the same guarantee is a
   * bigger change than the one this screen needed, and half of one would put
   * the double-count straight back.
   */
  const [openLga, setOpenLga] = useState(null); // name, inside openState
  const [openWard, setOpenWard] = useState(null); // name, inside openLga
  const [boundaries, setBoundaries] = useState(null); // { code, data } for one state
  const [hovered, setHovered] = useState(null);
  const [basisKey, setBasisKey] = useState("registered");
  const [lensKey, setLensKey] = useState("close");

  /* Where the pointer is inside the map frame, so the readout can sit beside
     whatever it is describing. Measured against the map's own box rather than
     the page, so it stays correct when the room scrolls. */
  const [pointer, setPointer] = useState(null);

  /**
   * The tap sequence in progress.
   *
   * ── WHY A REF AND NOT STATE ───────────────────────────────────────────────
   * Three taps can land inside one React batch, and state read inside a handler
   * is the value from the last render rather than the value the previous tap
   * just set. Counting taps in state gives a counter that reads 1, 1, 1. A ref
   * is the value at the moment it is read, which is the only thing that can
   * count a gesture.
   *
   * `snapshot` is the plan as it stood *before* the first tap. The third tap
   * restores it and then drops the state, so the add from tap one and whatever
   * tap two did inside the state both leave no residue. Undoing a gesture has
   * to undo all of it, or "remove" quietly means "remove, but keep whatever I
   * touched on the way past".
   */
  const sequence = useRef({ code: null, count: 0, at: 0, x: null, y: null, snapshot: null });

  /**
   * ── HOW A SELECTION IS HELD ───────────────────────────────────────────────
   * A state is not a peer of its local governments, it *is* them, and the same
   * is true of a ward and its booths. Picking Kano means all 44 of Kano's
   * local governments, and the total has to say Kano once however many of its
   * parts are also ticked.
   *
   * An early version stored a whole state and its local governments as two
   * independent kinds of pick and added both. Taking Kano and then ticking
   * three places inside it counted Kano's register once and three
   * forty-fourths of it a second time; enough of that and the reach went past
   * 100%, which is not a rounding problem, it is the model being wrong.
   *
   * The scheme that replaced it could only express two levels, which is what
   * kept selection out of the wards and booths this map can now open. So the
   * plan is a map of paths to marks — "+" takes a place and everything in it,
   * "-" takes it back out of whatever contains it — and every figure on this
   * screen is costed by walking it. That walk, and the proof that nothing is
   * counted twice at any depth, is lib/coverage.js and tests/coverage.test.js.
   */
  const [picked, setPicked] = useState(() => new Map());

  /* Local government figures for every state opened so far. A carve-out has to
     be costed exactly, and the rows are only derivable while their state is
     open, so they are kept once loaded rather than re-estimated from an
     average after the reader has moved on. */
  const [lgaCache, setLgaCache] = useState(() => new Map());

  const byCode = useMemo(() => new Map(states2023.map((row) => [row.code, row])), []);
  const basis = BASES.find((item) => item.key === basisKey) ?? BASES[0];
  const lens = LENSES.find((item) => item.key === lensKey) ?? LENSES[0];

  /* What arrives is stamped with the state it was fetched for, and whether the
     map is still waiting is read off that stamp rather than kept in a separate
     flag. A flag has to be switched on and off in the right order, and these
     files are static enough that a cached one can beat the switch that turns
     the spinner on — which leaves it running over a map that has already
     drawn. A stamp cannot disagree with the shapes sitting next to it. */
  const openCode = openState?.code ?? null;

  useEffect(() => {
    if (!openCode) return;
    let cancelled = false;
    fetch(`/geo/lga/${openCode}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setBoundaries({ code: openCode, data });
        const state = byCode.get(openCode);
        if (!data || !state) return;
        const rows = apportion({
          names: data.lgas.map((row) => row.name),
          votes: state.votes,
          booths: state.booths,
          registered: state.registered,
          parentKey: state.code,
        });
        setLgaCache((current) =>
          current.get(state.code) ? current : new Map(current).set(state.code, rows)
        );
      })
      .catch(() => !cancelled && setBoundaries({ code: openCode, data: null }));
    return () => {
      cancelled = true;
    };
  }, [openCode, byCode]);

  /* Only ever the boundaries of the state open now: a reply for the state just
     left stays invisible, and so does one that has not landed yet. */
  const lgaShapes = boundaries?.code === openCode ? boundaries.data : null;
  const loading = Boolean(openCode) && boundaries?.code !== openCode;

  const lgaRows = useMemo(() => {
    if (!openState || !lgaShapes) return [];
    return lgaCache.get(openState.code) ?? [];
  }, [openState, lgaShapes, lgaCache]);

  const inState = openState !== null;

  /**
   * The wards of a local government, and the booths of a ward.
   *
   * Memoised because the plan asks for these while costing marks in places the
   * reader has never opened — a booth carved out of Kano still has to be
   * subtracted exactly — and `apportion` is a pure function of the parent's
   * figures and a seed, so the answer is the same every time and worth
   * keeping. The seed strings are the ones the drill has always used, so a
   * ward costed here is the same ward drawn on the map.
   */
  const wardsOf = useCallback((code, row) => {
    const key = `${code}:${row.name}`;
    const held = SPLITS.get(key);
    if (held) return held;
    const rows = apportion({
      names: Array.from({ length: wardCount(row.name) }, (_, index) =>
        `Ward ${String(index + 1).padStart(2, "0")}`
      ),
      votes: row.votes,
      booths: row.booths,
      registered: row.registered,
      parentKey: key,
    });
    SPLITS.set(key, rows);
    return rows;
  }, []);

  const unitsOf = useCallback((code, lgaName, row) => {
    const key = `${code}:${lgaName}:${row.name}`;
    const held = SPLITS.get(key);
    if (held) return held;
    /* A ward has exactly as many polling units as it has booths, and each of
       them is one booth. See the note where these are drawn. */
    const count = Math.max(1, row.booths);
    const rows = apportion({
      names: Array.from({ length: count }, (_, index) => `PU ${String(index + 1).padStart(3, "0")}`),
      votes: row.votes,
      booths: count,
      registered: row.registered,
      parentKey: key,
    }).map((unit) => ({ ...unit, booths: 1, density: unit.registered }));
    SPLITS.set(key, rows);
    return rows;
  }, []);

  /**
   * What one place is worth on the chosen basis, and what it costs in booths.
   *
   * Null where it cannot be resolved — a local government inside a state whose
   * boundaries have never been fetched has no row to read — and the cost walk
   * treats null as nothing rather than as a guess. The one exception is a bare
   * local government, which falls back to the state's own average, because
   * that is a figure a planner can act on and its absence is not.
   */
  const figuresFor = useCallback(
    (parts) => {
      const [code, lgaName, wardName, unitName] = parts;
      const state = byCode.get(code);
      if (!state) return null;
      if (parts.length === 1) return { value: basis.of(state), booths: state.booths };

      const rows = lgaCache.get(code);
      const lga = rows?.find((row) => row.name === lgaName);

      if (!lga) {
        if (parts.length !== 2) return null;
        const share = Math.max(wardCount(code) * 2, 1);
        return {
          value: Math.round(basis.of(state) / share),
          booths: Math.round(state.booths / share),
        };
      }
      if (parts.length === 2) return { value: basis.of(lga), booths: lga.booths };

      const ward = wardsOf(code, lga).find((row) => row.name === wardName);
      if (!ward) return null;
      if (parts.length === 3) return { value: basis.of(ward), booths: ward.booths };

      const unit = unitsOf(code, lgaName, ward).find((row) => row.name === unitName);
      return unit ? { value: basis.of(unit), booths: unit.booths } : null;
    },
    [byCode, lgaCache, basis, wardsOf, unitsOf]
  );

  /* ── THE LEVEL, AND THE ROWS THAT BELONG TO IT ─────────────────────────
     Each one is divided out of the row above it on the same stable seed the
     rest of the product uses, so a ward is the same size every time anybody
     opens it and every level still sums back to the state's declared total.
     Nothing below a state is measured, and the panel says so. */
  const level = !inState ? "nation" : openWard ? "ward" : openLga ? "lga" : "state";

  const lgaRow = useMemo(
    () => (openLga ? lgaRows.find((row) => row.name === openLga) ?? null : null),
    [openLga, lgaRows]
  );

  /* Drawn from the same divisions the plan is costed against, rather than
     apportioned a second time here: two call sites dividing the same ward is
     two chances for the map and the bill to disagree about what a ward is. */
  const wardRows = useMemo(
    () => (lgaRow && openState ? wardsOf(openState.code, lgaRow) : []),
    [lgaRow, openState, wardsOf]
  );

  const wardRow = useMemo(
    () => (openWard ? wardRows.find((row) => row.name === openWard) ?? null : null),
    [openWard, wardRows]
  );

  const unitRows = useMemo(
    () => (wardRow && openState && openLga ? unitsOf(openState.code, openLga, wardRow) : []),
    [wardRow, openState, openLga, unitsOf]
  );

  /* The outline everything below a local government is drawn inside: the
     local government's own real boundary. Wards have none published and a
     booth is a table under a tree. See components/dash/UnitMap. */
  const lgaOutline = useMemo(() => {
    if (!openLga) return null;
    const shape = lgaShapes?.lgas?.find((row) => row.name === openLga);
    return shape ? [shape.d] : null;
  }, [openLga, lgaShapes]);

  const frame = useMemo(() => {
    if (!inState) return { viewBox: `0 0 ${shapes.width} ${shapes.height}`, width: shapes.width };
    return boundsOf(lgaShapes?.lgas.map((row) => row.d) ?? []);
  }, [inState, shapes, lgaShapes]);

  const fits = useMemo(() => {
    const shown = inState ? (lgaShapes?.lgas ?? []) : shapes.states;
    const map = new Map();
    for (const shape of shown) {
      map.set(shape.name, extentOf(shape.d).width > frame.width * 0.075);
    }
    return map;
  }, [inState, lgaShapes, shapes, frame]);

  /* ---------------------------------------------------------------- totals */
  /**
   * What the plan covers, and what it costs.
   *
   * The walk itself is lib/coverage.js, which is where the guarantee lives
   * that no place is counted twice however deep the marks go. This adds the
   * two things that are about *this screen*: the local government count, which
   * has to include the ones inside a state taken whole and are therefore not
   * marked individually, and the clamp.
   */
  const plan = useMemo(() => {
    const cost = costPlan(picked, figuresFor);

    /* Local governments covered. A state taken whole covers all of its own,
       which are not in the marks at all, so they are counted from the boundary
       rows and the carved ones taken back off. Where a state has never been
       opened its rows are unknown and it contributes what is marked. */
    let lgas = 0;
    for (const [key, mark] of picked) {
      const parts = key.split(SEP);
      if (parts.length === 1 && mark === "+") {
        const rows = lgaCache.get(parts[0]);
        if (!rows) continue;
        lgas += rows.filter((row) => isCovered(picked, pathKey([parts[0], row.name]))).length;
      } else if (parts.length === 2 && mark === "+" && !isCovered(picked, parts[0])) {
        lgas += 1;
      }
    }

    /* Guarding the arithmetic as well as the model. If these ever clamp, the
       walk above has a hole in it and the figure on screen would be a lie. */
    const total = NATIONAL[basis.key] || 1;
    const value = Math.max(0, Math.min(cost.value, total));
    const booths = Math.max(0, Math.min(cost.booths, NATIONAL.booths));

    return {
      states: cost.states,
      lgas,
      wards: cost.wards,
      units: cost.units,
      value,
      booths,
      /* One agent per booth is the product's own rule: seatsPerUnit is 1. */
      agents: booths,
      reach: (value / total) * 100,
      boothShare: (booths / NATIONAL.booths) * 100,
    };
  }, [picked, figuresFor, lgaCache, basis]);

  /* ------------------------------------------------------------- shortlist */
  /** The places not yet covered, ranked by the chosen lens. */
  /**
   * The plan as a list, one line per state.
   *
   * Built from the marks rather than kept alongside them, so what the panel
   * says and what the totals cost can never be two different plans. The
   * detail line counts marks by depth, because "whole state" and "whole
   * state, less two wards" are different plans and a reader about to spend
   * money on agents is entitled to see which one they have.
   */
  const summary = useMemo(() => {
    const byState = new Map();

    for (const [key, mark] of picked) {
      const parts = key.split(SEP);
      const code = parts[0];
      if (!byState.has(code)) {
        byState.set(code, { code, whole: false, added: [], removed: [] });
      }
      const entry = byState.get(code);
      if (parts.length === 1) entry.whole = mark === "+";
      else (mark === "+" ? entry.added : entry.removed).push(parts);
    }

    const word = (count, one, many) => `${count} ${count === 1 ? one : many}`;

    return [...byState.values()]
      .filter((entry) => entry.whole || entry.added.length)
      .sort((a, b) => (byCode.get(a.code)?.name ?? "").localeCompare(byCode.get(b.code)?.name ?? ""))
      .map((entry) => {
        const depth = (list, at) => list.filter((parts) => parts.length === at).length;
        const holes = [
          depth(entry.removed, 2) && word(depth(entry.removed, 2), "local government", "local governments"),
          depth(entry.removed, 3) && word(depth(entry.removed, 3), "ward", "wards"),
          depth(entry.removed, 4) && word(depth(entry.removed, 4), "polling unit", "polling units"),
        ].filter(Boolean);

        const parts = [
          depth(entry.added, 2) && word(depth(entry.added, 2), "local government", "local governments"),
          depth(entry.added, 3) && word(depth(entry.added, 3), "ward", "wards"),
          depth(entry.added, 4) && word(depth(entry.added, 4), "polling unit", "polling units"),
        ].filter(Boolean);

        return {
          ...entry,
          detail: entry.whole
            ? holes.length
              ? `whole state, less ${holes.join(", ")}`
              : "whole state"
            : parts.join(", "),
          exact: entry.whole && !holes.length,
        };
      });
  }, [picked, byCode]);

  const shortlist = useMemo(() => {
    return states2023
      .filter((state) => coverageStatus(picked, state.code) === "none")
      .map((state) => ({ state, score: lens.score(state, basis), note: lens.show(state, basis) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [picked, lens, basis]);

  /* ------------------------------------------------------------- gestures */
  /** Taking or dropping a whole state, and clearing whatever was set inside it. */
  /**
   * Taking a place, or taking it back out, at any depth.
   *
   * One gesture for a state, a local government, a ward and a booth, because
   * they are one gesture: tap a place nothing covers and it is added, tap a
   * place something already covers and it is carved out, tap it again and the
   * mark is lifted. Which of those a tap means is worked out from the marks
   * rather than from which level the reader happens to be standing on.
   */
  const take = useCallback((parts) => {
    setPicked((current) => toggleMark(current, pathKey(parts)));
  }, []);

  /** Is this place counted in the plan right now? */
  const isPicked = (key) => isCovered(picked, key);

  /** Some of this place is covered, but not the whole of it. */
  const partlyCovered = (key) => coverageStatus(picked, key) === "partly";

  /* ------------------------------------------------------- the third tap */

  /**
   * Drop a state and undo everything the taps before it did.
   *
   * The map also comes back out to the country, because a state that is no
   * longer in the plan is not a state anybody is still working inside, and
   * leaving the frame zoomed into it would say otherwise.
   */
  const dropAt = useCallback((key) => {
    const held = sequence.current.snapshot;
    /* Restore the plan as it stood before the first tap, then remove this
       place and everything marked inside it. Undoing a gesture has to undo all
       of it, including whatever tap two did on the way past. */
    setPicked(() => clearUnder(new Map(held ?? []), key));

    /* And come back out of it. A place that is no longer in the plan is not a
       place anybody is still working inside, and leaving the frame zoomed into
       it would say otherwise. */
    const parts = key.split(SEP);
    if (parts.length === 1) {
      setOpenState((current) => (current?.code === key ? null : current));
      setOpenLga(null);
      setOpenWard(null);
    } else if (parts.length === 2) {
      setOpenLga((current) => (current === parts[1] ? null : current));
      setOpenWard(null);
    } else if (parts.length === 3) {
      setOpenWard((current) => (current === parts[2] ? null : current));
    }

    sequence.current = { code: null, count: 0, at: 0, x: null, y: null, snapshot: null };
  }, []);

  /**
   * Count this tap, and say which tap of the gesture it is.
   *
   * A tap on a different state, or one that arrives after the window has
   * closed, starts a fresh sequence rather than continuing the old one — so
   * pausing to read the figures always resets, which is what somebody who has
   * stopped to look actually means.
   *
   * ── THE CLOCK COMES FROM THE EVENT ────────────────────────────────────────
   * `at` is the click's own timeStamp rather than a clock read inside here.
   * Two reasons, and the second is why it is not merely tidier: reading a clock
   * in a component body is impure and the compiler refuses it, and the event's
   * stamp is when the tap actually happened rather than whenever this code got
   * around to running — which is the difference between a gesture and a
   * measurement of how busy the main thread was.
   */
  const countTap = (code, event) => {
    const run = sequence.current;

    const settled =
      run.x !== null &&
      Math.abs(event.clientX - run.x) <= TAP_SLOP &&
      Math.abs(event.clientY - run.y) <= TAP_SLOP;

    if (run.code === code && event.timeStamp - run.at < TRIPLE_MS && settled) {
      run.count += 1;
    } else {
      run.code = code;
      run.count = 1;
      /* Captured before the first tap changes anything, which is what makes
         the third tap able to put the plan back exactly as it was. */
      run.snapshot = new Map(picked);
    }

    run.at = event.timeStamp;
    run.x = event.clientX;
    run.y = event.clientY;
    return run.count;
  };

  /* ------------------------------------------------------ what is under it */

  /**
   * Everything worth reading about one place.
   *
   * ── STATE FIGURES ARE DECLARED; EVERYTHING BELOW ONE IS NOT ──────────────
   * A state's register, votes and booth count are the published 2023 record. A
   * local government's are apportioned from its state and always add back to
   * it, which makes the shape right and the individual number an estimate. The
   * readout carries `estimate` so every screen that shows these has to say
   * which it is holding, rather than leaving a planner to assume a figure was
   * measured when it was divided.
   */
  const describe = useCallback(
    (key) => {
      if (!key) return null;

      if (key.includes(SEP)) {
        /* "KAN:Bagwai", "KAN:Bagwai:Ward 03", "KAN:Bagwai:Ward 03:PU 007" —
           two, three or four rungs, and the depth decides which set of rows
           holds the answer. Everything below a state is apportioned, so all
           three carry `estimate`. */
        const parts = key.split(SEP);
        const [code, lgaName, wardName, unitName] = parts;
        const state = byCode.get(code);
        if (!state) return null;

        const row =
          parts.length === 2
            ? (lgaCache.get(code) ?? []).find((item) => item.name === lgaName)
            : parts.length === 3
              ? wardRows.find((item) => item.name === wardName)
              : unitRows.find((item) => item.name === unitName);
        if (!row) return null;

        const name = parts.at(-1);
        const kind = parts.length === 2 ? "lga" : parts.length === 3 ? "ward" : "unit";

        return {
          key,
          kind,
          name,
          parent:
            kind === "lga" ? state.name : kind === "ward" ? `${lgaName}, ${state.name}` : `${wardName}, ${lgaName}`,
          code,
          registered: row.registered,
          cast: row.total,
          booths: row.booths,
          turnout: row.turnout,
          perBooth: row.density,
          wards: kind === "lga" ? wardCount(name) : null,
          votes: row.votes,
          winner: winnerOf(row.votes),
          estimate: true,
        };
      }

      const state = byCode.get(key);
      if (!state) return null;

      return {
        key,
        kind: "state",
        name: state.name,
        parent: null,
        code: key,
        registered: state.registered,
        cast: state.total,
        booths: state.booths,
        turnout: state.turnout,
        perBooth: state.booths ? Math.round(state.registered / state.booths) : 0,
        wards: null,
        votes: state.votes,
        winner: winnerOf(state.votes),
        estimate: false,
      };
    },
    [byCode, lgaCache, wardRows, unitRows]
  );

  /** Where this place stands in the plan, in one word the readout can print. */
  const statusOf = (key) => coverageStatus(picked, key);

  /**
   * What the side panel is describing right now.
   *
   * ── THE BOARD IS NEVER BLANK ──────────────────────────────────────────────
   * Hovered first, because that is what the reader is asking about. Then the
   * state they have opened, because that is what they are working inside. Then
   * the country, because a planning board with nothing on it teaches the reader
   * that the panel is decoration. There is always a true answer to "what am I
   * looking at", so there is never a reason to show nothing.
   */
  const hoverDetail = useMemo(() => describe(hovered), [describe, hovered]);

  const focus = useMemo(
    () => hoverDetail ?? describe(openState?.code ?? null),
    [hoverDetail, describe, openState]
  );

  /**
   * The plan as a file, written from the same marks the totals are costed
   * from, so the export and the screen can never disagree about what is
   * covered.
   *
   * One row per mark, at whatever depth it was made, with the word that says
   * whether it adds or removes. A plan that reads "Kano, whole" and then "Ward
   * 03, removed" is a plan somebody else can check line by line — which is the
   * only reason to export anything in this product.
   */
  const exportPlan = () => {
    const lines = [
      `scope,state,local government,ward,polling unit,${basis.short.toLowerCase()},booths`,
    ];

    const WORD = { 1: "State", 2: "Local government", 3: "Ward", 4: "Polling unit" };
    const cell = (value) => (value ? `"${String(value).replace(/"/g, '""')}"` : "");

    for (const key of [...picked.keys()].sort()) {
      const parts = key.split(SEP);
      const state = byCode.get(parts[0]);
      if (!state) continue;

      const own = figuresFor(parts);
      const [, lgaName, wardName, unitName] = parts;

      lines.push(
        [
          `${WORD[parts.length]}${picked.get(key) === "-" ? " removed" : ""}`,
          cell(state.name),
          cell(lgaName),
          cell(wardName),
          cell(unitName),
          own ? own.value : "",
          own ? own.booths : "",
        ].join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "poll360-coverage-plan.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const list = inState ? (lgaShapes?.lgas ?? []) : shapes.states;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      {/* ------------------------------------------------------------- map */}
      {/* Pinned under the bar rather than sized to a region that scrolled with
          the page. See the same note in SituationRoom. */}
      <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)] xl:h-[calc(100vh-var(--dash-top,4.5rem)-1.5rem)] xl:min-h-0">
        <nav className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5">
          <Crumb
            label="Nigeria"
            last={!inState}
            onClick={() => {
              setOpenState(null);
              setOpenLga(null);
              setOpenWard(null);
            }}
          />
          {inState && (
            <>
              <ChevronRight size={13} className="shrink-0 text-white/35" />
              <Crumb
                label={openState.name}
                last={level === "state"}
                onClick={() => {
                  setOpenLga(null);
                  setOpenWard(null);
                }}
              />
            </>
          )}
          {openLga && (
            <>
              <ChevronRight size={13} className="shrink-0 text-white/35" />
              <Crumb
                label={openLga}
                last={level === "lga"}
                onClick={() => setOpenWard(null)}
              />
            </>
          )}
          {openWard && (
            <>
              <ChevronRight size={13} className="shrink-0 text-white/35" />
              <Crumb label={openWard} last onClick={() => {}} />
            </>
          )}
          <span className="ml-auto text-[0.75rem] text-white/45">
            {level === "ward"
              ? "Tap a polling unit to take it, or to take it back out"
              : level === "lga"
                ? "Tap a ward to settle it · twice to open its polling units"
                : inState
                  ? isPicked(openState.code)
                    ? "Tap to take a local government out · twice to open it"
                    : "Tap to add a local government · twice to open it"
                  : "Tap to add, twice to open, three times to take it back out"}
          </span>
        </nav>

        <div
          className="relative min-h-0 flex-1 p-1.5"
          /* Tracked on the frame rather than on each shape: a shape only knows
             it is being pointed at, not where, and a readout that appears in
             the middle of Kano regardless of where the finger is is a readout
             that covers the thing it is describing. */
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setPointer({
              x: event.clientX - box.left,
              y: event.clientY - box.top,
              width: box.width,
              height: box.height,
            });
          }}
          onPointerLeave={() => setPointer(null)}
          /* ── THE TAP THAT LANDS ON NOTHING ──────────────────────────────
             The second tap opens a state, and its boundaries are fetched. For
             the few hundred milliseconds that takes there are no shapes drawn
             and the loading notice is over the frame, so a genuinely fast
             third tap hits neither — no shape handler runs, and the gesture
             silently does nothing. That is not an edge case: it is what a real
             triple-tap on a state does every time, because a person tapping
             quickly is always faster than a network fetch.

             So the frame carries the sequence as well. Shapes stop their
             clicks from bubbling, which leaves this handler seeing exactly the
             taps that missed. */
          onClick={(event) => {
            if (!openState) return;
            if (countTap(openState.code, event) >= 3) dropState(openState.code);
          }}
        >
          {loading && (
            <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
              <Loader2 size={16} className="animate-spin" />
              Loading boundaries
            </p>
          )}

          {/* ── BELOW A LOCAL GOVERNMENT THERE ARE NO BOUNDARIES ────────
              So the wards and booths are drawn as cells filling the local
              government's real outline, with any booth that has reported a
              position plotted where it said it was. Same component the
              situation room uses, so the two screens draw a ward the same
              way. See components/dash/UnitMap. */}
          {(level === "lga" || level === "ward") && lgaOutline ? (
            <UnitMap
              outline={lgaOutline}
              parentLabel={openLga}
              childWord={level === "lga" ? "ward" : "polling unit"}
              rows={(level === "lga" ? wardRows : unitRows).map((row) => {
                const path =
                  level === "lga"
                    ? [openState.code, openLga, row.name]
                    : [openState.code, openLga, openWard, row.name];
                const key = pathKey(path);
                const state = statusOf(key);

                return {
                  key,
                  path,
                  name: row.name,
                  value: basis.of(row),
                  note: `${formatNumber(basis.of(row))} ${basis.unit} · ${formatNumber(row.booths)} ${
                    row.booths === 1 ? "booth" : "booths"
                  }`,
                  fix: null,
                  /* ── WHAT IS IN THE PLAN, AT THIS DEPTH ─────────────────
                     Covered places are red, the same red a chosen state is
                     painted on the country map; a place carved out of one goes
                     nearly dark, because "taken out" has to look different
                     from "never taken". Everything else keeps the size ramp,
                     which is what a planner is reading the map for. */
                  paint:
                    state === "chosen" || state === "covered"
                      ? { fill: "var(--color-red-500)", opacity: 0.92 }
                      : state === "partly"
                        ? { fill: "var(--color-red-500)", opacity: 0.5 }
                        : state === "carved"
                          ? { fill: "#ffffff", opacity: 0.06 }
                          : null,
                };
              })}
              hovered={hovered}
              onHover={setHovered}
              onOpen={(row, event) => {
                /* ── ONE GESTURE, EVERY LEVEL ──────────────────────────────
                   Tap settles a place, a second tap opens it, a third takes it
                   back out and undoes the two before it — the same three taps
                   that work on a state, because a reader who has learnt them
                   on the country map should not have to learn anything else
                   further down. A polling unit has nothing inside it to open,
                   so there every tap simply settles it. */
                /* ── THE THIRD TAP, WHEREVER IT LANDS ──────────────────────
                   The second tap opens the ward, so the third arrives on a
                   booth inside it rather than on the ward it was aimed at.
                   Keying the sequence on the ward being worked in, exactly as
                   the country map keys it on the open state, is what lets one
                   gesture start on a ward and finish on a polling unit without
                   the taps in between leaving anything behind. */
                const key =
                  level === "lga" ? row.key : pathKey([openState.code, openLga, openWard]);
                const tap = event ? countTap(key, event) : 1;

                if (tap >= 3) {
                  dropAt(key);
                  return;
                }
                if (level === "lga") {
                  if (tap === 2) {
                    setOpenWard(row.name);
                    return;
                  }
                  take(row.path);
                  return;
                }
                /* A polling unit has nothing inside it to open, so every tap
                   on one simply settles it. */
                take(row.path);
              }}
            />
          ) : (
          <svg
            viewBox={frame.viewBox}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={
              inState
                ? `${openState.name} by local government. Selected places are listed beside this map.`
                : "Nigeria. Tap a state to add it to the plan."
            }
            onPointerLeave={() => setHovered(null)}
          >
            <defs>
              <pattern id="plan-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
              {/* Carved-out places read as a hole in the plan rather than as
                  never-chosen, because those are different facts and a planner
                  needs to see the difference at a glance. */}
              <pattern
                id="plan-carved"
                width="7"
                height="7"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="7" height="7" fill="var(--color-silent)" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-red-900)" strokeWidth="3" />
              </pattern>
            </defs>
            <rect
              x={frame.x ?? 0}
              y={frame.y ?? 0}
              width={frame.width ?? shapes.width}
              height={frame.height ?? shapes.height}
              fill="url(#plan-grid)"
            />

            {list.map((shape) => {
              const path = inState ? [openState.code, shape.name] : [shape.code];
              const key = pathKey(path);
              const chosen = isPicked(key);
              const carved = statusOf(key) === "carved";
              const partly = partlyCovered(key);
              const active = hovered === key;
              const unit = frame.width / 1000;

              return (
                <g
                  key={key}
                  onPointerEnter={() => setHovered(key)}
                  /* Focus drives the readout too, so the figures are not
                     something only a pointing device can reach. */
                  onFocus={() => setHovered(key)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.currentTarget.click();
                  }}
                  onClick={(event) => {
                    /* Counted here or on the frame, never both. */
                    event.stopPropagation();

                    /* ── THE THIRD TAP, WHEREVER IT LANDS ──────────────────
                       The second tap opens the state, so the third arrives on
                       a local government inside it rather than on the state it
                       was aimed at — and for a state that was already in the
                       plan the *first* tap opens it, so taps two and three are
                       both inside. Keying the sequence on the state rather
                       than on the shape under the finger is what lets one
                       gesture start on a country map and finish on a local
                       government without the taps in between leaving anything
                       behind. */
                    const code = inState ? openState.code : shape.code;
                    const tap = countTap(code, event);

                    if (tap >= 3) {
                      dropAt(code);
                      return;
                    }

                    if (inState) {
                      /* Same gesture as a state one level up: the first tap
                         settles the place, the second opens it. Learning one
                         rule for the country and a different one inside it is
                         how a reader stops trusting the map. */
                      if (picked.has(key)) {
                        setOpenLga(shape.name);
                        return;
                      }
                      take(path);
                      return;
                    }
                    if (picked.has(key)) {
                      /* Second tap on a settled state opens it, so one gesture
                         covers both "take the whole state" and "take part". */
                      setOpenState({ code: shape.code, name: shape.name });
                      return;
                    }
                    take(path);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${shape.name}${
                    carved
                      ? ", taken out of the plan"
                      : chosen
                        ? ", in the plan"
                        : partly
                          ? ", partly covered"
                          : ""
                  }`}
                  className="group cursor-pointer focus:outline-none"
                >
                  <path
                    d={shape.d}
                    fill={
                      carved
                        ? "url(#plan-carved)"
                        : chosen
                          ? "var(--color-red-500)"
                          : partly
                            ? "var(--color-red-900)"
                            : "var(--color-silent)"
                    }
                    stroke={active || chosen ? "#ffffff" : "var(--color-board)"}
                    strokeWidth={(active ? 2.4 : 1.1) * unit}
                    strokeLinejoin="round"
                    className="transition-[fill] duration-200 group-focus-visible:stroke-white"
                  />
                  {/* ── NO <title> ANY MORE, ON PURPOSE ────────────────────
                      It used to carry the place's name, which the browser drew
                      as its own tooltip about a second after the pointer
                      settled — directly on top of the readout below, saying
                      less. The name it carried has moved to aria-label on the
                      group, so a screen reader still gets it and only one
                      tooltip is ever drawn. */}

                  {fits.get(shape.name) && (
                    <text
                      x={shape.at[0]}
                      y={shape.at[1]}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none select-none"
                      style={{
                        fontSize: frame.width * 0.017,
                        fontWeight: 700,
                        fill: chosen ? "#ffffff" : "rgba(255,255,255,0.55)",
                        paintOrder: "stroke",
                        stroke: "rgba(0,0,0,0.45)",
                        strokeWidth: frame.width * 0.004,
                        strokeLinejoin: "round",
                      }}
                    >
                      {shape.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          )}

          {/* ── THE READOUT ────────────────────────────────────────────────
              Beside the pointer, never under it, and flipped to the other side
              once it would run off the frame. A card that leaves the box is a
              card clipped in half, and half a figure is worse than none. */}
          {hoverDetail && pointer && (
            <HoverCard detail={hoverDetail} status={statusOf(hovered)} pointer={pointer} />
          )}
        </div>

        {/* The running cost of the plan, along the foot. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
          {[
            ["States", plan.states],
            ["Local govts", plan.lgas],
            ["Booths", formatNumber(plan.booths)],
            ["Agents needed", formatNumber(plan.agents)],
          ].map(([label, value]) => (
            <span key={label} className="flex items-baseline gap-2">
              <span className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
                {label}
              </span>
              <span className="figure text-[0.75rem] font-bold text-white tabular-nums">
                {value}
              </span>
            </span>
          ))}
          <span className="figure ml-auto text-[0.625rem] text-white/35">One agent per booth</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ plan */}
      {/* ── ONE SCROLL, NOT THREE ────────────────────────────────────────
          This column used to be exactly the height of the map with "In the
          plan" absorbing the slack and scrolling inside itself. A fourth panel
          does not fit that: on a 1080p screen the three fixed sections leave
          the plan list about thirty pixels, which is a list you cannot read.
          So the column itself scrolls and the sections inside it are their own
          natural height. A panel that scrolls inside a panel that scrolls is
          two scrollbars competing for the same wheel, and the reader loses. */}
      <div className="flex flex-col gap-3">
        {/* ------------------------------------------------- what is under it */}
        <PlaceDetail
          detail={focus}
          status={statusOf(focus?.key ?? null)}
          national={NATIONAL}
          basis={basis}
        />

        {/* ------------------------------------------------------ the basis */}
        <section className="rounded-dash border border-dash-line bg-dash-card p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Plan against
          </p>

          <div className="mt-2 grid grid-cols-2 gap-1">
            {BASES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setBasisKey(item.key)}
                className={cn(
                  "rounded-dash-sm px-2.5 py-1.5 text-[0.75rem] font-bold transition-colors",
                  basisKey === item.key
                    ? "bg-dash-ink text-white"
                    : "border border-dash-line text-dash-muted hover:text-dash-ink"
                )}
              >
                {item.short}
                {!item.real && <span className="ml-1 text-[0.5625rem] opacity-70">derived</span>}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[0.6875rem] leading-relaxed text-dash-muted">{basis.note}</p>

          <p className="figure mt-3 text-[2rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
            {formatShare(plan.reach)}
          </p>
          <p className="mt-1.5 text-[0.8125rem] text-dash-muted">
            {formatNumber(plan.value)} of {formatNumber(NATIONAL[basis.key])} {basis.unit}
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-dash-bg">
            <div
              className="h-full rounded-full bg-dash-ink transition-[width] duration-300"
              style={{ width: `${Math.min(100, plan.reach)}%` }}
            />
          </div>

          <dl className="mt-4 space-y-2 border-t border-dash-line pt-3 text-[0.8125rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-dash-muted">Share of all booths</dt>
              <dd className="figure font-bold text-dash-ink">{formatShare(plan.boothShare)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-dash-muted">Agents to recruit</dt>
              <dd className="figure font-bold text-dash-ink">{formatNumber(plan.agents)}</dd>
            </div>
          </dl>
        </section>

        {/* --------------------------------------------------- where next */}
        <section className="rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-center gap-2 border-b border-dash-line px-4 py-3">
            <Target size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
            <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
              Where to work next
            </h3>
            {!lens.real && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase text-amber-900">
                Synthetic
              </span>
            )}
          </header>

          <div className="border-b border-dash-line px-4 py-2.5">
            <label
              htmlFor="plan-lens"
              className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
            >
              Prioritise by
            </label>
            <select
              id="plan-lens"
              value={lensKey}
              onChange={(event) => setLensKey(event.target.value)}
              className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-bg px-2.5 py-2 text-[0.8125rem] font-semibold text-dash-ink outline-none focus:border-dash-ink"
            >
              {LENSES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                  {item.real ? "" : " (synthetic)"}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-dash-muted">{lens.note}</p>
          </div>

          <ul className="divide-y divide-dash-line">
            {shortlist.length === 0 ? (
              <li className="px-4 py-4 text-center text-[0.8125rem] text-dash-muted">
                Every state is in the plan.
              </li>
            ) : (
              shortlist.map(({ state, note }) => (
                <li key={state.code}>
                  <button
                    type="button"
                    onClick={() => take([state.code])}
                    onMouseEnter={() => setHovered(state.code)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-dash-bg"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                        {state.name}
                      </span>
                      <span className="figure block text-[0.6875rem] text-dash-muted">{note}</span>
                    </span>
                    <span className="figure shrink-0 text-[0.75rem] font-bold text-dash-ink tabular-nums">
                      {formatNumber(basis.of(state))}
                    </span>
                    <span className="shrink-0 text-[0.6875rem] font-bold text-dash-muted">add</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* ---------------------------------------------------- in the plan */}
        <section className="flex flex-col rounded-dash border border-dash-line bg-dash-card">
          <header className="flex items-center gap-2 border-b border-dash-line px-4 py-3">
            <Layers size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
            <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
              In the plan
            </h3>
            <span className="figure ml-auto text-[0.6875rem] text-dash-muted">
              {plan.states} {plan.states === 1 ? "state" : "states"}
            </span>
          </header>

          {summary.length === 0 ? (
            <p className="px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
              Nothing chosen yet. Tap a state to add it whole, or tap it twice to open it and take
              only the local governments, wards or booths you want.
            </p>
          ) : (
            <ul className="divide-y divide-dash-line">
              {summary.map((entry) => (
                <li key={entry.code}>
                  <button
                    type="button"
                    onClick={() => setPicked((current) => clearUnder(current, entry.code))}
                    onMouseEnter={() => setHovered(entry.code)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-dash-bg"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        entry.exact ? "bg-red-500" : "bg-red-900"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                        {byCode.get(entry.code)?.name ?? entry.code}
                      </span>
                      <span className="block text-[0.6875rem] text-dash-muted">{entry.detail}</span>
                    </span>
                    <span className="shrink-0 text-[0.6875rem] text-dash-muted">remove</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer className="flex gap-2 border-t border-dash-line p-3">
            <button
              type="button"
              onClick={exportPlan}
              disabled={summary.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-dash-sm bg-dash-ink px-3 py-2.5 text-[0.8125rem] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
            >
              <Download size={14} strokeWidth={2.5} />
              Export plan
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Map())}
              disabled={summary.length === 0}
              aria-label="Clear the plan"
              className="inline-flex size-10 items-center justify-center rounded-dash-sm border border-dash-line text-dash-ink transition-colors hover:border-dash-ink disabled:opacity-40"
            >
              <RotateCcw size={15} strokeWidth={2.5} />
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

/* ── the readout ─────────────────────────────────────────────────────────── */

/**
 * How a place stands in the plan, in one word.
 *
 * Colour never carries this on its own: the word is printed. The map already
 * says the same thing in fill, and a planner reading a projection of this
 * screen in a lit room may not be able to tell the two reds apart.
 */
const STATUS = {
  chosen: { label: "In the plan", tone: "bg-red-500 text-white" },
  partly: { label: "Partly covered", tone: "bg-red-900 text-white" },
  covered: { label: "Covered by its state", tone: "bg-red-500 text-white" },
  carved: { label: "Taken out", tone: "bg-white/15 text-white" },
  none: { label: "Not in the plan", tone: "bg-white/10 text-white/60" },
};

/**
 * The card that follows the pointer.
 *
 * ── IT IS PLACED, NOT CENTRED ─────────────────────────────────────────────
 * Offset from the pointer rather than centred on it, because a card under the
 * finger hides the shape it describes — and on a touch wall the finger is
 * already covering some of it. Once the card would cross the right or bottom
 * edge it flips to the other side of the pointer instead of being clamped:
 * clamping slides it over the shape, which is the thing it must never do.
 */
function HoverCard({ detail, status, pointer }) {
  /* The width is fixed by the class below, so it can be a constant. */
  const WIDTH = 224;
  const GAP = 18;

  /* ── THE HEIGHT IS MEASURED, NOT WRITTEN DOWN ─────────────────────────
     It used to be a constant, and a constant goes stale the first time a row
     is added: the flip believed the card ended fifty pixels above where it
     really did, so it clipped against the bottom of the frame instead of
     flipping above the pointer. Now the card measures itself once it has
     drawn and the flip uses that, which stays true however this card grows.
     The number below is only the first frame's guess, before any measurement
     exists — close enough that nothing visibly jumps. */
  const card = useRef(null);
  const [height, setHeight] = useState(400);

  /* Re-measured whenever the place changes as well as after a measurement
     settles: a place with nothing counted in it drops the party block, and a
     card that got shorter must not go on being flipped as though it had not. */
  useLayoutEffect(() => {
    const box = card.current?.getBoundingClientRect();
    if (box && Math.abs(box.height - height) > 1) setHeight(box.height);
  }, [height, detail]);

  const flipX = pointer.x + GAP + WIDTH > pointer.width;
  const flipY = pointer.y + GAP + height > pointer.height;

  const mark = STATUS[status] ?? STATUS.none;

  return (
    <div
      ref={card}
      aria-hidden="true"
      className="pointer-events-none absolute z-20 w-56 overflow-hidden rounded-dash border border-white/15 bg-board/95 shadow-e3 backdrop-blur-sm"
      style={{
        left: flipX ? pointer.x - GAP - WIDTH : pointer.x + GAP,
        top: flipY ? Math.max(0, pointer.y - GAP - height) : pointer.y + GAP,
      }}
    >
      <header className="border-b border-white/10 px-3 py-2">
        <p className="truncate font-display text-[0.875rem] font-extrabold text-white">
          {detail.name}
        </p>
        <p className="mt-0.5 truncate text-[0.6875rem] text-white/45">
          {detail.kind === "lga"
            ? `Local government · ${detail.parent}`
            : detail.kind === "ward"
              ? `Ward · ${detail.parent}`
              : detail.kind === "unit"
                ? `Polling unit · ${detail.parent}`
                : "State"}
        </p>
      </header>

      <dl className="divide-y divide-white/10">
        <Line
          label="Registered voters"
          value={formatNumber(detail.registered)}
          lead
        />
        <Line label="Votes cast 2023" value={formatNumber(detail.cast)} />
        <Line label="Turnout" value={formatShare(detail.turnout)} />
        <Line label="Polling units" value={formatNumber(detail.booths)} />
        <Line label="Voters per unit" value={formatNumber(detail.perBooth)} />
      </dl>

      {/* Who carried the place used to be one line here. It is the whole
          ballot now, which says that and four other things besides. */}
      <PartySplit votes={detail.votes} winner={detail.winner} tone="board" />

      <footer className="flex items-center gap-1.5 border-t border-white/10 px-3 py-2">
        <span
          className={cn(
            "rounded-dash-sm px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] uppercase",
            mark.tone
          )}
        >
          {mark.label}
        </span>
        {detail.estimate && (
          <span className="ml-auto text-[0.5625rem] font-bold tracking-[0.08em] text-amber-300/80 uppercase">
            Estimate
          </span>
        )}
        {!detail.estimate && (
          <span className="ml-auto text-[0.5625rem] text-white/30">Declared 2023</span>
        )}
      </footer>
    </div>
  );
}

/** One rung of the trail. Four of them now, so it is a component. */
function Crumb({ label, last, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
        last ? "text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
      )}
    >
      {label}
    </button>
  );
}

function Line({ label, value, lead = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <dt className={cn("text-[0.6875rem]", lead ? "text-white/70" : "text-white/45")}>{label}</dt>
      <dd
        className={cn(
          "figure shrink-0 font-bold text-white tabular-nums",
          lead ? "text-[0.9375rem]" : "text-[0.75rem]"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * What every party got in the place under the pointer.
 *
 * ── WHY THE WHOLE BALLOT AND NOT THE WINNER ────────────────────────────────
 * "APC by 4.2%" is one fact about a place, and on a planning board it is the
 * least useful one. A local government that split 39/37 is a different piece
 * of work from one that split 71/12; a party lying third on 40,000 votes is a
 * different prospect from one lying third on 400. None of that survives a
 * winner's name, and all of it is what a room deciding where to put agents is
 * actually arguing about.
 *
 * ── THE BAR IS THE ROW ─────────────────────────────────────────────────────
 * The bar is drawn behind each row rather than in a column of its own, because
 * at the hover card's width a bar column takes exactly the space the vote
 * figure needs, and truncating a number to make room for a picture of that
 * number is the wrong trade. It runs against the leading party rather than
 * against 100%: in a four-way race with a 38% winner every bar scaled to 100
 * is short, and the shape of the contest disappears. Every row still prints
 * its own figure and its own share, so nothing here depends on reading a bar,
 * or on telling two party colours apart.
 *
 * ── THE SAME BLOCK ON TWO SURFACES ─────────────────────────────────────────
 * `board` is the near-black map; `card` is the white panel beside it. Only the
 * colours change, never the rows or their order, so a reader who has learnt
 * this block in one place can read it in the other without relearning it. The
 * party hues are the two sets already in this product, each stepped for the
 * surface it sits on rather than one set used at two contrasts.
 * ───────────────────────────────────────────────────────────────────────────
 */
function PartySplit({ votes, winner, tone = "card" }) {
  const board = tone === "board";
  const { rows, total, lead } = standings(votes);

  /* Nothing counted here. Five rows of zeroes look like a result where there
     is none, so the block simply does not appear. */
  if (!total) return null;

  return (
    <section className={cn("border-t", board ? "border-white/10" : "border-dash-line")}>
      <div
        className={cn(
          "flex items-baseline justify-between gap-2",
          board ? "px-3 pt-2 pb-1" : "px-4 pt-3 pb-1.5"
        )}
      >
        {/* ── BOTH LINES REFUSE TO WRAP ────────────────────────────────
            Left to wrap, "2023 presidential" breaks after the year the moment
            the winner beside it is NNPP rather than LP, and the block gains a
            line for the longest party name on the ballot. Neither half is
            worth wrapping, so the margin is stated in the fewest words that
            still say it and both lines are held on one. */}
        <p
          className={cn(
            "text-[0.5625rem] font-semibold tracking-[0.1em] whitespace-nowrap uppercase",
            board ? "text-white/35" : "text-dash-muted"
          )}
        >
          2023 presidential
        </p>
        {winner && (
          <p
            className={cn(
              "shrink-0 text-[0.625rem] whitespace-nowrap",
              board ? "text-white/45" : "text-dash-muted"
            )}
          >
            <span className={cn("figure font-bold", board ? "text-white/75" : "text-dash-ink")}>
              {winner.id}
            </span>{" "}
            by {formatShare(winner.margin)}
          </p>
        )}
      </div>

      <ul className={cn("pb-1.5", board ? "px-1.5" : "px-2.5")}>
        {rows.map((party) => (
          <li
            key={party.id}
            className="relative isolate flex items-center gap-2 rounded-dash-sm px-1.5 py-[0.1875rem]"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 -z-10 rounded-dash-sm"
              style={{
                /* A party with votes never draws nothing: a sliver says "few",
                   an empty row says "none", and they are different facts. */
                width: `${party.votes ? Math.max((party.votes / lead) * 100, 2) : 0}%`,
                background: board ? party.token : party.fill,
                opacity: board ? 0.34 : 0.18,
              }}
            />
            <span
              className={cn(
                "figure w-12 shrink-0 text-[0.6875rem] font-bold",
                board ? "text-white" : "text-dash-ink"
              )}
            >
              {party.label}
            </span>
            <span
              className={cn(
                "figure ml-auto shrink-0 text-[0.6875rem] font-bold tabular-nums",
                board ? "text-white" : "text-dash-ink"
              )}
            >
              {formatNumber(party.votes)}
            </span>
            <span
              className={cn(
                "figure w-11 shrink-0 text-right text-[0.625rem] tabular-nums",
                board ? "text-white/45" : "text-dash-muted"
              )}
            >
              {formatShare(party.share)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The panel that keeps the board from being blank.
 *
 * ── WHY IT FALLS BACK RATHER THAN EMPTYING ────────────────────────────────
 * It describes whatever is under the pointer; when nothing is, it describes
 * the state being worked inside; when there is none, the country. A planner
 * always has a place in front of them, so the panel always has something true
 * to say, and it never teaches the reader that this corner of the screen goes
 * blank and can be ignored.
 */
function PlaceDetail({ detail, status, national, basis }) {
  const mark = detail ? (STATUS[status] ?? STATUS.none) : null;
  const nationalWinner = useMemo(() => winnerOf(national.votes), [national.votes]);

  const rows = detail
    ? [
        ["Registered voters", formatNumber(detail.registered)],
        ["Votes cast 2023", formatNumber(detail.cast)],
        ["Turnout", formatShare(detail.turnout)],
        /* Not also "agents at one each": one agent per booth is the product's
           own rule, so that row is this row again under a second name, and a
           table that prints the same figure twice teaches the reader to stop
           reading it. The plan's own agent count is in the panel below. */
        ["Polling units to staff", formatNumber(detail.booths)],
        ["Voters per unit", formatNumber(detail.perBooth)],
        /* Who carried it is not a row here either: the party block below says
           that and gives the four figures behind it. */
      ]
    : [
        ["Registered voters", formatNumber(national.registered)],
        ["Votes cast 2023", formatNumber(national.cast)],
        ["Polling units to staff", formatNumber(national.booths)],
        [
          "Voters per unit",
          formatNumber(Math.round(national.registered / Math.max(national.booths, 1))),
        ],
        ["States", formatNumber(states2023.length)],
      ];

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-start gap-2 border-b border-dash-line px-4 py-3">
        {detail && detail.kind !== "state" ? (
          <MapPin size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-dash-muted" />
        ) : (
          <Users size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-dash-muted" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[0.875rem] font-extrabold text-dash-ink">
            {detail ? detail.name : "Nigeria"}
          </h3>
          <p className="mt-0.5 truncate text-[0.6875rem] text-dash-muted">
            {!detail
              ? "Nothing under the pointer. The whole country, for scale"
              : detail.kind === "lga"
                ? `Local government · ${detail.parent}`
                : detail.kind === "ward"
                  ? `Ward · ${detail.parent}`
                  : detail.kind === "unit"
                    ? `Polling unit · ${detail.parent}`
                    : "State · declared 2023"}
          </p>
        </div>
        {detail?.estimate && (
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.5625rem] font-bold text-amber-900 uppercase">
            Estimate
          </span>
        )}
      </header>

      <dl className="divide-y divide-dash-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2">
            <dt className="text-[0.75rem] text-dash-muted">{label}</dt>
            <dd className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* The country's own split when nothing is under the pointer, so the
          panel teaches this block before a reader has hovered anything, and
          every place they then hover is read against a figure they have
          already seen. */}
      <PartySplit
        votes={detail ? detail.votes : national.votes}
        winner={detail ? detail.winner : nationalWinner}
        tone="card"
      />

      <footer className="border-t border-dash-line px-4 py-2.5">
        {mark ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-dash-sm px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] uppercase",
                status === "none" ? "bg-dash-bg text-dash-muted" : "bg-dash-ink text-white"
              )}
            >
              {mark.label}
            </span>
            <span className="text-[0.6875rem] text-dash-muted">
              {basis.short} is what the plan is costed on
            </span>
          </div>
        ) : (
          <p className="text-[0.6875rem] leading-relaxed text-dash-muted">
            Hover any state or local government to read its figures here.
          </p>
        )}

        {detail?.estimate && (
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-dash-muted">
            Apportioned from the declared state total, every party&rsquo;s vote above included.
            Each level divides the one above it and always adds back to it, so the shape is right
            all the way down to a booth and each single figure is an estimate. Your own returns
            replace it as they land.
          </p>
        )}
      </footer>
    </section>
  );
}
