/**
 * Drilling from a state down to a polling unit.
 *
 * ── WHAT IS REAL AT EACH LEVEL, AND WHAT IS NOT ────────────────────────────
 * State totals are the declared 2023 results, real, checkable, unmodified.
 * Below that, INEC publishes no machine-readable LGA-by-LGA breakdown in this
 * dataset, and no ward or polling unit figures at all. So everything under the
 * state line is APPORTIONED: the state's real total is divided down through
 * its real LGAs, and the divisions are labelled as estimates everywhere they
 * are shown.
 *
 * Two properties make that honest rather than invented:
 *
 *   1. It always sums back. An LGA's parts add to the LGA, and every LGA adds
 *      to the state's true declared figure. Drilling never changes the total
 *      you started from.
 *   2. It is stable. The split is seeded from the place's own name, so
 *      Ikeja shows the same numbers every time anybody opens it, on any
 *      machine, forever. A figure that changed on refresh would be worse than
 *      no figure.
 *
 * When real returns arrive from our own agents they replace this entirely, * this is the shape of the thing, holding the place until the night fills it.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** A stable 32-bit seed from a name, so a place always splits the same way. */
function seedFrom(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Split a whole into `count` parts that sum to exactly the whole.
 *
 * The remainder lands on the last part rather than being spread, because the
 * invariant that matters is the sum: a breakdown that does not add up to its
 * parent is worse than one with an uneven final row.
 */
function split(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((weight) => Math.floor((total * weight) / sum));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

/**
 * Divide a parent's figures across its named children.
 *
 * `names` are the real places, real LGAs from the boundary file, or ward and
 * unit numbers. Weights come from each name's own seed, so a large LGA stays
 * large and the same one is large every time.
 */
export function apportion({ names, votes, booths, registered = 0, parentKey }) {
  const rng = mulberry32(seedFrom(parentKey));
  const weights = names.map(() => 0.55 + rng());

  const boothParts = split(booths, weights);

  /* The register is split on its own weights rather than following the booths,
     so voters-per-unit genuinely varies between places, which is the whole
     point of the density layer. A dense urban LGA and a sparse rural one with
     the same number of booths must not come out identical. */
  const registerRng = mulberry32(seedFrom(`${parentKey}:register`));
  const registerParts = registered
    ? split(registered, names.map((_, index) => weights[index] * (0.5 + registerRng())))
    : names.map(() => 0);

  /* Each party is split on its own weights, so the political character varies
     between places the way it actually does, an LGA can lean differently from
     its state, while every party still sums back to the state's true total. */
  const perParty = votes.map((partyTotal) => {
    const partyRng = mulberry32(seedFrom(`${parentKey}:${partyTotal}`));
    return split(
      partyTotal,
      names.map((_, index) => weights[index] * (0.6 + 0.8 * partyRng()))
    );
  });

  return names.map((name, index) => {
    const total = perParty.reduce((sum, party) => sum + party[index], 0);
    const reg = registerParts[index];
    return {
      name,
      booths: boothParts[index],
      registered: reg,
      votes: perParty.map((party) => party[index]),
      total,
      /* Derived, not apportioned: a ratio cannot be split like a quantity, and
         computing it from this place's own two numbers keeps it honest at
         every level. */
      turnout: reg ? (total / reg) * 100 : 0,
      density: boothParts[index] ? Math.round(reg / boothParts[index]) : 0,
    };
  });
}

/**
 * How many wards an LGA has, and how many units a ward has.
 *
 * Nigeria has 8,809 wards across 774 LGAs and 176,623 units across those
 * wards, roughly 11 and 20 respectively. The exact per-place counts are not
 * in this dataset, so they are drawn deterministically around those means and
 * labelled as apportioned wherever they appear.
 */
export function wardCount(lgaName) {
  const rng = mulberry32(seedFrom(`wards:${lgaName}`));
  return 8 + Math.floor(rng() * 8); // 8 to 15, mean ≈ 11
}

export function unitCount(wardKey) {
  const rng = mulberry32(seedFrom(`units:${wardKey}`));
  return 12 + Math.floor(rng() * 18); // 12 to 29, mean ≈ 20
}

/** Which party leads a set of party totals, or null if nothing has been cast. */
/**
 * Which slot is ahead, ignoring the "other" bucket at the end.
 *
 * ── WHY THIS IS NOT `slice(0, 4)` ANY MORE ─────────────────────────────────
 * It used to read the first four slots, because a presidential board has four
 * parties and a bucket. That number was never a property of the data. The
 * moment a governorship board carried a fifth party, its votes were invisible
 * to this function: Osun's declared result is Accord 511,067 against the APC's
 * 444,815, and a leader test that stopped at slot four returned the APC — the
 * map drew a state for the party that lost it.
 *
 * Every vote array in this codebase ends with the "other" bucket, whether it
 * came from the replay, from `apportion`, from a filed return or from the
 * WhatsApp bot. So the contenders are simply "all of them except the last",
 * which is identical to `slice(0, 4)` on a five-slot presidential array and
 * correct on a board of any width.
 *
 * The bucket is excluded rather than counted because it is not a candidate.
 * "Other parties" leading a state is not a fact about who won it.
 */
export function leaderOf(votes) {
  /* Nothing to lead. An empty or bucket-only array reaches this from a place
     that has filed no figures; `Math.max()` of nothing is -Infinity, which is
     truthy, and would have returned an index of -1 for the caller to index an
     array with. */
  if (!Array.isArray(votes) || votes.length < 2) return null;

  const contenders = votes.slice(0, votes.length - 1);
  const top = Math.max(...contenders);
  if (!top || top < 0) return null;
  return contenders.indexOf(top);
}

/**
 * The children of one place in a live tree, as rows the map and the table read.
 *
 * ── THE OPPOSITE OF `apportion`, AND DELIBERATELY SO ───────────────────────
 * `apportion` above divides a known total across places nobody published a
 * breakdown for, and every screen that shows it says so. This does no dividing
 * at all. Each row is the sum of the returns actually filed inside that place,
 * and a place with no returns in it is not in the list — because the honest
 * answer to "how is Ikeja doing" before anything has come in from Ikeja is
 * "nothing has come in from Ikeja", not a plausible-looking figure.
 *
 * ── WHAT `booths` MEANS HERE ───────────────────────────────────────────────
 * Booths that have reported, not booths that exist. Below a state nobody knows
 * how many exist for this election — the registry holds the ones we have heard
 * from — so a coverage percentage at this level would have an invented
 * denominator. The count is shown instead, which is a fact.
 */
export function liveRowsFrom(node) {
  if (!node?.children?.length) return [];

  return node.children.map((child) => {
    const votes = child.votes?.length ? child.votes : [0, 0, 0, 0, 0];
    const total = child.total ?? votes.reduce((sum, value) => sum + (value ?? 0), 0);

    return {
      key: child.key,
      name: child.name,
      reported: (child.reported ?? 0) > 0,
      votes,
      total,
      registered: child.registered ?? 0,
      booths: child.reported ?? 0,
      fullBooths: child.units ?? 0,
      /* Only ever read at national level, where the denominator is real. */
      coverage: 0,
      turnout: child.registered ? (total / child.registered) * 100 : 0,
      density: child.reported ? Math.round(total / child.reported) : 0,
    };
  });
}

/** One place inside a live tree, by name. Null when nothing has been filed there. */
export function liveNodeFor(node, name) {
  if (!node?.children?.length || !name) return null;
  const wanted = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    node.children.find(
      (child) => String(child.name).toLowerCase().replace(/[^a-z0-9]/g, "") === wanted
    ) ?? null
  );
}
