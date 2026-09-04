import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { holdersOf, lastResultFor } from "../lib/seats.js";
import { resolveTerritory } from "../lib/constituencies.js";
import { RACE_IDS } from "../lib/races.js";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE THING THIS MODULE MUST NEVER DO
 *
 *  Answer a question about one contest with a figure from another. A room
 *  reading a senatorial district and shown the state governorship's 430,861
 *  would be looking at a real number, correctly formatted, under the right
 *  heading, describing a different election — and no coverage figure, no
 *  divergence report and no chart would contradict it.
 *
 *  So most of what is checked below is what does NOT come back. A senate
 *  ground returns no vote totals, because none were published. An unheld
 *  state returns nothing rather than its governor. A council returns a party
 *  and no invented chairman.
 * ══════════════════════════════════════════════════════════════════════════
 */

const at = (stored) => resolveTerritory(stored);

describe("who holds the ground", () => {
  it("gives a governorship account its state's governor", () => {
    const [seat] = holdersOf({ race: "GOVERNORSHIP", territory: at("STATE:02") });
    assert.equal(seat.office, "Governor");
    assert.equal(seat.holder, "Ahmadu Umaru Fintiri");
  });

  /* The distinction the whole of lib/governors.js exists for, carried through
     to the panel: Fintiri won Adamawa for the PDP in 2023 and sits as APC
     since February 2026. A campaign there is fighting an APC incumbent for a
     seat the PDP won, and a room that printed one party would be wrong for
     whichever question was being asked. */
  it("keeps the party won under apart from the party sat under", () => {
    const [seat] = holdersOf({ race: "GOVERNORSHIP", territory: at("STATE:02") });
    assert.equal(seat.wonAs, "PDP");
    assert.equal(seat.party, "APC");
    assert.equal(seat.defected, true);
    assert.ok(seat.moved?.on, "a defection must carry the date it happened");
  });

  it("gives a district account the one senator who holds it", () => {
    const held = holdersOf({ race: "SENATE", territory: at("SENATORIAL:02/adamawa-central") });
    assert.equal(held.length, 1);
    assert.equal(held[0].holder, "Aminu Iya Abbas");
    assert.equal(held[0].party, "PDP");
  });

  /* A ground can contain more than one seat of the same kind, and the count is
     itself the answer for a state-wide campaign. */
  it("gives a state account all three of its senate seats", () => {
    const held = holdersOf({ race: "SENATE", territory: at("STATE:02") });
    assert.equal(held.length, 3);
    assert.deepEqual(
      held.map((seat) => seat.place).sort(),
      ["Adamawa Central", "Adamawa North", "Adamawa South"]
    );
  });

  it("gives a constituency account its own member and nobody else's", () => {
    const held = holdersOf({ race: "REPRESENTATIVES", territory: at("FEDERAL:02/yola-north-yola-south-girei") });
    assert.equal(held.length, 1);
    assert.equal(held[0].holder, "Abubakar Baba Zango");
    assert.equal(held[0].party, "APC");
  });

  it("names the council and its party, and does not invent a chairman", () => {
    const [seat] = holdersOf({ race: "LGA", territory: at("LGA:02/20") });
    assert.equal(seat.place, "Yola North");
    assert.equal(seat.party, "PDP");
    assert.equal(seat.holder, null, "the 21 chairmen were not named in the declaration");
  });

  /* Adamawa is the only state whose seats are transcribed. Everywhere else
     returns nothing, which is what we know — not the governor standing in for
     a senator. */
  it("returns nothing for a contest in a state we have not transcribed", () => {
    assert.deepEqual(holdersOf({ race: "SENATE", territory: at("SENATORIAL:24/lagos-west") }), []);
    assert.deepEqual(holdersOf({ race: "REPRESENTATIVES", territory: at("FEDERAL:24/ikeja") }), []);
    assert.deepEqual(holdersOf({ race: "LGA", territory: at("LGA:24/13") }), []);
  });

  it("still gives every state its governor, transcribed seats or not", () => {
    const [lagos] = holdersOf({ race: "GOVERNORSHIP", territory: at("STATE:24") });
    assert.equal(lagos.holder, "Babajide Sanwo-Olu");
  });
});

