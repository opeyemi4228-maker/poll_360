import { parseUnitCode } from "./units.js";
import { lgaNameFor } from "./lga-names.js";
import { stageOf } from "./operations.js";

/**
 * Who has not sent their result, at every level of the country.
 *
 * ── WHY THIS IS NOT IN lib/booth.js ────────────────────────────────────────
 * Because that name was taken, and by something with a genuinely different
 * job: lib/booth.js reads one booth out of a submitted form. This is the
 * other direction entirely — every booth in the country, rolled up, seen from
 * the room rather than from the field. Two files called booth would have been
 * two files nobody could tell apart from an import line.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE QUESTION TWO SCREENS WERE EACH ANSWERING HALF OF
 *
 *  The room had a Booths screen that drew where the ground was thin, and an
 *  Operations screen that drew where a return had stopped on the way to being
 *  usable. Both are the same sentence — *this booth has not produced a figure
 *  a bulletin can use yet* — and neither could finish it alone.
 *
 *  A ward showing four silent booths did not say whether those four were
 *  unmanned or had filed and were sitting behind a verification queue. Those
 *  two findings look identical on a map and have opposite instructions: one
 *  is a phone call to a coordinator, the other is a phone call to your own
 *  desk. The screen that knew which was on the other tab, with the geography
 *  stripped out of it.
 *
 *  So this rolls both up together, down the same tree, and every place at
 *  every level carries both halves: how many of its booths we hold, how many
 *  have spoken, and of those that have, how many are actually through.
 *
 *  ── THE DENOMINATOR IS THE ROSTER, NEVER THE REGISTRY ───────────────────
 *  Nigeria has 176,623 polling units and no deployment covers all of them.
 *  A coverage figure computed against the registry reports 99% failure on an
 *  operation doing exactly what it planned to, which is the fastest way to
 *  teach a room to ignore a number. Every share here is against booths we
 *  have somebody standing at. The registry figure is a separate line, named
 *  as such, wherever both are shown.
 *
 *  ── AND A PLACE WE DEPLOYED NOBODY TO IS NOT A PLACE AT ZERO ────────────
 *  `reporting` is null, not 0, where nothing was assigned. Not-yet and
 *  not-applicable are different facts, and a map that fills them with the
 *  same colour is wrong all night — a state we never staffed would read as a
 *  state that has gone silent, which is the one mistake that sends somebody
 *  driving to Yobe for nothing.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** A fresh, empty tally. Every node in the tree is one of these. */
function node(key, name, prefix = "") {
  return {
    key,
    name,
    /* ── THE CODE PREFIX EVERY BOOTH BELOW THIS PLACE SHARES ─────────────
       "08" for a state, "08/03" for a local government, "08/03/07" for a
       ward, and the whole code for a booth. Carried because the screens are
       in a browser and the only other way to ask "is this booth inside this
       place" is `lgaNameFor`, which reads the name tables off disk and
       cannot cross to the client at all.

       A prefix test is also exact in a way a name comparison never is: two
       local governments in different states share a name often enough that
       matching on one would quietly pull Ifelodun in Kwara into a list about
       Ifelodun in Osun. The country's prefix is the empty string, which
       matches every booth, which is correct — standing at the country, every
       booth is inside the place you are standing in. */
    prefix,
    /* Booths we have somebody at. The denominator for everything below. */
    assigned: 0,
    /* Of those, how many have sent anything at all. */
    filed: 0,
    /* Of those that have, how many are all the way through. */
    verified: 0,
    /* Filed, and stopped somewhere short of verified. The pile with
       somebody's name on it — see lib/operations.js for the ladder. */
    stuck: 0,
    /* Filed, and thrown out. Out of every sum above, so it is counted
       separately rather than being folded into "filed" and quietly inflating
       how much of the ground has spoken. */
    rejected: 0,
    children: new Map(),
  };
}

function child(parent, key, name, prefix = key) {
  if (!parent.children.has(key)) parent.children.set(key, node(key, name, prefix));
  const found = parent.children.get(key);
  /* A later row may know a better name than the first one did — a coordinator
     roster carries a booth code and no place names, while a return carries
     both. First real name wins over a placeholder, and nothing overwrites a
     name with null. */
  if (name && (!found.name || found.name === found.key)) found.name = name;
  return found;
}

