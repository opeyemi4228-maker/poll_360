import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOUNDS,
  CLASSES,
  baselineFrom,
  classBreakdown,
  classOf,
  executiveBrief,
  opportunityOf,
  slotOf,
  swingScenario,
  turnoutScenario,
} from "../lib/executive.js";

/**
 * The strategic brief, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This is the screen a political director reads before speaking to a
 *  candidate, and it produces the sentences that get repeated: "we are four
 *  points up", "Kaduna is a battleground", "there are two hundred thousand
 *  votes on the table in these six wards". Each of those is a fraction, and
 *  in every case the mistake that matters is not in the arithmetic — it is in
 *  the denominator.
 *
 *  So most of what follows checks the bottom of the fraction, and the rest
 *  checks the one thing a dashboard cannot be allowed to get wrong on
 *  election night: that a place which has not reported is never counted as a
 *  place that reported nothing.
 * ══════════════════════════════════════════════════════════════════════════
 */

const SLOTS = [{ id: "APC" }, { id: "PDP" }, { id: "LP" }, { id: "NNPP" }];

/** A state, with only what the brief reads. */
const place = (over = {}) => ({
  key: "ABI",
  code: "ABI",
  name: "Abia",
  reported: true,
  votes: [100, 200, 700, 0],
  total: 1000,
  registered: 2000,
  fullRegister: 2000,
  booths: 10,
  fullBooths: 10,
  ...over,
});

/** The brief, for one party, over whatever rows are handed in. */
const brief = (rows, over = {}) =>
  executiveBrief({ rows, slots: SLOTS, forParty: "APC", ...over });

/* ------------------------------------------------------------------------ */

describe("finding a party on the board", () => {
  it("reads the position out of the board and not out of a constant", () => {
    /* A governorship ballot the presidential four never appear on. */
    const slots = [{ id: "APGA" }, { id: "PDP" }];
    assert.equal(slotOf(slots, "APGA"), 0);
    assert.equal(slotOf(slots, "PDP"), 1);
  });

  it("says a party is not on the ballot rather than giving it no votes", () => {
    const result = executiveBrief({
      rows: [place()],
      slots: [{ id: "APGA" }, { id: "PDP" }],
      forParty: "APC",
    });

    assert.equal(result.onBallot, false);
    assert.equal(result.votes, null, "not standing is not the same as no votes");
    assert.equal(result.share, null);
    assert.equal(result.margin, null);
    /* The count itself is still real, and still adds up. */
    assert.equal(result.cast, 1000);
  });
});

describe("classifying a place", () => {
  it("classifies silence as unknown before it looks at anything else", () => {
    assert.equal(classOf({ reported: false, margin: 40, swing: 20 }), "UNKNOWN");
    assert.equal(classOf({ reported: true, margin: null }), "UNKNOWN");
  });

  it("holds a commanding lead as a stronghold and a close one as a contest", () => {
    assert.equal(classOf({ margin: 30 }), "STRONGHOLD");
    assert.equal(classOf({ margin: 4 }), "COMPETITIVE");
    /* Ahead, but not by enough to stop worrying: still ours, still a hold. */
    assert.equal(classOf({ margin: 15 }), "STRONGHOLD");
  });

  it("treats a place we hold by four as the same contest as one we lose by four", () => {
    assert.equal(classOf({ margin: 4 }), "COMPETITIVE");
    assert.equal(classOf({ margin: -4 }), "COMPETITIVE");
  });

  it("separates behind-and-closing from behind-and-static", () => {
    /* Losing by thirty, but five points better than last time. */
    assert.equal(classOf({ margin: -30, swing: 5 }), "OPPORTUNITY");
    /* Losing by thirty and no evidence of movement. */
    assert.equal(classOf({ margin: -30, swing: -2 }), "WEAK");
    assert.equal(classOf({ margin: -30, swing: null }), "WEAK");
  });

  it("does not call a place an opportunity merely because nothing is known", () => {
    /* No history at this grain. Distance alone has to decide, and beyond the
       commanding boundary distance says weak. */
    assert.equal(classOf({ margin: -40, swing: null }), "WEAK");
    /* Inside it, distance says winnable, with or without a swing. */
    assert.equal(classOf({ margin: -20, swing: null }), "OPPORTUNITY");
  });

  it("moves with the boundaries when the boundaries are argued about", () => {
    const tight = { competitive: 3, commanding: 10 };
    assert.equal(classOf({ margin: 6 }, tight), "STRONGHOLD");
    assert.equal(classOf({ margin: 6 }, BOUNDS), "COMPETITIVE");
  });
});

