"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Gauge,
  Loader2,
  MapPin,
  Percent,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Vote,
} from "lucide-react";

import TopShell from "./TopShell";
import { useGreeting } from "./useGreeting";
import ScopeMap, { LABEL, describe, magnitude } from "./ScopeMap";
import ScopePanel from "./ScopePanel";
import PartyBreakdown from "./PartyBreakdown";
import CoordinatorWatch from "./CoordinatorWatch";
import IncidentStream from "./IncidentStream";
import DivergencePanel from "./DivergencePanel";
import Analytics from "./Analytics";
import ElectionSwitcher from "./ElectionSwitcher";
import PartyStrength from "./PartyStrength";
import PlanningMap from "./PlanningMap";
import RulingParty from "./RulingParty";
import Whiteboard from "./Whiteboard";
import { RoomVoiceProvider } from "./RoomVoice";
import LiveRefresh from "./LiveRefresh";
import RaceSwitcher from "./RaceSwitcher";
import Sparkline from "./Sparkline";
import { PARTY_FILL } from "./Charts";
import { snapshot, parties, allParties } from "@/lib/replay";
import { normalise } from "@/lib/assistant";
import { board as boardStore, buildCard } from "@/lib/whiteboard";
import { apportion, wardCount, unitCount, liveRowsFrom, liveNodeFor } from "@/lib/drill";
import { COMMERCIAL_CENTRES } from "@/lib/geo";
import { ruling, seatsBy, crossedFloor, FCT } from "@/lib/governors";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The situation room.
 *
 * ── ONE FRAME, FOUR LEVELS, FOUR LAYERS ────────────────────────────────────
 * The top bar never leaves. Clicking a state does not open a panel or navigate
 * anywhere, the country in the frame is replaced by the state, at the same
 * size, and the list beside it narrows from 37 states to that state's local
 * governments. Again for wards, again for polling units.
 *
 * The layer and the level are independent. Voters, Turnout and Clusters each
 * drill on their own terms and show their own statistics; they do not fall
 * back to the election result. Changing layer keeps your place, and changing
 * place keeps your layer.
 * ───────────────────────────────────────────────────────────────────────────
 */
/**
 * The eight surfaces, in three groups.
 *
 * ── WHY GROUPED AND NOT JUST LISTED ────────────────────────────────────────
 * Eight equal pills in one track is eight decisions every time somebody looks
 * up, and the tenth tab would have broken it outright. They are not eight
 * peers: four are layers on the same map, two are what the field is doing
 * right now, and two are about a day that has not happened yet. Grouping them
 * turns "which of eight" into "which of three, then which of two or four",
 * which is the difference between reading a menu and recognising a shape.
 *
 * Nothing is hidden behind a "more" control. On a desk where somebody has to
 * reach a screen inside a live broadcast, a tab that takes two clicks is a tab
 * that does not get used.
 */
const TAB_GROUPS = [
  {
    id: "count",
    label: "The count",
    tabs: [
      { value: "results", label: "Results" },
      { value: "register", label: "Voters" },
      { value: "turnout", label: "Turnout" },
      /* ── NO ACCREDITATION LAYER ──────────────────────────────────────
         It was the earliest hard figure of the night and it drew a map of
         almost nothing: the replay carries no accreditation column at all,
         so every shape on it was an em dash until our own returns started
         landing. A layer that is empty on the surface most people open is a
         layer that teaches them the map is broken. The figure itself has not
         gone anywhere — it is on the telemetry strip whenever the board is
         live, and every return still files it. */
      { value: "density", label: "Clusters" },
      /* Not a fifth layer on the map. It is the same count seen against the
         commission's, which is the one question this room is given that the
         broadcast desk's version of the map is not, and it belongs with the
         count rather than off in "the field". */
      { value: "declared", label: "Declared" },
      /* Also not a map layer. It is the same country by party, but for the
         governorships rather than the presidential vote, and a room reading a
         return needs to know who holds the place it came from. */
      { value: "ruling", label: "Ruling party" },
    ],
  },
  {
    id: "field",
    label: "The field",
    /* Not layers on the map: one is about people, the other about events, and
       neither fits in a choropleth. */
    tabs: [
      { value: "watch", label: "Coordinators" },
      { value: "stream", label: "Reports" },
    ],
  },
  {
    id: "ahead",
    label: "Ahead",
    /* Everything above answers "what is happening". These two answer "what
       would happen" and "where will we work". */
    tabs: [
      { value: "analytics", label: "Analytics" },
      { value: "planning", label: "Planning" },
    ],
  },
  {
    id: "kept",
    label: "Kept",
    /* ── WHY THE BOARD IS ITS OWN GROUP ──────────────────────────────────
       It is not a ninth view of the night. It is the only surface here that
       holds several places at once and the only one somebody else fills in
       for you, so it belongs beside the other eight rather than among them.
       A group of one is honest about that; folding it into "Ahead" would
       have implied it was about a day that has not happened yet. */
    tabs: [
      { value: "parties", label: "Parties" },
      { value: "board", label: "Board" },
    ],
  },
];

const TABS = TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => ({ ...tab, group: group.id })));

const MAP_LAYERS = new Set(["results", "register", "turnout", "density"]);

/**
 * Arriving here from the rail, pointed at one view.
 *
 * This room's views are local state, not routes, so a link from anywhere else
 * in the product could only ever land on "Results". "Incident feed" in the
 * sidebar did exactly that: it went to /room#incidents, there was no such
 * anchor, and the reader arrived at the map wondering where the reports were.
 * A hash is the one thing a link can carry into a screen that does not put its
 * views in the URL.
 *
 * It sets the view on arrival and then gets out of the way: the tabs are the
 * control of this screen, and a hash left in the address bar must never argue
 * with the last thing somebody pressed.
 */
const HASH_LAYERS = {
  "#incidents": "stream",
  "#coordinators": "watch",
  "#declared": "declared",
  "#analytics": "analytics",
  "#planning": "planning",
};

function subscribeHash(onChange) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash;
const noHash = () => "";

/* How much the board will hold before the oldest starts falling off. */
const BOARD_LIMIT = 24;

/**
 * Whether two cards say the same thing.
 *
 * Identity is what a card is *about*, not when it was made: a reference is
 * the page it quotes, and everything else is a kind and a place. Two cards
 * that would draw identically are the same card however they got there.
 */
function sameCard(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "web") return a.subtitle === b.subtitle;
  if (a.kind === "answer") return a.text === b.text;
  return a.stateCode === b.stateCode && a.lga === b.lga && a.ward === b.ward;
}

/**
 * What the map is drawing, said in words on the screen itself.
 *
 * Four things, and the last two are the ones worth separating: a grey map
 * because nobody has filed anything yet and a grey map because nothing was
 * ever declared look identical and mean completely different things. A room
 * that cannot tell them apart cannot tell whether to ring somebody.
 */
const BOARD_SOURCE = {
  replay: "Demonstration · 2023 replay",
  returns: "Our agents' returns",
  declared: "Declared figures",
  empty: "Nothing filed yet",
};

const TICK = 220;