/** Add one booth's worth of facts to every level it belongs to. */
function credit(path, apply) {
  for (const place of path) apply(place);
}

/**
 * Roll the roster and the returns up into one tree.
 *
 * `roster` is the coordinator watch (lib/watch.js): one row per booth we have
 * somebody at, carrying whether they have filed. `rows` are the counted
 * returns (lib/db.js results.counted), which is what makes it possible to say
 * where a return stopped rather than only that it arrived.
 *
 * ── WHY THE ROSTER LEADS AND THE RETURNS FOLLOW ────────────────────────────
 * A booth that filed and was never on the roster is real — a desk upload, a
 * booth added during the day — and it must appear. But building the tree from
 * the returns would mean a booth nobody has heard from does not exist, and
 * this module's entire job is to draw exactly those. So the roster lays the
 * tree out and the returns are matched onto it, with anything unmatched added
 * as it is found.
 */
export function boothTree({ roster = [], rows = [] } = {}) {
  const root = node("NG", "Nigeria");

  /* Where a booth code sits, as the chain of nodes from the country down. A
     code that will not parse is not silently dropped: it lands under the
     country so it is still counted in the national total, because a booth
     whose code is malformed is a booth somebody still has to ring. */
  const pathFor = (unitCode) => {
    const at = parseUnitCode(unitCode);
    if (!at) return [root];

    const state = child(root, at.stateCode ?? at.stateNumber, at.stateName, at.stateNumber);
    const lga = child(state, at.lgaCode, lgaNameFor(unitCode) ?? `LGA ${at.lgaCode.split("/")[1]}`, at.lgaCode);
    const ward = child(lga, at.wardCode, `Ward ${at.wardCode.split("/")[2]}`, at.wardCode);
    const unit = child(ward, at.code, `Unit ${at.unitNo}`, at.code);
    return [root, state, lga, ward, unit];
  };

  /* ---------------------------------------------------------------- roster */
  const held = new Set();
  for (const row of roster) {
    const code = row.unitCode ?? row.scope ?? null;
    if (!code) continue;
    held.add(String(code));
    credit(pathFor(code), (place) => {
      place.assigned += 1;
    });
  }

  /* --------------------------------------------------------------- returns */
  const seen = new Set();
  for (const row of rows) {
    const code = row.unitCode ?? null;
    if (!code) continue;

    const path = pathFor(code);

    /* A return from a booth nobody was assigned to still counts as a booth
       that has spoken, and it also has to raise the denominator — otherwise a
       desk upload pushes a ward past 100% reporting, which is the kind of
       figure that ends up in a bulletin. */
    if (!held.has(String(code))) {
      credit(path, (place) => {
        place.assigned += 1;
      });
      held.add(String(code));
    }

    /* One booth, one voice. A booth filing twice — an amended return, a
       correction — is still one booth that has spoken, and counting the rows
       instead would report more booths reporting than exist. */
    if (seen.has(String(code))) continue;
    seen.add(String(code));

    if (row.status === "DISPUTED") {
      credit(path, (place) => {
        place.rejected += 1;
      });
      continue;
    }

    const stage = stageOf(row);
    credit(path, (place) => {
      place.filed += 1;
      if (row.status === "VERIFIED") place.verified += 1;
      else place.stuck += 1;
    });
    /* The rung it stopped on, kept on the unit alone: a ward's worth of
       "waiting on a sheet read" is a list, not a number, and the screen that
       wants it reads the units. */
    path.at(-1).stage = stage?.next ?? null;
  }

  return root;
}

/** Every place directly under `path`, as plain rows a screen can draw. */
export function placesUnder(tree, path = []) {
  let place = tree;
  for (const step of path) {
    const next = place?.children?.get(step);
    if (!next) return [];
    place = next;
  }
  return [...place.children.values()].map(summarise);
}

/** Find one place by its path, or null. */
export function placeAt(tree, path = []) {
  let place = tree;
  for (const step of path) {
    place = place?.children?.get(step);
    if (!place) return null;
  }
  return place ? summarise(place) : null;
}

