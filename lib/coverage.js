/**
 * What a coverage plan actually covers, at any depth.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE THING THIS FILE EXISTS TO PREVENT
 *
 *  A plan is a set of places and a bill: so many booths, so many agents, so
 *  much of the country reached. Every one of those figures is wrong the moment
 *  a place is counted twice, and a place is counted twice the moment the model
 *  lets you hold a state and something inside it as two separate picks.
 *
 *  That bug has already happened here once. Taking Kano and then ticking three
 *  of its local governments counted Kano's register once and three
 *  forty-fourths of it a second time; enough of that and "reach" went past
 *  100%, which is not a rounding error, it is the model being wrong on the one
 *  number the screen exists to produce.
 *
 *  The fix then was a flat scheme of three key shapes that could only express
 *  two levels. This is the same idea carried down to a polling unit, and it is
 *  in a library rather than in a component because it is arithmetic somebody
 *  has to be able to test without rendering a map.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE MODEL: MARKS ON A TREE, NOT A LIST OF PLACES ───────────────────────
 * A plan is a map of paths to a mark:
 *
 *   "+"  take this place and everything inside it
 *   "-"  take this place back out of whatever contains it
 *
 * A place with no mark inherits from its nearest marked ancestor, and from
 * nothing if it has none. That is the whole rule, and it is what lets a plan
 * say "all of Kano except Bagwai, but do keep Bagwai's Ward 03" without the
 * three statements fighting each other.
 *
 * ── HOW IT IS COSTED ───────────────────────────────────────────────────────
 * Walking down from each state, a marked place contributes its own figures
 * and then has its nearest marked descendants' *differences* folded in:
 *
 *   value(P) = own(P) if covered, plus for each nearest marked descendant Q,
 *              value(Q) − own(Q) if P was covered, or value(Q) if it was not.
 *
 * Every subtree is therefore counted exactly once, whatever order the marks
 * were made in and however many levels are skipped between them. It relies on
 * one property of the figures, which lib/drill.js guarantees: a place's parts
 * always add back to the place.
 */

/**
 * The separator inside a path key.
 *
 * ── NOT A SLASH, AND NOT A COLON ───────────────────────────────────────────
 * Nigeria has a local government called Ile Oluji/Oke Igbo, and wards are
 * routinely written "Ward 03/A". Any separator that can appear in a real name
 * is a separator that will one day split a path in the wrong place and cost a
 * plan the wrong state. ASCII 31 is the unit separator, it is not typeable,
 * and it cannot occur in a place name from any of these datasets.
 */
export const SEP = "\u001f";

export const pathKey = (parts) => parts.join(SEP);
export const pathParts = (key) => key.split(SEP);

/** Whether `key` lies strictly inside `ancestor`. */
export function isUnder(key, ancestor) {
  return key.startsWith(`${ancestor}${SEP}`);
}

/**
 * The marked places directly governing what is inside `key`: those strictly
 * under it with no other marked place in between.
 *
 * Levels may be skipped — a plan can mark a state and one of its wards with
 * nothing marked on the local government between them — so "nearest" is
 * computed rather than assumed to be one level down.
 */
export function nearestUnder(marks, key) {
  const inside = [...marks.keys()].filter((other) => (key ? isUnder(other, key) : true));
  return inside.filter(
    (candidate) => !inside.some((other) => other !== candidate && isUnder(candidate, other))
  );
}

/** Whether a place is covered, following its nearest marked ancestor. */
export function isCovered(marks, key) {
  if (!key) return false;
  const parts = pathParts(key);
  let covered = false;
  for (let depth = 1; depth <= parts.length; depth += 1) {
    const mark = marks.get(pathKey(parts.slice(0, depth)));
    if (mark === "+") covered = true;
    else if (mark === "-") covered = false;
  }
  return covered;
}