describe("the denominators", () => {
  it("counts shares against the vote cast where returns arrived, never the register", () => {
    const result = brief([place({ votes: [400, 300, 300, 0], total: 1000, registered: 4000 })]);

    assert.equal(result.cast, 1000);
    assert.equal(result.share, 40, "400 of the 1,000 counted, not of the 4,000 registered");
    assert.equal(result.turnout, 25, "and turnout is the other fraction, stated separately");
  });

  it("keeps a place that has not reported out of every denominator", () => {
    const result = brief([
      place({ key: "A", code: "ABI", votes: [400, 600, 0, 0], total: 1000, registered: 2000 }),
      place({ key: "B", code: "ADA", reported: false, votes: [0, 0, 0, 0], total: 0, registered: 9000, fullRegister: 9000 }),
    ]);

    assert.equal(result.cast, 1000);
    assert.equal(result.registered, 2000, "the silent state's register is not in the turnout sum");
    assert.equal(result.turnout, 50);
    assert.equal(result.share, 40);

    /* But it is still part of the size of the job. */
    assert.equal(result.fullRegister, 11000);
    assert.equal(result.reporting.silent, 1);
    assert.equal(result.counts.UNKNOWN, 1);

    const silent = result.places.find((row) => row.key === "B");
    assert.equal(silent.votes, null, "a silent place has no votes, not zero votes");
    assert.equal(silent.share, null);
    assert.equal(silent.turnout, null);
  });

  it("adds the leader up from the rows rather than averaging the shares", () => {
    /* One big place and one small one, going opposite ways. Averaging the two
       shares makes it a tie; adding the votes makes PDP the leader, which is
       what the count says. */
    const result = brief([
      place({ key: "big", votes: [1000, 9000, 0, 0], total: 10000, registered: 20000 }),
      place({ key: "small", votes: [90, 10, 0, 0], total: 100, registered: 200 }),
    ]);

    assert.equal(result.leader.id, "PDP");
    assert.equal(result.standing, "trailing");
    assert.equal(result.margin.against, "PDP");
    assert.equal(result.margin.votes, 1090 - 9010);
  });
});

describe("the margin", () => {
  it("measures a lead against the nearest rival, not against the field", () => {
    const result = brief([place({ votes: [500, 300, 200, 0], total: 1000 })]);

    assert.equal(result.standing, "leading");
    assert.equal(result.margin.against, "PDP");
    assert.equal(result.margin.votes, 200);
    assert.equal(result.margin.share, 20);
  });

  it("treats an uncontested place as the widest lead, not as no lead", () => {
    /* One party on the board and nobody else. Returning null here would have
       classified a place held outright as Unknown — which on the map means
       "nobody has reported", the opposite of what happened. */
    const result = executiveBrief({
      rows: [{ key: "solo", name: "Solo", reported: true, votes: [900], total: 900, registered: 1000, booths: 1, fullBooths: 1 }],
      slots: [{ id: "APC" }],
      forParty: "APC",
    });

    assert.equal(result.margin.share, 100);
    assert.equal(result.margin.against, null, "there is no rival to name");
    assert.equal(result.places[0].class, "STRONGHOLD");
  });

  it("measures a deficit against the leader, in the same field", () => {
    const result = brief([place({ votes: [200, 500, 300, 0], total: 1000 })]);

    assert.equal(result.standing, "trailing");
    assert.equal(result.margin.against, "PDP");
    assert.equal(result.margin.share, -30);
  });
});

