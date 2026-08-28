"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, Layers, Loader2, MapPin, RotateCcw, Target, Users } from "lucide-react";

import { PARTY_FILL } from "./Charts";
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

export default function PlanningMap({ shapes }) {
  const [openState, setOpenState] = useState(null);
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
   * ── HOW A SELECTION IS KEYED, AND WHY IT HAS THREE FORMS ─────────────────
   * A state is not a peer of its local governments, it *is* them. Picking Kano
   * means all 44 of Kano's local governments, and the total has to say Kano
   * once however many of its parts are also ticked.
   *
   * The first version stored a whole state and its local governments as two
   * independent kinds of pick and added both. Taking Kano and then ticking
   * three places inside Kano counted Kano's register once, and three
   * forty-fourths of it a second time. Enough of that and the reach went past
   * 100%, which is not a rounding problem, it is the model being wrong.
   *
   *   "KAN"           the whole state
   *   "KAN:Nassarawa" one local government, where the state is not taken whole
   *   "KAN!Nassarawa" one local government carved OUT of a whole state
   *
   * The third form is what makes tapping inside a selected state do the only
   * thing it can sensibly mean. The state is already covered, so the tap takes
   * that place back out and the figures go down. Adding it again would be
   * adding something you already have.
   */
  const [picked, setPicked] = useState(() => new Set());

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
   * Every state contributes exactly once, and never more than itself.
   *
   * The plan is folded into one entry per state first, whole or a named set of
   * parts, and only then costed. That ordering is the fix: by the time
   * anything is added up, each state has a single answer for what is covered
   * inside it, so there is no path left where a place can be counted twice.
   */
  const plan = useMemo(() => {
    const cover = new Map();
    const entry = (code) => {
      if (!cover.has(code)) cover.set(code, { whole: false, include: new Set(), exclude: new Set() });
      return cover.get(code);
    };

    for (const key of picked) {
      if (key.includes("!")) entry(key.split("!")[0]).exclude.add(key.split("!")[1]);
      else if (key.includes(":")) entry(key.split(":")[0]).include.add(key.split(":")[1]);
      else entry(key).whole = true;
    }

    let value = 0;
    let booths = 0;
    let states = 0;
    let lgas = 0;

    for (const [code, scope] of cover) {
      const state = byCode.get(code);
      if (!state) continue;
      const rows = lgaCache.get(code);

      if (scope.whole) {
        value += basis.of(state);
        booths += state.booths;
        states += 1;
        lgas += rows?.length ?? 0;

        /* Carve-outs come straight back off the state's own figures, so a
           state minus everything inside it lands at zero rather than at some
           remainder an average left behind. */
        for (const name of scope.exclude) {
          const row = rows?.find((item) => item.name === name);
          if (!row) continue;
          value -= basis.of(row);
          booths -= row.booths;
          lgas -= 1;
        }
        continue;
      }

      /* Parts only. An exclusion with no whole state behind it is meaningless,
         so it is ignored rather than allowed to subtract from a neighbour. */
      if (!scope.include.size) continue;
      states += 1;

      for (const name of scope.include) {
        lgas += 1;
        const row = rows?.find((item) => item.name === name);
        if (row) {
          value += basis.of(row);
          booths += row.booths;
        } else {
          /* Never opened, so cost it at the state's own average. */
          const parts = Math.max(wardCount(code) * 2, 1);
          value += Math.round(basis.of(state) / parts);
          booths += Math.round(state.booths / parts);
        }
      }
    }

    /* Guarding the arithmetic as well as the model. If these ever clamp, the
       fold above has a hole in it and the figure on screen would be a lie. */
    const total = NATIONAL[basis.key] || 1;
    value = Math.max(0, Math.min(value, total));
    booths = Math.max(0, Math.min(booths, NATIONAL.booths));

    return {
      cover,
      states,
      lgas: Math.max(0, lgas),
      value,
      booths,
      /* One agent per booth is the product's own rule: seatsPerUnit is 1. */
      agents: booths,
      reach: (value / total) * 100,
      boothShare: (booths / NATIONAL.booths) * 100,
    };
  }, [picked, byCode, lgaCache, basis]);

  /* ------------------------------------------------------------- shortlist */
  /** The places not yet covered, ranked by the chosen lens. */
  const shortlist = useMemo(() => {
    const scope = plan.cover;
    return states2023
      .filter((state) => {
        const held = scope.get(state.code);
        return !held || (!held.whole && !held.include.size);
      })
      .map((state) => ({ state, score: lens.score(state, basis), note: lens.show(state, basis) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [plan.cover, lens, basis]);

  /* ------------------------------------------------------------- gestures */
  /** Taking or dropping a whole state, and clearing whatever was set inside it. */
  const toggleState = (code) =>
    setPicked((current) => {
      const next = new Set(current);
      const had = next.has(code);
      /* Either direction wipes the parts. Dropping a state must not leave
         carve-outs behind to reappear next time it is taken, and taking one
         must not leave individual ticks that now mean nothing. */
      for (const key of [...next]) {
        if (key.startsWith(`${code}:`) || key.startsWith(`${code}!`)) next.delete(key);
      }
      if (had) next.delete(code);
      else next.add(code);
      return next;
    });

  /**
   * Taking or dropping one local government.
   *
   * Inside a state already taken whole this carves the place out instead of
   * adding it, because you cannot add what you already have. That is the
   * behaviour the arithmetic depends on, and it is the only reading of the
   * gesture that leaves the reader in control: tap to remove, tap to put back.
   */
  const toggleLga = (code, name) =>
    setPicked((current) => {
      const next = new Set(current);
      const whole = next.has(code);
      const key = `${code}${whole ? "!" : ":"}${name}`;

      if (next.has(key)) next.delete(key);
      else next.add(key);

      /* Carving out the last place leaves a state covering nothing, so it
         stops being selected at all rather than sitting at zero. */
      if (whole) {
        const rows = lgaCache.get(code);
        const carved = [...next].filter((item) => item.startsWith(`${code}!`)).length;
        if (rows && carved >= rows.length) {
          for (const item of [...next]) {
            if (item === code || item.startsWith(`${code}!`)) next.delete(item);
          }
        }
      }

      return next;
    });

  /** Is this place counted in the plan right now? */
  const isPicked = (key) => {
    if (!key.includes(":")) return picked.has(key);
    const [code, name] = key.split(":");
    /* Inside a whole state everything counts except what has been carved out. */
    if (picked.has(code)) return !picked.has(`${code}!${name}`);
    return picked.has(key);
  };

  /** Some of this state is covered, but not the whole of it. */
  const statePartly = (code) =>
    picked.has(code)
      ? [...picked].some((key) => key.startsWith(`${code}!`))
      : [...picked].some((key) => key.startsWith(`${code}:`));

  /* ------------------------------------------------------- the third tap */

  /**
   * Drop a state and undo everything the taps before it did.
   *
   * The map also comes back out to the country, because a state that is no
   * longer in the plan is not a state anybody is still working inside, and
   * leaving the frame zoomed into it would say otherwise.
   */
  const dropState = useCallback((code) => {
    const held = sequence.current.snapshot;
    setPicked(() => {
      const next = new Set(held ?? []);
      for (const key of [...next]) {
        if (key === code || key.startsWith(`${code}:`) || key.startsWith(`${code}!`)) {
          next.delete(key);
        }
      }
      return next;
    });
    setOpenState((current) => (current?.code === code ? null : current));
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
      run.snapshot = new Set(picked);
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

      if (key.includes(":")) {
        const [code, name] = key.split(":");
        const state = byCode.get(code);
        const row = (lgaCache.get(code) ?? []).find((item) => item.name === name);
        if (!state || !row) return null;

        return {
          key,
          kind: "lga",
          name,
          parent: state.name,
          code,
          registered: row.registered,
          cast: row.total,
          booths: row.booths,
          turnout: row.turnout,
          perBooth: row.density,
          wards: wardCount(name),
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
    [byCode, lgaCache]
  );

  /** Where this place stands in the plan, in one word the readout can print. */
  const statusOf = (key) => {
    if (!key) return "none";
    if (key.includes(":")) {
      const [code, name] = key.split(":");
      if (picked.has(code)) return picked.has(`${code}!${name}`) ? "carved" : "covered";
      return picked.has(key) ? "chosen" : "none";
    }
    if (picked.has(key)) return statePartly(key) ? "partly" : "chosen";
    return statePartly(key) ? "partly" : "none";
  };

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
   * The plan as a file, written from the same fold the totals use, so the
   * export and the screen can never disagree about what is covered.
   */
  const exportPlan = () => {
    const lines = [`scope,state,local government,${basis.short.toLowerCase()},booths`];

    for (const [code, scope] of [...plan.cover.entries()].sort()) {
      const state = byCode.get(code);
      if (!state) continue;
      const rows = lgaCache.get(code);
      const figures = (name) => {
        const row = rows?.find((item) => item.name === name);
        return row ? `${basis.of(row)},${row.booths}` : ",";
      };

      if (scope.whole) {
        lines.push(`State,${state.name},,${basis.of(state)},${state.booths}`);
        for (const name of [...scope.exclude].sort()) {
          lines.push(`Excluded,${state.name},"${name}",${figures(name)}`);
        }
        continue;
      }
      for (const name of [...scope.include].sort()) {
        lines.push(`LGA,${state.name},"${name}",${figures(name)}`);
      }
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
          <button
            type="button"
            onClick={() => setOpenState(null)}
            className={cn(
              "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
              inState ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-white"
            )}
          >
            Nigeria
          </button>
          {inState && (
            <>
              <ChevronRight size={13} className="shrink-0 text-white/35" />
              <span className="px-2 py-1 text-[0.8125rem] font-semibold text-white">
                {openState.name}
              </span>
            </>
          )}
          <span className="ml-auto text-[0.75rem] text-white/45">
            {inState
              ? picked.has(openState.code)
                ? "This state is covered. Tap a local government to take it back out"
                : "Tap a local government to add it"
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
              const key = inState ? `${openState.code}:${shape.name}` : shape.code;
              const chosen = isPicked(key);
              const carved =
                inState && picked.has(openState.code) && picked.has(`${openState.code}!${shape.name}`);
              const partly = !inState && statePartly(shape.code);
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
                      dropState(code);
                      return;
                    }

                    if (inState) {
                      toggleLga(openState.code, shape.name);
                      return;
                    }
                    if (chosen) {
                      /* Second tap on a chosen state opens it, so one gesture
                         covers both "take the whole state" and "take part". */
                      setOpenState({ code: shape.code, name: shape.name });
                      return;
                    }
                    toggleState(shape.code);
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
                    onClick={() => toggleState(state.code)}
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

          {plan.cover.size === 0 ? (
            <p className="px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
              Nothing chosen yet. Tap a state to add it whole, or tap it twice to open it and take
              only the local governments you want.
            </p>
          ) : (
            <ul className="divide-y divide-dash-line">
              {[...plan.cover.entries()]
                .sort()
                .filter(([, scope]) => scope.whole || scope.include.size)
                .map(([code, scope]) => {
                  const state = byCode.get(code);
                  const detail = scope.whole
                    ? scope.exclude.size
                      ? `whole state, less ${scope.exclude.size} local ${scope.exclude.size === 1 ? "government" : "governments"}`
                      : "whole state"
                    : `${scope.include.size} local ${scope.include.size === 1 ? "government" : "governments"}`;

                  return (
                    <li key={code}>
                      <button
                        type="button"
                        onClick={() => toggleState(code)}
                        onMouseEnter={() => setHovered(code)}
                        onMouseLeave={() => setHovered(null)}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-dash-bg"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-2.5 shrink-0 rounded-full",
                            scope.whole && !scope.exclude.size ? "bg-red-500" : "bg-red-900"
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                            {state?.name ?? code}
                          </span>
                          <span className="block text-[0.6875rem] text-dash-muted">{detail}</span>
                        </span>
                        <span className="shrink-0 text-[0.6875rem] text-dash-muted">remove</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}

          <footer className="flex gap-2 border-t border-dash-line p-3">
            <button
              type="button"
              onClick={exportPlan}
              disabled={plan.cover.size === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-dash-sm bg-dash-ink px-3 py-2.5 text-[0.8125rem] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
            >
              <Download size={14} strokeWidth={2.5} />
              Export plan
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              disabled={plan.cover.size === 0}
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
          {detail.kind === "lga" ? `Local government · ${detail.parent}` : "State"}
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
        {detail?.kind === "lga" ? (
          <MapPin size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-dash-muted" />
        ) : (
          <Users size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-dash-muted" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[0.875rem] font-extrabold text-dash-ink">
            {detail ? detail.name : "Nigeria"}
          </h3>
          <p className="mt-0.5 truncate text-[0.6875rem] text-dash-muted">
            {detail
              ? detail.kind === "lga"
                ? `Local government · ${detail.parent}`
                : "State · declared 2023"
              : "Nothing under the pointer. The whole country, for scale"}
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
            Apportioned from {detail.parent}&rsquo;s declared total, every party&rsquo;s vote
            above included. The parts always add back to the state, so the shape is right and each
            single figure is an estimate.
          </p>
        )}
      </footer>
    </section>
  );
}
