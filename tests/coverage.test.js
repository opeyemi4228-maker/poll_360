import assert from "node:assert/strict";
import test from "node:test";

import { costPlan, isCovered, pathKey, statusOf, toggle } from "../lib/coverage.js";

/**
 * A coverage plan is a bill. Every test here is about the same property:
 * a place is counted exactly once, whatever order it was picked in and however
 * many levels deep the picking went. The bug this guards against has happened
 * in this product once already — see the note at the top of lib/coverage.js.
 */

/* One state, two local governments, two wards each, two booths each. Every
   level adds back to the one above it exactly, which is the property
   lib/drill.js guarantees for the real figures. */
const TREE = {
  KAN: {
    value: 1000,
    booths: 80,
    children: {
      Bagwai: {
        value: 600,
        booths: 48,
        children: {
          "Ward 01": { value: 400, booths: 32, children: { "PU 001": { value: 250, booths: 20 }, "PU 002": { value: 150, booths: 12 } } },
          "Ward 02": { value: 200, booths: 16, children: { "PU 001": { value: 120, booths: 10 }, "PU 002": { value: 80, booths: 6 } } },
        },
      },
      Dala: {
        value: 400,
        booths: 32,
        children: {
          "Ward 01": { value: 300, booths: 24 },
          "Ward 02": { value: 100, booths: 8 },
        },
      },
    },
  },
  LAG: { value: 500, booths: 40 },
};

/** Figures for one path, the way the map resolves them from its own rows. */
function own(parts) {
  let node = TREE[parts[0]];
  for (const name of parts.slice(1)) {
    node = node?.children?.[name];
  }
  return node ? { value: node.value, booths: node.booths } : null;
}

const key = (...parts) => pathKey(parts);
const plan = (marks) => costPlan(new Map(marks), own);

test("a whole state costs the state", () => {
  const cost = plan([[key("KAN"), "+"]]);
  assert.equal(cost.value, 1000);
  assert.equal(cost.booths, 80);
  assert.equal(cost.states, 1);
});

test("a state and its own parts are not counted twice", () => {
  /* The original bug: taking Kano and then ticking things inside it. Whatever
     is ticked inside a state already taken whole, the answer is the state. */
  const cost = plan([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai", "Ward 01"), "+"],
    [key("KAN", "Dala"), "+"],
  ]);
  assert.equal(cost.value, 1000);
  assert.equal(cost.booths, 80);
});

test("carving a local government out subtracts exactly it", () => {
  const cost = plan([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai"), "-"],
  ]);
  assert.equal(cost.value, 400);
  assert.equal(cost.booths, 32);
});

test("a ward kept inside a carved local government comes back", () => {
  /* All of Kano, except Bagwai, but keep Bagwai's Ward 01. */
  const cost = plan([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai"), "-"],
    [key("KAN", "Bagwai", "Ward 01"), "+"],
  ]);
  assert.equal(cost.value, 1000 - 600 + 400);
  assert.equal(cost.booths, 80 - 48 + 32);
});

test("a single booth carved out of a whole state subtracts one booth", () => {
  const cost = plan([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai", "Ward 01", "PU 001"), "-"],
  ]);
  assert.equal(cost.value, 1000 - 250);
  assert.equal(cost.booths, 80 - 20);
});

test("marks may skip levels and still reconcile", () => {
  /* Nothing is marked on Bagwai; a state and a booth three levels down. */
  const cost = plan([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai", "Ward 02", "PU 002"), "-"],
    [key("LAG"), "+"],
  ]);
  assert.equal(cost.value, 1000 - 80 + 500);
  assert.equal(cost.booths, 80 - 6 + 40);
  assert.equal(cost.states, 2);
});

test("parts alone add up to their parts and never to the parent", () => {
  const cost = plan([
    [key("KAN", "Bagwai", "Ward 01"), "+"],
    [key("KAN", "Dala", "Ward 02"), "+"],
  ]);
  assert.equal(cost.value, 400 + 100);
  assert.equal(cost.booths, 32 + 8);
  /* No state is covered whole, so none is counted as one. */
  assert.equal(cost.states, 0);
  assert.equal(cost.wards, 2);
});