describe("the record it is compared against", () => {
  const election = {
    year: 2019,
    rows: [
      { code: "ABI", votes: { APC: 300, PDP: 700 }, total: 1000 },
      { code: "ADA", votes: { APC: 600, PDP: 400 }, total: 1000 },
    ],
  };

  it("reshapes one election into a baseline and computes nothing else", () => {
    const base = baselineFrom(election, "APC");
    assert.equal(base.ABI.share, 30);
    assert.equal(base.ADA.share, 60);
    assert.equal(base.ABI.votes, 300);
  });

  it("gives an empty baseline for an election with no state table, not zeroes", () => {
    /* 2007 and 2011 carry national figures and no rows — see lib/history.js.
       A baseline of zeroes would draw a swing of plus-everything on all 37. */
    assert.deepEqual(baselineFrom({ year: 2011, national: { PDP: 1 } }, "PDP"), {});
    assert.deepEqual(baselineFrom(null, "APC"), {});
  });

  it("compares the same ground on both sides of the swing", () => {
    /* Two states last time; only one has reported this time. The swing must be
       computed over that one state on both sides — comparing this year's one
       against last year's two is how a swing gets manufactured. */
    const result = brief(
      [
        place({ key: "ABI", code: "ABI", votes: [400, 600, 0, 0], total: 1000, registered: 2000 }),
        place({ key: "ADA", code: "ADA", reported: false, votes: [0, 0, 0, 0], total: 0, registered: 2000 }),
      ],
      { baseline: baselineFrom(election, "APC"), baselineLabel: "2019" }
    );

    assert.equal(result.historical.places, 1);
    assert.equal(result.historical.cast, 1000, "Adamawa's 2019 vote is not in the comparison");
    assert.equal(result.historical.share, 30);
    assert.equal(result.share, 40);
    assert.equal(result.swing, 10);
  });

  it("has no swing at a grain where no history is recorded", () => {
    /* Wards. Nothing published beneath a state, so the answer is null and the
       screen says so rather than drawing a flat line at zero. */
    const result = brief([
      place({ key: "Ward 01", code: null, name: "Ward 01" }),
      place({ key: "Ward 02", code: null, name: "Ward 02" }),
    ]);

    assert.equal(result.historical, null);
    assert.equal(result.swing, null);
    assert.ok(result.places.every((row) => row.swing === null));
  });
});

describe("the projection", () => {
  it("is the only modelled figure, and it is kept apart from the counted one", () => {
    const result = brief([
      place({ votes: [400, 600, 0, 0], total: 1000, registered: 1000, booths: 25, fullBooths: 100, fullRegister: 4000 }),
    ]);

    assert.equal(result.votes, 400, "counted");
    assert.equal(result.projected.cast, 4000, "modelled: a quarter of the booths are in");
    assert.equal(result.projected.votes, 1600);
    assert.equal(result.projected.share, result.share, "the model holds the share and scales the base");
  });

  it("widens the band when little has reported and narrows it as the night goes on", () => {
    const early = brief([place({ votes: [400, 600, 0, 0], total: 1000, booths: 5, fullBooths: 100 })]);
    const late = brief([place({ votes: [400, 600, 0, 0], total: 1000, booths: 95, fullBooths: 100 })]);

    assert.ok(early.projected.shareHigh - early.projected.shareLow > late.projected.shareHigh - late.projected.shareLow);
  });

  it("takes its sample size from the booths, not from the votes", () => {
    /* Same share, same coverage, a thousand times the votes. If the interval
       moved with the vote count it would be treating people in one booth as
       independent draws, and it would print a band of a fraction of a point on
       an evening when early counts routinely move several. */
    const few = brief([place({ votes: [400, 600, 0, 0], total: 1000, booths: 20, fullBooths: 40 })]);
    const many = brief([place({ votes: [400000, 600000, 0, 0], total: 1000000, booths: 20, fullBooths: 40 })]);

    assert.equal(
      Math.round(few.projected.shareHigh - few.projected.shareLow),
      Math.round(many.projected.shareHigh - many.projected.shareLow)
    );
  });

  it("uses the expected turnout over the coverage when it is given one", () => {
    const result = brief(
      [place({ votes: [400, 600, 0, 0], total: 1000, registered: 1000, fullRegister: 10000, booths: 50, fullBooths: 100 })],
      { expectedTurnout: 30 }
    );

    assert.equal(result.projected.cast, 3000, "30% of a register of 10,000");
    assert.match(result.projected.basis, /30% turnout/);
  });
});

