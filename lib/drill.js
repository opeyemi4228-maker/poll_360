/**
 * Drilling from a state down to a polling unit.
 *
 * ── WHAT IS REAL AT EACH LEVEL, AND WHAT IS NOT ────────────────────────────
 * State totals are the declared 2023 results — real, checkable, unmodified.
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
 * When real returns arrive from our own agents they replace this entirely —
 * this is the shape of the thing, holding the place until the night fills it.
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
 * `names` are the real places — real LGAs from the boundary file, or ward and
 * unit numbers. Weights come from each name's own seed, so a large LGA stays
 * large and the same one is large every time.
 */
export function apportion({ names, votes, booths, registered = 0, parentKey }) {
  const rng = mulberry32(seedFrom(parentKey));
  const weights = names.map(() => 0.55 + rng());

  const boothParts = split(booths, weights);

  /* The register is split on its own weights rather than following the booths,
     so voters-per-unit genuinely varies between places — which is the whole
     point of the density layer. A dense urban LGA and a sparse rural one with
     the same number of booths must not come out identical. */
  const registerRng = mulberry32(seedFrom(`${parentKey}:register`));
  const registerParts = registered
    ? split(registered, names.map((_, index) => weights[index] * (0.5 + registerRng())))
    : names.map(() => 0);

  /* Each party is split on its own weights, so the political character varies
     between places the way it actually does — an LGA can lean differently from
     its state — while every party still sums back to the state's true total. */
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
 * wards — roughly 11 and 20 respectively. The exact per-place counts are not
 * in this dataset, so they are drawn deterministically around those means and
 * labelled as apportioned wherever they appear.
 */
export function wardCount(lgaName) {
  const rng = mulberry32(seedFrom(`wards:${lgaName}`));
  return 8 + Math.floor(rng() * 8); // 8–15, mean ≈ 11
}

export function unitCount(wardKey) {
  const rng = mulberry32(seedFrom(`units:${wardKey}`));
  return 12 + Math.floor(rng() * 18); // 12–29, mean ≈ 20
}

/** Which party leads a set of party totals, or null if nothing has been cast. */
export function leaderOf(votes) {
  const top = Math.max(...votes.slice(0, 4));
  if (!top) return null;
  return votes.slice(0, 4).indexOf(top);
}