describe("the last election for this seat", () => {
  it("gives a governorship account real figures for its own state", () => {
    const result = lastResultFor({ race: "GOVERNORSHIP", territory: at("STATE:02") });
    assert.equal(result.party, "PDP");
    assert.equal(result.candidate, "Ahmadu Umaru Fintiri");
    assert.equal(result.votes.PDP, 430_861);
    assert.equal(result.votes.APC, 398_788);
    assert.equal(result.registered, 2_196_566);
    assert.ok(result.source.includes("INEC"));
  });

  /* THE test. A senatorial district must come back with a winner and no
     numbers, never with the state's numbers. */
  it("gives a senate account its winner and no figures at all", () => {
    const result = lastResultFor({ race: "SENATE", territory: at("SENATORIAL:02/adamawa-central") });
    assert.equal(result.candidate, "Aminu Iya Abbas");
    assert.equal(result.party, "PDP");
    assert.equal(result.votes, null, "no Senate totals were published in a form we hold");
    assert.equal(result.total, null);
    assert.notEqual(result.place, "Adamawa", "a district must not be labelled with its state");
  });

  it("gives a constituency account its winner and no figures", () => {
    const result = lastResultFor({ race: "REPRESENTATIVES", territory: at("FEDERAL:02/michika-madagali") });
    assert.equal(result.candidate, "Zakaria Dauda Nyampa");
    assert.equal(result.votes, null);
  });

  it("gives a council account the sweep and no figures", () => {
    const result = lastResultFor({ race: "LGA", territory: at("LGA:02/20") });
    assert.equal(result.party, "PDP");
    assert.equal(result.votes, null);
    assert.equal(result.votesOn, "2026-06-13");
  });

  /* No contest may borrow another's numbers. Checked as a property across
     every contest and every level rather than case by case, because the way
     this breaks is somebody adding a helpful fallback. */
  it("never returns a figure belonging to a different contest", () => {
    const grounds = [
      "STATE:02",
      "SENATORIAL:02/adamawa-central",
      "FEDERAL:02/yola-north-yola-south-girei",
      "LGA:02/20",
    ];

    for (const race of RACE_IDS) {
      for (const stored of grounds) {
        const result = lastResultFor({ race, territory: at(stored) });
        if (!result) continue;
        assert.equal(result.race, race, `${race} over ${stored} answered with a ${result.race} result`);
      }
    }
  });

  it("gives a presidential account the national result, and a state its own share", () => {
    const national = lastResultFor({ race: "PRESIDENTIAL", territory: at("NATION") });
    assert.equal(national.party, "APC");
    assert.equal(national.total, 24_025_940);

    const adamawa = lastResultFor({ race: "PRESIDENTIAL", territory: at("STATE:02") });
    assert.equal(adamawa.party, "PDP", "Atiku carried his home state");
    assert.equal(adamawa.total, 731_140);
  });

  /* Below a state there is no published presidential breakdown, so the state's
     figure is shown and the note says whose figure it actually is. Printing it
     unlabelled under a district's name would be the same error in a quieter
     coat. */
  it("labels a state figure as the state's when a district is asked", () => {
    const result = lastResultFor({ race: "PRESIDENTIAL", territory: at("SENATORIAL:02/adamawa-central") });
    assert.equal(result.place, "Adamawa");
    assert.match(result.note, /is Adamawa's and not Adamawa Central's/);
  });

  it("says who won even where the figures are not loaded", () => {
    const result = lastResultFor({ race: "GOVERNORSHIP", territory: at("STATE:24") });
    assert.equal(result.candidate, "Babajide Sanwo-Olu");
    assert.equal(result.votes, null);
    assert.match(result.note, /not loaded/);
  });

  /* A National Assembly seat's date is a swearing-in and a council's is a
     polling day. Neither is a declaration, and printing either under
     "declared" is a small lie about a small thing — which is what a reader
     calibrates trust on before they get to the large ones. */
  it("gives a date to hold the seat by, not a declaration date it does not have", () => {
    const seat = lastResultFor({ race: "SENATE", territory: at("SENATORIAL:02/adamawa-central") });
    assert.equal(seat.declaredOn, null);
    assert.equal(seat.heldSince, "2023-06-13");

    /* A real declaration keeps its real date. */
    const declared = lastResultFor({ race: "GOVERNORSHIP", territory: at("STATE:02") });
    assert.equal(declared.declaredOn, "2023-04-18");
  });

  /* The panel already says, in full, that no totals were published. A second
     sentence saying it again is a line a reader learns to skip, and the next
     line they skip is one that mattered. */
  it("carries no filler note, only one specific to the seat", () => {
    assert.equal(
      lastResultFor({ race: "REPRESENTATIVES", territory: at("FEDERAL:02/fufore-song") }).note,
      null
    );

    /* Adamawa North's seat changed hands in court, which is worth a sentence. */
    const north = lastResultFor({ race: "SENATE", territory: at("SENATORIAL:02/adamawa-north") });
    assert.match(north.note, /Court of Appeal/);
  });

  it("returns nothing rather than something for a seat we do not hold", () => {
    assert.equal(lastResultFor({ race: "SENATE", territory: at("SENATORIAL:24/lagos-west") }), null);
    assert.equal(lastResultFor({ race: "LGA", territory: at("LGA:24/13") }), null);
  });
});