describe("the target", () => {
  it("is a decision, counted against a stated assumption", () => {
    const result = brief(
      [place({ votes: [400, 600, 0, 0], total: 1000, registered: 1000, fullRegister: 2000, booths: 50, fullBooths: 100 })],
      { targetShare: 50 }
    );

    /* Projected total vote is 2,000; half of it is the target. */
    assert.equal(result.target.of, 2000);
    assert.equal(result.target.votes, 1000);
    assert.equal(result.target.gap, 1000 - result.projected.votes);
    assert.equal(result.target.met, false);
  });

  it("is absent rather than zero when nobody has set one", () => {
    assert.equal(brief([place()]).target, null);
  });

  it("knows when it has been met", () => {
    const result = brief([place({ votes: [900, 100, 0, 0], total: 1000 })], { targetShare: 50 });
    assert.equal(result.target.met, true);
    assert.ok(result.target.gap < 0);
  });
});

describe("the four lists a campaign acts on", () => {
  const rows = [
    place({ key: "safe", name: "Safe", votes: [700, 300, 0, 0], total: 1000, registered: 1200 }),
    place({ key: "close", name: "Close", votes: [510, 490, 0, 0], total: 1000, registered: 1200 }),
    place({ key: "lost", name: "Lost", votes: [100, 900, 0, 0], total: 1000, registered: 1200 }),
    place({ key: "quiet", name: "Quiet", reported: false, votes: [0, 0, 0, 0], total: 0 }),
  ];

  it("puts every place in exactly one class", () => {
    const result = brief(rows);
    const total = CLASSES.reduce((sum, item) => sum + result.counts[item.id], 0);
    assert.equal(total, rows.length);
    assert.equal(result.counts.STRONGHOLD, 1);
    assert.equal(result.counts.COMPETITIVE, 1);
    assert.equal(result.counts.WEAK, 1);
    assert.equal(result.counts.UNKNOWN, 1);
  });

  it("sorts battlegrounds by how close they are, either way round", () => {
    const result = brief([
      place({ key: "a", votes: [540, 460, 0, 0], total: 1000 }),
      place({ key: "b", votes: [499, 501, 0, 0], total: 1000 }),
      place({ key: "c", votes: [520, 480, 0, 0], total: 1000 }),
    ]);

    assert.deepEqual(result.battlegrounds.map((row) => row.key), ["b", "c", "a"]);
  });

  it("keeps a stronghold with a collapsing turnout on the growth list", () => {
    /* The point of the weighted model. A safe place with nobody voting is the
       cheapest growth there is, and a product-style score would have deleted
       it for having no headroom. */
    const result = brief(
      [
        /* The same 80/20 split in both, so the only thing that differs is how
           many people came out. `total` is the sum of the votes beside it —
           the room guarantees that of every row it builds, and a fixture that
           breaks the guarantee is testing arithmetic nothing produces. */
        place({ key: "safe-empty", name: "Safe, empty", votes: [800, 200, 0, 0], total: 1000, registered: 10000, fullRegister: 10000 }),
        place({ key: "safe-full", name: "Safe, full", votes: [7200, 1800, 0, 0], total: 9000, registered: 10000, fullRegister: 10000 }),
      ],
      { expectedTurnout: 50 }
    );

    assert.equal(result.growth[0].key, "safe-empty");
    assert.equal(result.growth[0].class, "STRONGHOLD", "still a stronghold, and still worth a visit");
  });

  it("never puts a place it has heard nothing from on a ranking", () => {
    const result = brief(rows);
    for (const list of [result.strongholds, result.battlegrounds, result.weak, result.growth]) {
      assert.ok(list.every((row) => row.key !== "quiet"));
    }
  });
});