/**
 * Take a place, or take it back out.
 *
 * The mark written is whatever *changes* the answer: a place nothing covers is
 * added, a place something already covers is carved out, and a place carrying
 * its own mark has that mark lifted rather than being given a second one.
 *
 * Marks inside the place are dropped either way. They were statements about a
 * subtree whose coverage has just changed underneath them, and keeping them is
 * how "remove" quietly comes to mean "remove, except the bits I touched on the
 * way past".
 */
export function toggle(marks, key) {
  const next = new Map(marks);
  const had = next.has(key);

  for (const other of [...next.keys()]) {
    if (isUnder(other, key)) next.delete(other);
  }

  if (had) {
    next.delete(key);
    return next;
  }

  const parts = pathParts(key);
  const inherited = isCovered(next, pathKey(parts.slice(0, -1)));
  next.set(key, inherited ? "-" : "+");
  return next;
}

/** Every mark on a place and everything inside it, gone. */
export function clearUnder(marks, key) {
  const next = new Map(marks);
  next.delete(key);
  for (const other of [...next.keys()]) {
    if (isUnder(other, key)) next.delete(other);
  }
  return next;
}

/**
 * What the plan costs.
 *
 * `own(key)` returns `{ value, booths }` for one place — the figures for that
 * place alone, on whatever basis the planner has chosen — or null where they
 * cannot be resolved, in which case the place contributes nothing rather than
 * a guess.
 *
 * Returns the totals and the places behind them, counted by depth so a panel
 * can say "two states, six local governments, one ward" without re-walking.
 */
export function costPlan(marks, own) {
  const roots = new Set([...marks.keys()].map((key) => pathParts(key)[0]));

  let value = 0;
  let booths = 0;
  const touched = { state: new Set(), lga: new Set(), ward: new Set(), unit: new Set() };

  const figures = (key) => own(pathParts(key)) ?? { value: 0, booths: 0 };

  const walk = (key, inherited) => {
    const mark = marks.get(key);
    const covered = mark === "+" ? true : mark === "-" ? false : inherited;

    if (covered) {
      const depth = pathParts(key).length;
      touched[["state", "lga", "ward", "unit"][depth - 1]]?.add(key);
    }

    const own_ = covered ? figures(key) : { value: 0, booths: 0 };
    let sum = own_.value;
    let units = own_.booths;

    for (const child of nearestUnder(marks, key)) {
      const inner = walk(child, covered);
      if (covered) {
        /* The child's own figures are already inside the parent's, so only the
           difference the child's own marks make is folded in. This subtraction
           is the whole reason a place cannot be counted twice. */
        const childOwn = figures(child);
        sum += inner.value - childOwn.value;
        units += inner.booths - childOwn.booths;
      } else {
        sum += inner.value;
        units += inner.booths;
      }
    }

    return { value: sum, booths: units };
  };

  for (const root of roots) {
    const total = walk(root, false);
    value += total.value;
    booths += total.booths;
  }

  return {
    value,
    booths,
    states: touched.state.size,
    lgas: touched.lga.size,
    wards: touched.ward.size,
    units: touched.unit.size,
  };
}

/**
 * One word for what the plan says about a place, for a badge to print.
 *
 * `chosen`  marked, and nothing above it had it already
 * `covered` covered by something above it
 * `carved`  explicitly taken back out of something that covers it
 * `partly`  covered in part: something inside it disagrees with it
 * `none`    not in the plan
 */
export function statusOf(marks, key) {
  if (!key) return "none";

  const mark = marks.get(key);
  const parts = pathParts(key);
  const inherited = isCovered(marks, pathKey(parts.slice(0, -1)));
  const covered = mark === "+" ? true : mark === "-" ? false : inherited;

  /* Anything marked inside it that disagrees with it makes it partial, at any
     depth: a state whose ward is carved out is not wholly covered, and saying
     it is would be the screen telling a planner they have booths they have
     not paid for. */
  const disagrees = [...marks.keys()].some(
    (other) => isUnder(other, key) && (marks.get(other) === "+") !== covered
  );

  if (disagrees) return "partly";
  if (mark === "-") return "carved";
  if (mark === "+") return "chosen";
  return covered ? "covered" : "none";
}