export default function SituationRoom({
  user,
  board,
  shapes,
  states,
  incidents = [],
  incidentCount,
  coordinators = [],
  watchSummary = { total: 0, filed: 0, located: 0, far: 0, silent: 0 },
  photos = {},
  /* The election switcher, built on the server and handed down: this is a
     client component and cannot read the cookie that names the current
     project, nor query the list. */
  projects = null,
  /* The states this election is actually fought in. Empty means the whole
     federation. */
  scopeStates = [],
  /* Our count held against what was announced. Built on the server by
     lib/gap-report.js — the same function /gap uses, so the headline here and
     the list there can never disagree. */
  divergence = null,
  /* ── THE RETURNS, FOLDED INTO THE PLACES THEY CAME FROM ─────────────────
     Present only for a live project. The board above draws the country; this
     draws everything underneath a state, and it holds what was filed and
     nothing else. Null on the 2023 replay, which apportions instead and says
     so on the screen. */
  liveTree = null,
  /* The project being watched, for the one line on screen that has to say
     whether this is a count or a worked example. */
  project = null,
  /* Where the figures on the map came from: "replay", "returns", "declared"
     or "empty". Decided on the server, which is the only place that can tell
     an empty count from an undeclared one. */
  boardSource = "replay",
  /* Which contest is on screen, and the others available on this project with
     how much of each has arrived. */
  race = "PRESIDENTIAL",
  races = [],
  filedByRace = {},
  onRace,
}) {
  const [layer, setLayer] = useState("results");

  /* Adjusted during render when the hash changes, which is React's documented
     way to react to a changed value and the only one that cannot paint the
     wrong view for a frame first. The server snapshot is empty because a hash
     never reaches the server, so a cold load of /room#incidents corrects
     itself immediately after hydration and a click from another room, which
     fires no hash event at all, is caught by the same comparison. */
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [seenHash, setSeenHash] = useState("");
  if (hash !== seenHash) {
    setSeenHash(hash);
    if (HASH_LAYERS[hash]) setLayer(HASH_LAYERS[hash]);
  }
  /**
   * The states this contest is fought in.
   *
   * ── A GOVERNORSHIP IS NOT A FEDERATION ─────────────────────────────────
   * Every project used to draw all 37 states. On an Ekiti governorship that
   * meant 36 of them sitting grey — and grey, everywhere else in this product,
   * means "nobody has reported yet". Nobody is ever going to report from Kano
   * in an Ekiti election. Not-yet and not-applicable are different facts, and
   * a board that draws them the same way is quietly wrong all night.
   */
  const inScope = useMemo(() => {
    if (!scopeStates?.length) return states;
    const wanted = new Set(scopeStates);
    return states.filter((row) => wanted.has(row.code));
  }, [states, scopeStates]);

  /* A contest in one state opens on that state. There is no country to zoom
     out to, so the map starts where the election actually is. */
  const [path, setPath] = useState(() =>
    scopeStates?.length === 1
      ? [{ code: scopeStates[0], name: states.find((r) => r.code === scopeStates[0])?.name ?? scopeStates[0] }]
      : []
  ); // [state, lga, ward]
  const [hovered, setHovered] = useState(null);
  const [picked, setPicked] = useState(null); // the jurisdiction whose full card is open
  const [boundaries, setBoundaries] = useState(null); // { code, data } for one state
  const [cursor, setCursor] = useState(board.opening);
  const [reduced, setReduced] = useState(false);

  /**
   * What is on the board.
   *
   * ── WHY IT IS SAFE TO READ STORAGE WHILE RENDERING ─────────────────────
   * The stored board is read once, in the initialiser, which on the server
   * returns nothing and in the browser returns whatever was left up. Those
   * two disagree, and that is normally how a hydration mismatch is made.
   * It cannot make one here, because the room always opens on Results and
   * nothing below draws a card until somebody asks for the board. Reading it
   * in an effect instead would re-render the whole room a frame after every
   * load to no purpose.
   */
  /**
   * The board, as it stands.
   *
   * ── WHY IT STARTS EMPTY AND FILLS A MOMENT LATER ─────────────────────────
   * It used to read what was on the board while rendering. Local storage does
   * not exist on the server, so the page was built saying "nothing on the
   * board yet" and then hydrated on a machine that had four cards on it. The
   * two disagree, and React is entitled to throw away the markup and start
   * again when they do.
   *
   * So the first paint matches what the server sent, always, and what was on
   * the board is put back immediately afterwards. The functional update is
   * not decoration: if somebody managed to pin something in that gap, the
   * thing they just asked for wins over the thing they left there yesterday.
   */
  const [cards, setCards] = useState([]);

  useEffect(() => {
    const restore = setTimeout(() => {
      const kept = boardStore.load();
      if (kept?.length) setCards((current) => (current.length ? current : kept));
    }, 0);
    return () => clearTimeout(restore);
  }, []);

  /**
   * A place named out loud that we could hear but could not yet place.
   *
   * "Take me to Ikeja in Lagos" arrives before Lagos's local governments do,
   * and all 774 names are not worth shipping to every browser to cover it.
   * So the name is held here and spent the moment the boundary file lands.
   * A ref rather than state: nothing on screen depends on it, and it must not
   * cause a render of its own.
   */
  const pendingDrill = useRef(null);

  const [state, lga, ward] = path;
  const level = ["nation", "state", "lga", "ward"][path.length];

  /* ------------------------------------------------------------ the replay */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) setCursor(board.events.length);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [board.events.length]);

  useEffect(() => {
    if (reduced || cursor >= board.events.length) return;
    const timer = setTimeout(() => setCursor((value) => value + 1), TICK);
    return () => clearTimeout(timer);
  }, [reduced, cursor, board.events.length]);

  const view = useMemo(() => snapshot(board, cursor), [board, cursor]);

  /* What this board's vote arrays mean, position by position. A governorship
     board carries the parties that actually contested it — Accord won Osun and
     APGA won Anambra, and neither is one of the presidential four — so every
     screen that turns a position back into a party name has to read this and
     not the fixed list. See lib/replay.js and ScopeMap.partyCode. */
  const slots = board.parties ?? allParties;

  /* The places a return has just landed in, the last handful of batches.
     Drives the expanding rings on the map, which is the only thing on the
     screen that answers "where is it coming from right now". */
  const pulsing = useMemo(() => {
    const recent = board.events.slice(Math.max(0, cursor - 4), cursor);
    return new Set(recent.map((event) => board.states[event.state]?.code).filter(Boolean));
  }, [board, cursor]);

  /* -------------------------------------------------------- the boundaries
     What arrives is stamped with the state it was fetched for, and whether the
     map is still waiting is then read off that stamp rather than kept in a
     second flag of its own. A flag has to be switched on and off in the right
     order; a stamp cannot disagree with the shapes sitting next to it, so the
     spinner cannot be left running over a map that has already drawn. */
  const stateCode = state?.code ?? null;

  useEffect(() => {
    if (!stateCode) return;
    let cancelled = false;
    fetch(`/geo/lga/${stateCode}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setBoundaries({ code: stateCode, data });

        /* ── FINISHING A DRILL THAT WAS ASKED FOR OUT LOUD ──────────────
           Somebody said a local government by name a moment ago and the
           names have only just arrived. Matched loosely in both directions,
           because "Ikeja" should find "Ikeja" and "Oshodi Isolo" should find
           "Oshodi-Isolo", and a spoken name is never punctuated the way a
           boundary file is. No match means the word was not a place here,
           and the map stays on the state rather than picking something
           arbitrary a second after the person stopped talking. */
        const wanted = pendingDrill.current;
        pendingDrill.current = null;
        if (!wanted || !data?.lgas) return;

        const hit = data.lgas.find((row) => {
          const name = normalise(row.name);
          return name === wanted || name.includes(wanted) || wanted.includes(name);
        });
        if (hit) setPath((previous) => (previous.length === 1 ? [previous[0], { name: hit.name }] : previous));
      })
      .catch(() => !cancelled && setBoundaries({ code: stateCode, data: null }));
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  /* Only ever the boundaries of the state being looked at now. A reply for the
     state just left stays invisible, and so does one that has not landed. */
  const lgaShapes = boundaries?.code === stateCode ? boundaries.data : null;
  const loading = Boolean(stateCode) && boundaries?.code !== stateCode;

  /* ------------------------------------------------------------- the rows
     Each level's figures come from the level above and always sum back to it. */
  const stateData = useMemo(
    () => (state ? states.find((row) => row.code === state.code) : null),
    [state, states]
  );

  /**
   * The states, as they stand right now.
   *
   * ── EVERY LAYER IS LIVE ────────────────────────────────────────────────
   * An earlier pass only animated Results and left the other three reading
   * the static register, which made three of the four dashboards a printed
   * table. They are all derived from the same moving snapshot now:
   *
   *   Voters   how much of the register has actually reported, the register
   *            itself does not change, but its coverage does, all evening.
   *   Turnout  votes counted against the register of the booths that have
   *            reported. It is meaningless against the whole register at 10%
   *            counted, and this is the figure a room actually quotes.
   *   Clusters votes per reporting unit, where the volume is landing right
   *            now, which moves as the cities come in late.
   *
   * A place that has not reported returns null rather than zero, so it stays
   * grey on the map: silence is not a low number.
   */
  const nationRows = useMemo(
    () =>
      inScope.map((row) => {
        const live = view.byState.find((item) => item.code === row.code);
        const reported = live?.reported ?? false;
        const boothsIn = live?.units ?? 0;

        /* ── A LIVE COUNT IS NOT SCALED, BECAUSE THERE IS NOTHING TO SCALE ──
           The replay holds each state's finished 2023 result and shows the
           slice of it that has "arrived", which is the only way to play back an
           election that is already over. A live project has no finished result
           to take a slice of: the figures are the returns that were filed, and
           multiplying them by coverage would show a fraction of a fraction.

           So the same row is built two ways, from the same snapshot, and which
           one is used is decided by the board rather than by the caller
           remembering. */
        const factor = reported ? boothsIn / Math.max(row.booths, 1) : 0;
        const scaled = board.live
          ? (live?.votes ?? [0, 0, 0, 0, 0])
          : reported
            ? row.votes.map((value) => Math.round(value * factor))
            : [0, 0, 0, 0, 0];
        const scaledTotal = scaled.reduce((sum, value) => sum + value, 0);

        /* The slice of this state's register that has actually reported. Added
           up from the returns on a live board; estimated from coverage on the
           replay, which has no per-booth registers to add. */
        const registerIn = board.live
          ? (live?.registered ?? 0)
          : reported
            ? Math.round(row.registered * (boothsIn / Math.max(row.booths, 1)))
            : 0;

        return {
          key: row.code,
          name: row.name,
          reported,
          /* ── VOTES AND TOTAL MUST BE THE SAME COUNT ──────────────────
             This used to hand back the full declared votes alongside a total
             scaled to coverage, so any share computed as votes/total ran over
             100% mid-count and the stacked bars overflowed their track.

             Every party is now scaled by the same coverage factor and the
             total is the sum of exactly those scaled figures, so the two can
             never disagree. Scaling everyone identically also preserves the
             order of finish, which is what keeps a two-thousand-vote margin
             like Benue's from flipping as the count comes in. */
          votes: scaled,
          total: scaledTotal,
          /* Voters: the register that has reported, not the whole register. */
          registered: registerIn,
          fullRegister: row.registered,
          /* ── ACCREDITATION IS ITS OWN FIGURE, NOT A DERIVED ONE ───────
             How many people were accredited to vote, added up from the
             returns. It is not votes and it is not the register: the gap
             between accredited and votes cast is spoiled and unused ballots,
             and the gap between accredited and registered is who stayed
             home. Both are real signals and neither survives being folded
             into a turnout percentage.

             Only a live board has it. The replay is built from declared
             state totals, which do not carry an accreditation figure, so it
             is left null there rather than estimated — an invented
             accreditation figure on an election night is exactly the kind of
             number that gets quoted. */
          accredited: board.live ? (live?.accredited ?? 0) : null,
          booths: boothsIn,
          fullBooths: row.booths,
          coverage: live?.coverage ?? 0,
          /* Turnout: against the reporting register, which is the only
             denominator that means anything mid-count. */
          turnout: registerIn > 0 ? (scaledTotal / registerIn) * 100 : 0,
          /* Clusters: votes per unit that has reported, the live density of
             where the count is actually coming from. */
          density: boothsIn > 0 ? Math.round(scaledTotal / boothsIn) : 0,
        };
      }),
    [inScope, view.byState, board.live]
  );

  /* ── UNDERNEATH A STATE: FILED, OR APPORTIONED, NEVER BOTH ───────────────
     On a live project every level below the country is built from the returns
     themselves — a place with nothing filed in it simply is not there. On the
     2023 replay there are no per-booth returns to build from, so the state's
     declared total is divided down through its real local governments on a
     stable seed, exactly as before, and the screen says so underneath the map.

     The branch is on the tree being present rather than on a flag somebody has
     to remember to pass with it. */
  const liveStateNode = useMemo(
    () => (liveTree && state ? liveNodeFor(liveTree, state.name) : null),
    [liveTree, state]
  );

  const lgaRows = useMemo(() => {
    if (liveTree) return liveRowsFrom(liveStateNode);
    if (!stateData || !lgaShapes) return [];
    return apportion({
      names: lgaShapes.lgas.map((row) => row.name),
      votes: stateData.votes,
      booths: stateData.booths,
      registered: stateData.registered,
      parentKey: stateData.code,
    });
  }, [liveTree, liveStateNode, stateData, lgaShapes]);

  const liveLgaNode = useMemo(
    () => (liveStateNode && lga ? liveNodeFor(liveStateNode, lga.name) : null),
    [liveStateNode, lga]
  );

  const wardRows = useMemo(() => {
    if (liveTree) return liveRowsFrom(liveLgaNode);
    if (!lga) return [];
    const parent = lgaRows.find((row) => row.name === lga.name);
    if (!parent) return [];
    return apportion({
      names: Array.from({ length: wardCount(lga.name) }, (_, i) => `Ward ${String(i + 1).padStart(2, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: `${state.code}:${lga.name}`,
    });
  }, [liveTree, liveLgaNode, lga, lgaRows, state]);

  const unitRows = useMemo(() => {
    if (liveTree) {
      return liveRowsFrom(liveLgaNode && ward ? liveNodeFor(liveLgaNode, ward.name) : null);
    }
    if (!ward) return [];
    const parent = wardRows.find((row) => row.name === ward.name);
    if (!parent) return [];
    const key = `${state.code}:${lga.name}:${ward.name}`;
    return apportion({
      names: Array.from({ length: unitCount(key) }, (_, i) => `PU ${String(i + 1).padStart(3, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: key,
    });
  }, [liveTree, liveLgaNode, ward, wardRows, state, lga]);

  const rows =
    level === "nation" ? nationRows : level === "state" ? lgaRows : level === "lga" ? wardRows : unitRows;

  /* ------------------------------------------------------------- the search
     Every state, always, plus the local governments of whichever state is
     open, because "go to Jigawa" and "go to Birnin Kudu once I am in Jigawa"
     are the two questions a room actually asks, and neither is easy to answer
     by hunting for a shape on a map that is also changing colour. Wards and
     units are left out on purpose: they are numbered rather than named, so
     "Ward 07" would return thirty-seven identical rows. */
  const searchItems = useMemo(() => {
    const items = inScope.map((row) => ({
      key: `state:${row.code}`,
      label: row.name,
      hint: "State",
      go: () => setPath([{ code: row.code, name: row.name }]),
    }));

    if (state) {
      for (const row of lgaRows) {
        items.push({
          key: `lga:${state.code}:${row.key ?? row.name}`,
          label: row.name,
          hint: `Local government · ${state.name}`,
          go: () => setPath([state, { name: row.name }]),
        });
      }
    }

    return items;
  }, [inScope, state, lgaRows]);

  /* Searching from Coordinators or Reports means you want to see the place, so
     the map comes back with you rather than leaving you on a tab that cannot
     show it. */
  /* Reports, counted against the place they came from, so the map can say
     "three reports from here" in the same breath as the figures. Only at
     national level: an incident carries a state, not a ward. */
  const incidentsByPlace = useMemo(() => {
    if (level !== "nation") return null;
    const index = {};
    for (const item of incidents) {
      if (!item.stateCode) continue;
      const entry = (index[item.stateCode] ??= { count: 0, worst: "INFO" });
      entry.count += 1;
      if (item.severity === "CRITICAL") entry.worst = "CRITICAL";
      else if (item.severity === "SERIOUS" && entry.worst !== "CRITICAL") entry.worst = "SERIOUS";
    }
    return index;
  }, [incidents, level]);

  const searchPick = (item) => {
    if (!MAP_LAYERS.has(layer)) setLayer("results");
    setPicked(null);
    item.go();
  };

  /* The shapes for the current level. Wards and units have no boundaries
     anywhere, so those levels are lists rather than maps, stated, not faked. */
  const mapShapes = useMemo(() => {
    if (level === "nation") return shapes;
    if (level === "state" && lgaShapes) {
      return { title: state.name, paths: lgaShapes.lgas };
    }
    return null;
  }, [level, shapes, lgaShapes, state]);

  /* -------------------------------------------------------------- summary */
  const scope = useMemo(() => {
    const registered = rows.reduce((sum, row) => sum + (row.registered ?? 0), 0);
    const votes = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
    const booths = rows.reduce((sum, row) => sum + (row.booths ?? 0), 0);
    /* Null, not zero, where no row carries one: zero would draw an empty
       accreditation bar on a replay that simply does not have the figure. */
    const withAccreditation = rows.filter((row) => row.accredited !== null && row.accredited !== undefined);
    const accredited = withAccreditation.length
      ? withAccreditation.reduce((sum, row) => sum + row.accredited, 0)
      : null;
    return {
      registered,
      accredited,
      votes,
      booths,
      turnout: registered ? (votes / registered) * 100 : 0,
      /* The share of accredited voters whose ballot ended up in the count.
         Short of 100% is normal — rejected ballots live in that gap — but a
         long way short of it at one place and not its neighbours is the
         single most useful anomaly on this screen. */
      counted: accredited ? (votes / accredited) * 100 : null,
      density: booths ? Math.round(registered / booths) : 0,
    };
  }, [rows]);

  const trend = useMemo(() => {
    const points = [];
    for (let index = 1; index <= 16; index += 1) {
      points.push(snapshot(board, Math.min(Math.round((board.events.length * index) / 16), cursor)).unitsReported);
    }
    return points;
  }, [board, cursor]);

  /* A single-state contest has no country above it. Offering "Nigeria" as a
     breadcrumb would invite the reader to zoom out to 36 states that are not
     in this election, and then wonder why they are all empty. */
  const pinned = scopeStates?.length === 1;

  /**
   * ── THE TRAIL ALWAYS HAS A ROOT ──────────────────────────────────────────
   * A single-state contest has no country above it, so "Nigeria" is dropped:
   * offering it would invite the reader to zoom out to 36 states that are not
   * in this election and then wonder why they are empty.
   *
   * Dropping it left the trail with nothing in it at all until somebody
   * selected something, and four places read `crumbs.at(-1).label` on the way
   * to first paint. Opening a governorship project threw before it rendered a
   * single pixel. So the root is replaced rather than removed: in a pinned
   * contest the state itself is the top of the trail, which is also what it
   * is on the map. The array is never empty by construction.
   */
  const rootLabel = pinned
    ? (inScope[0]?.name ?? states.find((row) => row.code === scopeStates[0])?.name ?? "This election")
    : "Nigeria";

  const crumbs = [
    { label: rootLabel, go: () => setPath([]) },
    /* In a pinned contest the root already names the state, so adding it
       again would read "Ekiti / Ekiti". */
    !pinned && state && { label: state.name, go: () => setPath([state]) },
    lga && { label: lga.name, go: () => setPath([state, lga]) },
    ward && { label: ward.name, go: () => setPath([state, lga, ward]) },
  ].filter(Boolean);

  /* First click opens the place's full card; clicking the place that is
     already open drills into it. One gesture does both jobs in the order
     people actually want them: nobody drills into a state before looking at
     it, and having to hunt for a separate "open" control to see the numbers
     was the complaint. */
  const select = (shape) => {
    const key = shape.code ?? shape.key ?? shape.name;
    if (picked === key) {
      drill(shape);
      return;
    }
    setPicked(key);
  };

  const drill = (shape) => {
    setPicked(null);
    if (level === "nation") setPath([{ code: shape.code ?? shape.key, name: shape.name }]);
    else if (level === "state") setPath([state, { name: shape.name }]);
    else if (level === "lga") setPath([state, lga, { name: shape.name }]);
  };

  /* Whatever card is showing: the picked child, or the scope itself. */
  const pickedRow = picked ? rows.find((row) => (row.key ?? row.name) === picked) : null;

  /* ════════════════════════════════════════════════════════════════════════
     WHAT POLL360 AI IS ALLOWED TO DO IN HERE

     The assistant works out what was asked for and hands the intention over.
     Everything about how this room actually moves stays here, where the map,
     the levels and the board already live. Each of these hands back either
     nothing, meaning it did as it was told and the assistant should say what
     it planned to say, or a sentence, meaning the room knows something the
     assistant does not and that sentence should be said instead.
     ════════════════════════════════════════════════════════════════════════ */

  /** Put a board up, and remember it for next time. */
  const keepCards = useCallback((next) => {
    setCards(next);
    boardStore.keep(next);
  }, []);

  /**
   * Move the map to a named place.
   *
   * A state can always be reached. A local government can be reached at once
   * if its state is already open and its names have loaded, and otherwise is
   * held until they do. A ward is reached by number, because wards are
   * numbered rather than named everywhere in this dataset.
   */
  const goTo = useCallback(
    (place) => {
      if (!place?.state) return null;

      const target = inScope.find((row) => row.code === place.state.code);
      if (!target) {
        return `${place.state.name} is not in this election, so there is nothing to show you there.`;
      }

      const head = { code: target.code, name: target.name };
      const openHere = state?.code === target.code;

      /* ── A DRILL IS ONLY WORTH HOLDING IF SOMETHING IS COMING ────────────
         The pending name is spent when a boundary file lands, and a boundary
         file only lands when the state changes. Setting one while already
         standing in the state therefore parks a name that nothing will ever
         come to collect, and it would then be spent on the next state
         visited, sending the map somewhere nobody asked for minutes later.
         So it is only ever set on the way into a state we are not in. */
      if (place.lga) {
        const match = openHere ? lgaRows.find((row) => row.name === place.lga) : null;
        if (match) {
          if (place.ward) {
            setPath([head, { name: match.name }, { name: `Ward ${String(place.ward).padStart(2, "0")}` }]);
          } else {
            setPath([head, { name: match.name }]);
          }
          setPicked(null);
          return null;
        }

        if (openHere) {
          return lgaRows.length
            ? `I cannot find ${place.lga} in ${target.name}.`
            : `${target.name} is still drawing. Ask me again in a moment.`;
        }

        pendingDrill.current = normalise(place.lga);
        setPath([head]);
        setPicked(null);
        return null;
      }

      /* Heard but not yet placeable: go to the state, and finish the drill
         when its names arrive. */
      if (place.pendingLga && !openHere) pendingDrill.current = normalise(place.pendingLga);

      /* A ward with no local government named means the one already open. */
      if (place.ward && openHere && lga) {
        setPath([head, lga, { name: `Ward ${String(place.ward).padStart(2, "0")}` }]);
        setPicked(null);
        return null;
      }

      setPath([head]);
      setPicked(null);
      return null;
    },
    [inScope, state, lga, lgaRows]
  );

  const run = useCallback(
    (act) => {
      switch (act.do) {
        /* ------------------------------------------------------- the map */
        case "place":
          return goTo(act.place);

        case "up": {
          if (path.length <= (pinned ? 1 : 0)) {
            return pinned
              ? `This election is only fought in ${rootLabel}, so there is nowhere above it to go.`
              : "You are already looking at the whole country.";
          }
          const next = path.slice(0, -1);
          setPath(next);
          setPicked(null);
          return `${next.length ? next.at(-1).name : rootLabel}.`;
        }

        case "root": {
          if (pinned) {
            return `This election is only fought in ${rootLabel}, so that is as far out as it goes.`;
          }
          setPath([]);
          setPicked(null);
          return null;
        }

        /* ---------------------------------------------------- the screens */
        case "tab": {
          if (act.place) {
            const objection = goTo(act.place);
            if (objection) return objection;
          }
          setLayer(act.tab);
          return null;
        }

        /* ----------------------------------------------------- the board */
        case "pin": {
          const card = buildCard(act.card, { path });

          /* ── THE SAME THING DOES NOT GO UP TWICE ─────────────────────────
             The board now fills itself from what the room is saying, and a
             room says "Kano" more than once. Without this, a five-minute
             argument about two states leaves forty identical cards and the
             board becomes the least useful surface in the product. Saying it
             again is not a request for a second copy of it. */
          if (cards.some((existing) => sameCard(existing, card))) return null;

          /* ── AND THE BOARD HAS A CEILING ─────────────────────────────────
             Anything that fills itself needs a limit, or a long night ends
             with a scroll nobody reads. The oldest goes when the newest
             arrives, which is the right end to lose: what was just named is
             what the room is talking about. */
          const next = [...cards, card].slice(-BOARD_LIMIT);
          keepCards(next);

          /* Putting something up and not being shown it is the one thing
             that would make somebody stop trusting the instruction. But a
             card that went up because the room happened to mention a place
             is not an instruction, and hijacking the screen for it would be
             the assistant interrupting a conversation it was not part of. */
          if (!act.quiet) setLayer("board");
          return null;
        }

        case "clear": {
          if (!cards.length) return "The board is already empty.";
          keepCards([]);
          return null;
        }

        case "erase": {
          if (!cards.length) return "There is nothing on the board to take off.";
          /* Named kind if one was named, otherwise the most recent thing put
             up, which is what "take that off" means every time. */
          const index = act.kind
            ? cards.map((card) => card.kind).lastIndexOf(act.kind)
            : cards.length - 1;
          if (index < 0) return `There is no ${act.kind} on the board.`;
          keepCards(cards.filter((_, at) => at !== index));
          return null;
        }

        case "save": {
          if (!cards.length) return "There is nothing on the board to save yet.";
          const title = boardStore.save(act.name, cards);
          return `Saved as ${title}.`;
        }

        case "restore": {
          const entry = boardStore.open(act.name);
          if (!entry) return `I cannot find a board called ${act.name}.`;
          keepCards(entry.cards);
          setLayer("board");
          return `${entry.name} is up, ${entry.cards.length} card${entry.cards.length === 1 ? "" : "s"}.`;
        }

        default:
          return null;
      }
    },
    [goTo, path, pinned, rootLabel, cards, keepCards]
  );

  const voice = useMemo(
    () => ({
      tabs: TABS.map((item) => item.value),
      path,
      /* Only the names actually loaded. Claiming to know places we have not
         fetched is how an assistant ends up silently going nowhere. */
      lgas: lgaRows.map((row) => row.name),
      run,
    }),
    [path, lgaRows, run]
  );

  /**
   * Everything the alarm should make a noise about.
   *
   * ── WHY DIVERGENCE RIDES THE ALARM THAT ALREADY EXISTS ──────────────────
   * The room has one alarm, and it is the only thing in this product designed
   * to be heard rather than read — because this screen is on a wall at 1am
   * while the people in the room are on the phone. A second, separate alert
   * for declared figures would be a second thing to mute, a second thing to
   * miss, and two competing sounds in one room. So a finding becomes an alert
   * of the same shape and goes through the same bell, with the same mute and
   * the same unread count.
   *
   * ── AND WHY NOT EVERY FINDING ───────────────────────────────────────────
   * Only what lib/divergence.js calls urgent: impossible arithmetic and a
   * changed winner. The figure-by-figure differences are worth reading and are
   * not worth interrupting a room for. An alarm that fires for everything is
   * an alarm somebody unplugs the speakers to escape, and then it is off for
   * the rest of the night.
   *
   * The incident feed itself is left untouched: these are alerts, not reports
   * from the field, and folding them into `incidents` would put them in the
   * stream as though a coordinator had filed them.
   */
  const gapAlerts = useMemo(
    () =>
      (divergence?.urgent ?? []).map((flag) => ({
        /* Prefixed so it can never collide with an incident id, and stable
           across refreshes so the bell announces each finding exactly once. */
        id: `declared:${flag.id}`,
        severity: "CRITICAL",
        kind: flag.says,
        unitCode: flag.key,
        /* When the declared figure that produced this was entered. The finding
           itself has no clock of its own: it is a comparison, and it came into
           existence the moment the second of its two figures did. */
        createdAt: divergence?.at ?? new Date(),
      })),
    [divergence?.urgent, divergence?.at]
  );

  const alerts = useMemo(() => [...gapAlerts, ...incidents], [gapAlerts, incidents]);

  /* Where the bell should send somebody. A room whose newest alert is a
     changed winner should not be dropped into the incident stream, which has
     nothing to do with it. */
  const lastAlertWasDivergence = gapAlerts.length > 0;

  const greeting = useGreeting(user.name);

  /* Who holds each state. Static for the life of the page: this is a matter of
     record plus a short list of settled defections, not something the night
     changes. See lib/governors.js for why there are two answers. */
  const governing = useMemo(
    () => ({
      rows: ruling(),
      seats: { current: seatsBy("current"), elected: seatsBy("elected") },
      moves: crossedFloor(),
    }),
    []
  );

  /* The board's count, carried on its own pill. Everything else is static, so
     only the group holding the board is rebuilt. */
  const tabGroups = useMemo(
    () =>
      TAB_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) =>
          tab.value === "board" && cards.length ? { ...tab, badge: cards.length } : tab
        ),
      })),
    [cards.length]
  );

  return (
    /* The assistant rides with the chrome, so it is inside this. Everything it
       is allowed to do in this room is the object above, and nothing else. */
    <RoomVoiceProvider value={voice}>
    <TopShell
      user={user}
      tabs={TABS}
      tabGroups={tabGroups}
      active={layer}
      onTab={setLayer}
      greeting={greeting}
      searchItems={searchItems}
      onSearchPick={searchPick}
      searchPlaceholder={state ? `Search ${state.name}…` : "Search a state…"}
      alerts={alerts}
      onOpenAlerts={() => setLayer(lastAlertWasDivergence ? "declared" : "stream")}
      subtitle={
        MAP_LAYERS.has(layer)
          ? `${crumbs.at(-1).label} · ${LABEL[layer]}`
          : layer === "board"
            ? cards.length
              ? `${cards.length} thing${cards.length === 1 ? "" : "s"} Poll360 AI is holding for you`
              : "Tell Poll360 AI what to keep in front of you"
          : layer === "watch"
            ? `${watchSummary.filed} of ${watchSummary.total} coordinators reporting`
            : layer === "analytics"
              ? `Projection under your assumptions, from the declared 2023 result${
                  scopeStates?.length
                    ? ` in ${scopeStates.length === 1 ? rootLabel : `these ${scopeStates.length} states`}`
                    : ""
                }`
              : layer === "parties"
                ? "One party at a time, across all 37 states, down to a polling unit"
                : layer === "planning"
                  ? "Choose the territory you can actually cover"
                : layer === "ruling"
                  ? `${governing.moves.length} of 36 states changed hands without an election`
                  : layer === "declared"
                    ? divergence?.ready
                    ? `${formatNumber(divergence.compared)} place${divergence.compared === 1 ? "" : "s"} compared, ${formatNumber(divergence.places)} differing`
                    : "Nothing declared yet to compare against"
                  : `${incidentCount ?? 0} report${incidentCount === 1 ? "" : "s"} from the field`
      }
      aside={
        /* Rendered here rather than handed in from the page: both this and
           LiveRefresh are client components, so passing a ready-made element
           across the server boundary gained nothing and made these two into an
           unkeyed array that React could not reconcile. */
        <>
          {projects && <ElectionSwitcher {...projects} />}
          {/* Which of the day's five contests is on the wall. Beside the
              project switcher because it is the same kind of decision: both
              answer "which count am I looking at". */}
          <RaceSwitcher race={race} races={races} filed={filedByRace} />
          <LiveRefresh seconds={15} label="Live" />
          {/* ── WHAT THE MAP IS ACTUALLY DRAWING ─────────────────────────
              Three different things can be on this screen and they must never
              be mistaken for one another: a demonstration, our agents' own
              returns, or the figures the commission declared. The chip says
              which, in words, on the same row as the switch that changes it.
              A wall display somebody walks past has nothing else to go on. */}
          <span className="flex items-center gap-2 rounded-full border border-dash-line bg-dash-card px-4 py-2.5 text-[0.8125rem] text-dash-muted">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                boardSource === "returns" ? "animate-pulse-live bg-red-500" : "bg-dash-muted"
              )}
            />
            {BOARD_SOURCE[boardSource] ?? BOARD_SOURCE.replay}
          </span>
        </>
      }
    >
      {layer === "board" ? (
        <Whiteboard
          shapes={shapes}
          cards={cards}
          onErase={(id) => keepCards(cards.filter((card) => card.id !== id))}
          onClear={() => keepCards([])}
          onRestore={keepCards}
        />
      ) : layer === "parties" ? (
        /* No scope passed, deliberately: a party's spread is a fact about the
           party across the whole federation, not about whichever contest is
           open. See the note at the top of the component. */
        <PartyStrength shapes={shapes} />
      ) : layer === "analytics" ? (
        <Analytics
          /* The contest, so every figure on that screen is about this
             election rather than about the federation. */
          scopeStates={scopeStates}
          race={projects?.current?.kind ?? null}
          title={projects?.current?.title ?? null}
        />
      ) : layer === "planning" ? (
        <PlanningMap shapes={shapes} />
      ) : layer === "ruling" ? (
        <RulingParty
          rows={governing.rows}
          shapes={shapes}
          fct={FCT}
          seats={governing.seats}
          moves={governing.moves}
        />
      ) : layer === "declared" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <DivergencePanel report={divergence ?? { ready: false, flags: [], ourReturns: 0 }} />
          <div className="flex flex-col gap-3">
            {/* ── THE ROOM GETS THE SUMMARY, NOT THE WHOLE THING ──────────
                A wall display is the wrong surface for a filterable list of
                four thousand findings. What belongs here is the headline and
                the way through to the screen built for reading them. */}
            <a
              href="/gap"
              className="rounded-dash border border-dash-line bg-dash-card p-4 hover:border-dash-ink"
            >
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                The full comparison
              </p>
              <p className="mt-1.5 text-[0.9375rem] font-bold text-dash-ink">
                Open the declared figures room
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-dash-muted">
                Every finding, filtered by what it is and where it is, and the place to enter what
                collation has announced.
              </p>
            </a>

            <div className="rounded-dash border border-dash-line bg-dash-card p-4">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Why the two are never merged
              </p>
              <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-dash-muted">
                A parallel count is not useful because it is faster. It is useful because it is a
                second, independently sourced number to hold the declared one against. Averaging
                them destroys the only thing worth having, so they sit apart and the difference is
                computed rather than smoothed.
              </p>
            </div>
          </div>
        </div>
      ) : layer === "watch" ? (
        <CoordinatorWatch shapes={shapes} coordinators={coordinators} summary={watchSummary} />
      ) : layer === "stream" ? (
        <div className="grid gap-3 xl:h-[calc(100vh-12.5rem)] xl:grid-cols-[minmax(0,1fr)_21rem]">
          <IncidentStream incidents={incidents} photos={photos} />
          <div className="flex flex-col gap-3 xl:min-h-0 xl:overflow-y-auto">
            <div className="rounded-dash border border-dash-line bg-dash-card p-4">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Coordinators reporting
              </p>
              <p className="figure mt-1.5 text-[1.75rem] leading-none font-bold text-dash-ink">
                {formatNumber(watchSummary.filed)}
                <span className="text-[1rem] text-dash-muted">/{formatNumber(watchSummary.total)}</span>
              </p>
              <p className="mt-1.5 text-[0.75rem] text-dash-muted">
                {formatNumber(watchSummary.silent)} have not reported
              </p>
            </div>
            <div className="rounded-dash border border-dash-line bg-dash-card p-4">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                How a report gets here
              </p>
              <ol className="mt-2.5 space-y-2 text-[0.8125rem] leading-relaxed text-dash-muted">
                <li>1. A coordinator files it from the booth, with a photo if there is one.</li>
                <li>2. The narrative is encrypted before it is stored.</li>
                <li>3. It appears here within seconds, decrypted only for this room.</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* --------------------------------------------------------- metrics
          Each dashboard answers its own question. Voters, Turnout and Clusters
          describe the register and the geography, none of them reports who is
          winning, because that is the Results dashboard's job and duplicating
          it here would make three copies of one screen. */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {metricsFor({ layer, level, scope, rows, view, trend, incidentCount, place: crumbs.at(-1).label }).map(
          (metric) => (
            <Metric key={metric.label} {...metric} />
          )
        )}
      </div>

      {/* ------------------------------------------------------ map + list */}
      {/* ------------------------------------------------------ map + list
          ── THE MAP DOES NOT MOVE ────────────────────────────────────────────
          The panels beside it change length constantly: four parties or five,
          twenty local governments or twenty-nine, an incident feed that grows
          all evening. If the page scrolls as one document, every one of those
          pushes the map off screen and the reader has to hunt for it again.

          The first attempt at that was a fixed-height region with a scrollbar
          inside each column, and it was wrong in one specific way: the region
          began below the figures, so scrolling the *page* — which is what a
          wheel does when the pointer is anywhere else, and what every browser
          does on a keyboard PageDown — still carried the map up and off. The
          map only held still if you were already careful where you pointed.

          It is pinned now instead. The map is stuck to the top of the
          viewport, under the bar, at exactly the height of what is left of the
          screen; the column beside it is ordinary page flow and scrolls the
          ordinary way. Scroll anywhere, by any means, and the map stays where
          it was. `--dash-top` is the bar's measured height, published by
          TopShell, because the bar is not the same height on every screen.

          Below xl it stacks and the page scrolls normally, because on a phone
          a pinned half-screen map leaves nothing to read the figures in. */}
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        {/* ── THE ONE DARK OBJECT ON A LIGHT SHEET ─────────────────────────
            The panels are working surfaces and stay white. The map is the
            instrument, and it goes dark: a saturated fill reads far better
            against near-black than against white, the country stops competing
            with the cards around it, and the eye lands here first because it
            is the only high-contrast object on the page. This is the same
            reason a trading desk is dark and its paperwork is not. */}
        <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)] xl:h-[calc(100vh-var(--dash-top,4.5rem)-1.5rem)] xl:min-h-0">
          {/* Breadcrumb, inside the frame, you never leave the page, so this
              is the only thing that tells you how deep you are. */}
          <nav
            aria-label="Where you are"
            className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5"
          >
            {/* Keyed by depth, not by name: Nasarawa State contains a
                Nasarawa LGA, so the labels collide the moment you drill into
                it. Position in the trail is the thing that is actually
                unique here. */}
            {crumbs.map((crumb, index) => (
              <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-dash-muted" />}
                <button
                  type="button"
                  onClick={crumb.go}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    index === crumbs.length - 1
                      ? "text-white"
                      : "text-white/55 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <span className="ml-auto text-[0.75rem] text-white/45">
              {level === "ward" ? "Polling units" : `Tap a ${unitWord(level, true)}`}
            </span>
          </nav>

          <div className="relative min-h-0 flex-1 p-1.5">
            {loading && (
              <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
                <Loader2 size={16} className="animate-spin" />
                Loading boundaries…
              </p>
            )}

            {mapShapes ? (
              <ScopeMap
                level={level}
                shapes={mapShapes}
                rows={rows}
                layer={layer}
                slots={slots}
                hovered={hovered}
                onHover={setHovered}
                onOpen={select}
                incidentsByPlace={incidentsByPlace}
                pulsing={level === "nation" && layer === "results" ? pulsing : null}
              />
            ) : (
              /* Wards and polling units: no boundaries exist, so a grid, it
                 claims nothing about geography and still answers the level. */
              <div className="grid h-full grid-cols-2 content-start gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                {rows.map((row) => (
                  <button
                    key={row.name}
                    type="button"
                    onMouseEnter={() => setHovered(row.name)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => select(row)}
                    className={cn(
                      "rounded-dash-sm border p-3 text-left transition-colors",
                      hovered === row.name ? "border-white bg-white/10" : "border-board-line",
                      level === "lga" ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <p className="text-[0.8125rem] font-bold text-white">{row.name}</p>
                    <p className="figure mt-1.5 text-[1.125rem] leading-none font-bold text-white">
                      {layer === "turnout"
                        ? formatShare(row.turnout)
                        : formatNumber(magnitude(row, layer))}
                    </p>
                    <p className="mt-1 truncate text-[0.6875rem] text-white/45">
                      {describe(row, layer, slots)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── THE TELEMETRY STRIP ────────────────────────────────────────
              A readout along the foot of the instrument: what is on screen,
              how much of it has spoken, how many places are still silent, and
              the clock. All monospaced and all fixed-width, so nothing shifts
              as the digits roll, the strip should be readable out of the
              corner of the eye without ever pulling it. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            <Readout label="Scope" value={crumbs.at(-1).label} />
            <Readout label="Showing" value={LABEL[layer]} />
            <Readout label="In" value={formatShare(view.coverage)} />
            <Readout
              label="Silent"
              value={`${view.byState.filter((row) => !row.reported).length}`}
              tone={view.byState.some((row) => !row.reported) ? "warn" : "ok"}
            />
            <Readout label="Units" value={formatNumber(view.unitsReported)} />
            {/* Only on a live board. The replay has no accreditation figure
                and a dash on the strip is better than a zero that reads as a
                measurement somebody took. */}
            {scope.accredited != null && (
              <>
                <Readout label="Accredited" value={formatNumber(scope.accredited)} />
                {scope.counted != null && (
                  <Readout
                    label="Counted"
                    value={formatShare(scope.counted)}
                    /* Ballots counted well short of voters accredited is the
                       shape of a problem, not of a slow night. */
                    tone={scope.counted < 85 ? "warn" : "ok"}
                  />
                )}
              </>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  cursor < board.events.length ? "animate-pulse-live bg-red-500" : "bg-white/40"
                )}
              />
              <span className="figure text-[0.6875rem] text-white/55 tabular-nums">
                {cursor < board.events.length ? "COLLATING" : "COMPLETE"}
              </span>
            </span>
          </div>
        </div>

        {/* Ordinary flow: this column is what the page scroll is for now. */}
        <div className="flex flex-col gap-4">
          {/* The contest, in full, for whatever is selected, every party,
              not just the one that is winning. */}
          <PartyBreakdown
            /* Only a presidential project has presidential candidates. */
            candidates={projects?.current?.kind === "PRESIDENTIAL"}
            place={pickedRow?.name ?? crumbs.at(-1).label}
            level={pickedRow ? childWord(level) : levelWord(level)}
            row={
              pickedRow ?? {
                votes: rows.reduce(
                  (sum, row) => sum.map((value, i) => value + (row.votes?.[i] ?? 0)),
                  [0, 0, 0, 0, 0]
                ),
                registered: scope.registered,
                turnout: scope.turnout,
                booths: scope.booths,
              }
            }
            coverage={level === "nation" && !pickedRow ? view.coverage : undefined}
          />

          <ScopePanel
            title={titleFor(level)}
            rows={rows}
            layer={layer}
            slots={slots}
            hovered={hovered}
            onHover={setHovered}
            onOpen={select}
            canOpen={level !== "ward"}
          />

          <SidePanel
            layer={layer}
            level={level}
            rows={rows}
            view={view}
            scope={scope}
            onHover={setHovered}
          />
        </div>
      </div>
      </>
      )}
    </TopShell>
    </RoomVoiceProvider>
  );
}

/* -------------------------------------------------------------------------- */

const titleFor = (level) =>
  level === "nation"
    ? "States"
    : level === "state"
      ? "Local governments"
      : level === "lga"
        ? "Wards"
        : "Polling units";

const levelWord = (level) =>
  level === "nation" ? "Federation" : level === "state" ? "State" : level === "lga" ? "Local government" : "Ward";

const childWord = (level) =>
  level === "nation" ? "State" : level === "state" ? "Local government" : level === "lga" ? "Ward" : "Polling unit";

const unitWord = (level, singular = false) =>
  level === "nation"
    ? singular ? "state" : "states"
    : level === "state"
      ? singular ? "local government" : "local governments"
      : level === "lga"
        ? singular ? "ward" : "wards"
        : "polling units";

function Metric({ icon: Icon, label, value, foot, spark, tone = "ink", small = false }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </p>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p
          className={cn(
            "figure leading-none font-bold tracking-[-0.03em] tabular-nums",
            small ? "truncate text-[1.0625rem]" : "text-[1.5rem]",
            tone === "red" ? "text-red-600" : "text-dash-ink"
          )}
        >
          {value}
        </p>
        {spark && <Sparkline values={spark} tone={tone} />}
      </div>
      <p className="mt-1 truncate text-[0.6875rem] text-dash-muted">{foot}</p>
    </div>
  );
}

/* -------------------------------------------------------- per-layer metrics */

/**
 * The four figures each dashboard leads with.
 *
 * Written out per layer rather than parameterised, because the interesting
 * part is exactly what differs: the Voters dashboard cares about how many
 * people can vote and how thinly they are spread, and cares not at all who is
 * ahead. Sharing one metric row across all four is what made three of them
 * look like weaker copies of the first.
 */
function metricsFor({ layer, level, scope, rows, view, trend, incidentCount, place }) {
  const most = (key) => [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];
  const least = (key) => [...rows].sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0))[0];

  if (layer === "register") {
    const top = most("registered");
    return [
      { icon: Users, label: "On the register", value: formatNumber(scope.registered), foot: place },
      { icon: Gauge, label: "Polling units", value: formatNumber(scope.booths), foot: `across ${rows.length} ${unitWord(level)}` },
      { icon: Store, label: "Voters per unit", value: formatNumber(scope.density), foot: "Average across this scope" },
      { icon: TrendingUp, label: "Largest", value: top?.name ?? "n/a", foot: top ? `${formatNumber(top.registered)} registered` : "", small: true },
    ];
  }

  if (layer === "turnout") {
    const high = most("turnout");
    const low = least("turnout");
    return [
      { icon: Percent, label: "Turnout", value: formatShare(scope.turnout), foot: `${formatNumber(scope.votes)} of ${formatNumber(scope.registered)}` },
      { icon: Users, label: "Did not vote", value: formatNumber(Math.max(0, scope.registered - scope.votes)), foot: "Register minus votes cast" },
      { icon: TrendingUp, label: "Highest", value: high?.name ?? "n/a", foot: high ? formatShare(high.turnout) : "", small: true },
      { icon: TrendingDown, label: "Lowest", value: low?.name ?? "n/a", foot: low ? formatShare(low.turnout) : "", small: true },
    ];
  }

  if (layer === "density") {
    const dense = most("density");
    const sparse = least("density");
    const inScope = level === "nation" ? COMMERCIAL_CENTRES.length : null;
    return [
      { icon: Store, label: "Voters per unit", value: formatNumber(scope.density), foot: "Average across this scope" },
      { icon: TrendingUp, label: "Densest", value: dense?.name ?? "n/a", foot: dense ? `${formatNumber(dense.density)} per unit` : "", small: true },
      { icon: TrendingDown, label: "Most spread", value: sparse?.name ?? "n/a", foot: sparse ? `${formatNumber(sparse.density)} per unit` : "", small: true },
      { icon: MapPin, label: "Commercial centres", value: inScope ? formatNumber(inScope) : "n/a", foot: inScope ? "Principal markets nationwide" : "Shown at national level" },
    ];
  }

  return [
    { icon: Gauge, label: "Booths counted", value: formatShare(view.coverage), foot: `${formatNumber(view.unitsReported)} of ${formatNumber(view.booths)}`, spark: trend },
    { icon: Vote, label: "Votes counted", value: formatNumber(level === "nation" ? view.total : scope.votes), foot: place },
    { icon: TrendingUp, label: "Leading", value: view.leader?.id ?? "n/a", foot: view.standings[1] ? `by ${formatShare(view.standings[0].share - view.standings[1].share)}` : "" },
    { icon: AlertTriangle, label: "Incidents", value: formatNumber(incidentCount ?? 0), foot: incidentCount ? "Open now" : "Nothing flagged", tone: incidentCount ? "red" : "ink" },
  ];
}

/**
 * The panel under the list, which is also the layer's own.
 */
function SidePanel({ layer, level, rows, view, onHover }) {
  if (layer === "results") {
    if (level !== "nation") return null;
    return (
      <Section title="Standings">
        <ul className="space-y-3">
          {view.standings.map((party) => (
            <li key={party.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="figure text-[0.8125rem] font-bold text-dash-ink">{party.id}</span>
                <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                  {formatShare(party.share)}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-dash-bg">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.min(100, party.share)}%`, background: PARTY_FILL[party.id] }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  if (layer === "density" && level === "nation") {
    return (
      <Section title="Commercial centres" foot="Principal markets">
        <ul className="space-y-2">
          {COMMERCIAL_CENTRES.filter((city) => city.tier === 1).map((city) => (
            <li key={city.name} className="flex items-center gap-2.5">
              <Store size={13} strokeWidth={2.5} className="shrink-0 text-red-500" />
              <span className="text-[0.8125rem] font-semibold text-dash-ink">{city.name}</span>
              <span className="ml-auto truncate text-[0.6875rem] text-dash-muted">{city.note}</span>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  /* Voters and Turnout get the distribution of the thing they measure, the
     shape of the spread, which a ranked list alone does not show. */
  const key = layer === "register" ? "registered" : layer === "turnout" ? "turnout" : "density";
  const sorted = [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
  const top = sorted.slice(0, 5);
  const max = Math.max(...sorted.map((row) => row[key] ?? 0), 1);

  return (
    <Section title={layer === "turnout" ? "Highest turnout" : "Biggest registers"}>
      <ul className="space-y-2.5">
        {top.map((row) => (
          <li
            key={row.name}
            onMouseEnter={() => onHover?.(row.key ?? row.name)}
            onMouseLeave={() => onHover?.(null)}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">{row.name}</span>
              <span className="figure shrink-0 text-[0.75rem] text-dash-muted">
                {layer === "turnout" ? formatShare(row.turnout) : formatNumber(row[key])}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-dash-bg">
              <div
                className="h-full rounded-full bg-dash-ink"
                style={{ width: `${((row[key] ?? 0) / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ title, foot, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
        <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">{title}</h3>
        {foot && <span className="figure text-[0.6875rem] text-dash-muted">{foot}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * One field of the telemetry strip.
 *
 * Fixed-width monospaced value with the label above it in small caps: the
 * layout must not move when a figure gains a digit, because a strip that
 * shuffles is a strip nobody can read peripherally, and peripheral is the
 * only way anybody reads it during a count.
 */
function Readout({ label, value, tone = "ink" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "figure text-[0.75rem] font-bold tabular-nums",
          tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "text-white"
        )}
      >
        {value}
      </span>
    </span>
  );
}