/**
 * One node, flattened into the shape a panel or a map fill reads.
 *
 * `reporting` and `through` are both null where their denominator is zero,
 * for the reason at the head of this file: a place nobody was sent to has no
 * reporting rate, and a place nothing has arrived from has no completion
 * rate. Zero would be a measurement, and there is no measurement.
 */
export function summarise(place) {
  const silent = Math.max(0, place.assigned - place.filed - place.rejected);
  return {
    key: place.key,
    name: place.name,
    prefix: place.prefix ?? "",
    assigned: place.assigned,
    filed: place.filed,
    verified: place.verified,
    stuck: place.stuck,
    rejected: place.rejected,
    /* Booths we hold that have said nothing at all. The list this screen
       exists to produce. */
    silent,
    reporting: place.assigned ? (place.filed / place.assigned) * 100 : null,
    through: place.filed ? (place.verified / place.filed) * 100 : null,
    stage: place.stage ?? null,
    children: place.children.size,
  };
}

/**
 * The places that have said nothing, worst first.
 *
 * ── ORDERED BY HOW MUCH IS MISSING, NOT BY HOW BAD THE RATE IS ─────────────
 * A ward at 0% of two booths and a state at 40% of nine hundred are both
 * "behind", and only one of them is worth a room's next hour. Sorting by rate
 * puts the two-booth ward at the top of every list all night and buries the
 * nine hundred. So the order is the count of silent booths, which is the
 * number of phone calls the finding actually represents, and the rate is
 * shown beside it rather than deciding the order.
 */
export function behind(tree, path = [], take = 12) {
  return placesUnder(tree, path)
    .filter((row) => row.silent > 0)
    .sort((a, b) => b.silent - a.silent || (a.reporting ?? 0) - (b.reporting ?? 0))
    .slice(0, take);
}

/**
 * The whole rollup, flattened into something that can cross to the browser.
 *
 * ── WHY THE TREE ITSELF DOES NOT MAKE THE TRIP ─────────────────────────────
 * `boothTree` is built out of `Map`s, because a tree assembled by repeated
 * lookup wants a Map and an object would be the wrong shape to build it in.
 * What crosses the server boundary is a different question from what is
 * convenient to build, and the answer there is: plain arrays, indexed by a
 * key a screen can compute from the place it is standing in.
 *
 * So the map's fills and the panels beside it read one flat object. Every
 * level of the country is in it, pre-summarised, keyed by the path joined —
 * `""` for the country, `"BOR"` for a state, `"BOR|08/03"` for a local
 * government. A screen that has drilled to a ward already knows that path,
 * because it is the same one it used to fetch the boundaries.
 *
 * The whole thing is a few hundred short rows even on a national deployment,
 * which is smaller than the boundary file it sits beside.
 */
export function boothBoard({ roster = [], rows = [] } = {}) {
  const tree = boothTree({ roster, rows });
  const places = {};

  /* ── INDEXED BY NAME, THOUGH THE TREE IS BUILT BY CODE ──────────────────
     The tree is keyed by the canonical code, because a code is stable and a
     name is typed by people. The index is keyed by name, because the screen
     asking the questions has names and not codes: the map's trail is built
     from the boundary files, and a boundary file knows a local government as
     "Askira/Uba" and has never heard of 08/03.

     Converting at this seam rather than at the call site means there is one
     place where the two vocabularies meet, and it is this one. A screen that
     had to hold both would eventually hold them inconsistently. */
  const walk = (place, path) => {
    places[path.join("|")] = [...place.children.values()].map(summarise);
    for (const node of place.children.values()) {
      /* Units are leaves: they have no children, and indexing them would
         double the size of this object to describe nothing. */
      if (node.children.size > 0) walk(node, [...path, node.name]);
    }
  };
  walk(tree, []);

  return { total: summarise(tree), places };
}

/* The two readers the browser calls live in lib/reporting-board.js, which
   imports nothing — see the note at the head of that file for why an import
   line here would have put `node:fs` in the browser bundle. Re-exported so a
   server caller that already has this module does not need both. */
export { placeIn, under } from "./reporting-board.js";