test("every subtree of a whole state sums back to it", () => {
  /* Carving out both local governments leaves nothing, not a remainder. */
  const cost = plan([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai"), "-"],
    [key("KAN", "Dala"), "-"],
  ]);
  assert.equal(cost.value, 0);
  assert.equal(cost.booths, 0);
});

test("a place cannot be picked into existence twice", () => {
  /* Two marks on the same path is not expressible: a Map holds one. Toggling
     the same place twice returns to nothing. */
  let marks = new Map();
  marks = toggle(marks, key("KAN", "Bagwai"));
  assert.equal(costPlan(marks, own).value, 600);
  marks = toggle(marks, key("KAN", "Bagwai"));
  assert.equal(costPlan(marks, own).value, 0);
  assert.equal(marks.size, 0);
});

test("tapping inside a covered state carves rather than adds", () => {
  let marks = new Map([[key("KAN"), "+"]]);
  marks = toggle(marks, key("KAN", "Bagwai"));
  assert.equal(marks.get(key("KAN", "Bagwai")), "-");
  assert.equal(costPlan(marks, own).value, 400);
});

test("undoing a place drops what was marked inside it", () => {
  let marks = new Map([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai"), "-"],
    [key("KAN", "Bagwai", "Ward 01"), "+"],
  ]);
  marks = toggle(marks, key("KAN"));
  assert.equal(marks.size, 0, "a dropped state leaves no residue inside it");
  assert.equal(costPlan(marks, own).value, 0);
});

test("coverage is inherited from the nearest marked ancestor", () => {
  const marks = new Map([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai"), "-"],
    [key("KAN", "Bagwai", "Ward 01"), "+"],
  ]);
  assert.equal(isCovered(marks, key("KAN", "Dala")), true);
  assert.equal(isCovered(marks, key("KAN", "Bagwai", "Ward 02")), false);
  assert.equal(isCovered(marks, key("KAN", "Bagwai", "Ward 01", "PU 001")), true);
});

test("the badge tells a whole state from one with a hole in it", () => {
  const whole = new Map([[key("KAN"), "+"]]);
  assert.equal(statusOf(whole, key("KAN")), "chosen");
  assert.equal(statusOf(whole, key("KAN", "Bagwai")), "covered");

  const holed = new Map([
    [key("KAN"), "+"],
    [key("KAN", "Bagwai", "Ward 01"), "-"],
  ]);
  assert.equal(statusOf(holed, key("KAN")), "partly", "a carved ward makes the state partial");
  assert.equal(statusOf(holed, key("KAN", "Bagwai")), "partly");
  assert.equal(statusOf(holed, key("KAN", "Bagwai", "Ward 01")), "carved");
  assert.equal(statusOf(holed, key("KAN", "Bagwai", "Ward 02")), "covered");
});

test("a name containing the separator of a lesser scheme survives", () => {
  /* Ile Oluji/Oke Igbo is a real local government, and "Ward 03/A" is a real
     ward. A path scheme split on "/" or ":" would cost the wrong place. */
  const odd = {
    OND: {
      value: 200,
      booths: 20,
      children: { "Ile Oluji/Oke Igbo": { value: 90, booths: 9, children: { "Ward 03/A": { value: 40, booths: 4 } } } },
    },
  };
  const figures = (parts) => {
    let node = odd[parts[0]];
    for (const name of parts.slice(1)) node = node?.children?.[name];
    return node ? { value: node.value, booths: node.booths } : null;
  };

  const marks = new Map([
    [key("OND"), "+"],
    [key("OND", "Ile Oluji/Oke Igbo", "Ward 03/A"), "-"],
  ]);
  assert.equal(costPlan(marks, figures).value, 160);
  assert.equal(costPlan(marks, figures).booths, 16);
});