describe("the opportunity score", () => {
  it("degrades rather than collapsing when one term is nothing", () => {
    const scored = opportunityOf(
      { registered: 1000, turnout: 100, margin: 60, mineShare: 100, swing: null },
      { ceiling: 1000 }
    );
    /* Every term but reach is zero. A product model would return 0 and drop
       the biggest register on the board off the list. */
    assert.ok(scored.score > 0);
    assert.equal(scored.reach, 100);
    assert.equal(scored.closeness, 0);
  });

  it("returns its own workings so a ranking can be argued with", () => {
    const scored = opportunityOf(
      { registered: 500, turnout: 20, margin: -5, mineShare: 40, swing: 4 },
      { ceiling: 1000, expectedTurnout: 40 }
    );

    assert.equal(scored.reach, 50);
    assert.equal(scored.turnoutRoom, 50, "half the expected turnout is missing");
    assert.equal(scored.headroom, 60);
    assert.equal(scored.momentum, 40);
    assert.ok(scored.closeness > 0);
  });

  it("gives no credit for movement it cannot see", () => {
    const known = opportunityOf({ registered: 1, turnout: 50, margin: -5, mineShare: 40, swing: 5 }, { ceiling: 1 });
    const blind = opportunityOf({ registered: 1, turnout: 50, margin: -5, mineShare: 40, swing: null }, { ceiling: 1 });
    assert.equal(blind.momentum, 0);
    assert.ok(known.score > blind.score);
  });

  it("counts movement away from us as no opportunity, not a negative one", () => {
    const scored = opportunityOf({ registered: 1, turnout: 50, margin: -5, mineShare: 40, swing: -8 }, { ceiling: 1 });
    assert.equal(scored.momentum, 0);
    assert.ok(scored.score > 0, "a place sliding away is a defence problem, not a negative score");
  });
});

describe("the legend the map and the brief share", () => {
  it("returns one row per class, in the same order, always", () => {
    const rows = classBreakdown(brief([place()]));
    assert.deepEqual(rows.map((row) => row.id), CLASSES.map((row) => row.id));
    assert.ok(rows.every((row) => typeof row.dot === "string"));
  });

  it("adds each class's registers up so the bar and the count agree", () => {
    const result = brief([
      place({ key: "a", votes: [700, 300, 0, 0], total: 1000, registered: 1000 }),
      place({ key: "b", votes: [800, 200, 0, 0], total: 1000, registered: 3000 }),
    ]);

    const strong = classBreakdown(result).find((row) => row.id === "STRONGHOLD");
    assert.equal(strong.places, 2);
    assert.equal(strong.registered, 4000);
    assert.equal(strong.votes, 1500);
  });
});

describe("the scenarios", () => {
  it("prices a point of turnout in votes on our side of the ledger", () => {
    const result = brief([
      place({ votes: [400, 600, 0, 0], total: 1000, registered: 1000, fullRegister: 10000 }),
    ]);

    const scenario = turnoutScenario(result, 5);
    assert.equal(scenario.extraVotes, 500, "5% of the whole register");
    assert.equal(scenario.mine, 200, "splitting the way the counted vote split");
  });

  it("says how much of the gap a turnout push actually closes", () => {
    const result = brief([place({ votes: [400, 600, 0, 0], total: 1000, registered: 1000, fullRegister: 10000 })]);

    /* Behind by 200 votes. Five points of turnout is worth 200 to us — but the
       other side gets its share of the same voters, so this is the floor. */
    const scenario = turnoutScenario(result, 5);
    assert.ok(scenario.closes > 0 && scenario.closes <= 1);
  });

  it("shows that a swing inside a few places moves the total by less", () => {
    const result = brief([
      place({ key: "here", votes: [400, 600, 0, 0], total: 1000 }),
      place({ key: "elsewhere", votes: [400, 600, 0, 0], total: 9000 }),
    ]);

    const scenario = swingScenario(result, ["here"], 10);
    assert.equal(scenario.places, 1);
    assert.equal(scenario.gained, 100, "ten points of a thousand votes");
    assert.equal(Math.round(scenario.shift * 100) / 100, 1, "which is one point of the ten thousand");
  });

  it("returns nothing rather than a zero when the selection is empty", () => {
    const result = brief([place()]);
    assert.equal(swingScenario(result, [], 5), null);
    assert.equal(swingScenario(result, ["nowhere"], 5), null);
  });
});
