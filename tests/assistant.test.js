import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ask, findState, findParty } from "../lib/assistant.js";
import { WAKE, drive, harvest, repair, stripWake, topics } from "../lib/commands.js";
import { findEveryone, findPerson } from "../lib/people.js";

/**
 * What Poll360 AI must never get wrong.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  The assistant answers out loud, on a desk that may be reading it on air,
 *  and it drives the screen. Both halves fail in ways nobody notices until
 *  it matters: an answer that is confidently about the wrong thing, or an
 *  instruction that moves the map in the middle of a broadcast because a
 *  question happened to contain a place name.
 *
 *  The line between a question and an instruction is the single most load-
 *  bearing rule in the whole feature, and it is one regular expression away
 *  from inverting. Most of what follows guards exactly that line.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* The surfaces this stand-in room is holding. It is a whitelist, and that is
   load-bearing: a tab the room does not have comes back as a `route` act —
   go to /room first, then open it — rather than as a `tab` act carrying a
   place. So a surface missing from this list is not a smaller test, it is a
   different one, and every tab the room really has belongs here. */
const room = {
  tabs: [
    "results", "register", "turnout", "watch", "situations",
    "coverage", "integrity", "operations", "timeline",
    /* The analytical head is two dashboards now, not seven surfaces: the
       brief, party ground, the ruling party, clusters and trends are all
       tabs inside Election Analytics. */
    "analytics", "planning",
    "board",
  ],
  path: [],
  lgas: [],
  tab: "results",
};

/* ── THE BOARD IS WITHDRAWN FROM THE ROOM, NOT FROM THIS MODULE ────────────
   The situation room no longer has a board tab and no longer acts on a pin,
   a clear or a save — see components/dash/SituationRoom.jsx, where the whole
   block is commented out rather than deleted. lib/commands.js still parses
   all of it, and these tests still hold it to that on purpose: they are the
   guarantee that turning the board back on is putting a component back and
   not re-deriving how a sentence becomes a pin. */
const board = { ...room, tab: "board" };

describe("hearing the name", () => {
  it("wakes on the ways people actually say it", () => {
    for (const said of [
      "hi poll360 ai",
      "hey poll ai",
      "poll ai",
      "hi pole three sixty ai",
      "hello poll 360",
    ]) {
      assert.ok(WAKE.test(said), `did not wake on "${said}"`);
    }
  });

  it("does not wake on ordinary talk about polls", () => {
    for (const said of [
      "the opinion poll was wrong",
      "polling units are closed",
      "what does the poll say about turnout",
    ]) {
      assert.ok(!WAKE.test(said), `woke on "${said}"`);
    }
  });

  it("keeps whatever was said after the name", () => {
    assert.equal(stripWake("hi poll360 ai show me ekiti"), "show me ekiti");
    assert.equal(stripWake("hi poll360 ai"), "");
  });
});

describe("questions are never instructions", () => {
  /* The rule the whole feature rests on. A question that moves the screen is
     the failure everybody notices and nobody forgives. */
  it("leaves a question about a word to be answered", () => {
    for (const said of [
      "what is turnout",
      "what does a quarter state mean",
      "explain the register",
      "how does the spread test work",
      "what are clusters",
    ]) {
      assert.equal(drive(said, room), null, `"${said}" was treated as an instruction`);
      assert.equal(drive(said, board), null, `"${said}" drove the board`);
    }
  });

  it("answers a question about a word from the glossary", () => {
    const answer = ask("what is a quarter state", {});
    assert.ok(answer.text.includes("quarter"), "the quarter state answer lost its subject");
    assert.notEqual(answer.kind, "unknown");
  });
});

describe("driving the room", () => {
  it("takes a layer and a place said together, with no verb", () => {
    const order = drive("result ekiti", room);
    assert.equal(order.act.do, "tab");
    assert.equal(order.act.tab, "results");
    assert.equal(order.act.place.state.code, "EKI");
  });

  it("understands every layer by its singular as well as its plural", () => {
    for (const [said, tab] of [
      ["result kano", "results"],
      ["voter kano", "register"],
      /* Clusters is a tab inside Election Analytics now, so its words land
         on the dashboard holding it rather than on a layer of its own. */
      ["cluster kano", "analytics"],
      ["incident kano", "situations"],
      ["turnout kano", "turnout"],
    ]) {
      assert.equal(drive(said, room).act.tab, tab, `"${said}" did not reach ${tab}`);
    }
  });

  it("still answers to the names of every surface that was merged away", () => {
    /* ── A MERGE MUST NOT COST SOMEBODY THEIR VOCABULARY ─────────────────
       Incidents, the polling-unit card, the result sheets and the board's
       neighbours were tabs of their own, and people have been saying those
       words for months. Four screens became two; the words all still work,
       and each lands on the console now holding what was asked for. A phrase
       that quietly stops working is worse than one that never did, because
       nobody reports it — they just decide the assistant is unreliable. */
    for (const [said, tab] of [
      ["the incidents", "situations"],
      ["the feed", "situations"],
      ["report stream", "situations"],
      /* And the analytical head, which went from seven surfaces to two:
         everything that ends in a finding is Election Analytics, everything
         that ends in a spend is Strategic Planning. */
      ["geographic intelligence", "analytics"],
      ["party ground", "analytics"],
      ["ruling party", "analytics"],
      ["clusters", "analytics"],
      ["trend detection", "analytics"],
      ["sample size", "planning"],
      ["polling unit intelligence", "coverage"],
      ["the booth", "coverage"],
      ["the evidence", "integrity"],
      ["data quality", "integrity"],
      ["result sheets", "integrity"],
    ]) {
      assert.equal(drive(said, room).act.tab, tab, `"${said}" did not reach ${tab}`);
    }
  });

  it("treats a bare place name as go there and tell me about it", () => {
    const order = drive("ekiti", room);
    assert.equal(order.act.do, "place");
    assert.equal(order.act.place.state.code, "EKI");
    assert.equal(order.alsoAnswer, true);
  });

  it("puts a named thing on the board when the board is open", () => {
    const order = drive("ekiti state", board);
    assert.equal(order.act.do, "pin");
    assert.equal(order.act.card.place.state.code, "EKI");
  });

  it("still changes screen from the board when a layer is named", () => {
    /* "Result Ekiti" means the results screen wherever it is said. */
    assert.equal(drive("result ekiti", board).act.do, "tab");
  });

  it("moves up and out without a place", () => {
    assert.equal(drive("go back", room).act.do, "up");
    assert.equal(drive("the whole country", room).act.do, "root");
  });

  it("clears and saves the board", () => {
    assert.equal(drive("clear the board", board).act.do, "clear");
    assert.equal(drive("save this as kano brief", board).act.do, "save");
    assert.equal(drive("save this as kano brief", board).act.name, "kano brief");
  });

  it("reaches the two strategic surfaces by the question, not by their names", () => {
    /* Nobody walks into a room and says "open the strategic brief". They ask
       the question the screen exists to answer, and the screen answers it far
       better than a sentence would. */
    for (const [said, tab] of [
      ["where do we stand", "analytics"],
      ["our position", "analytics"],
      ["strategic intelligence", "analytics"],
      ["where are we strong", "analytics"],
      ["where are we weak", "analytics"],
      ["battlegrounds", "analytics"],
      ["geographic intelligence", "analytics"],
      /* And the planning half keeps its own door, because it ends in a
         commitment rather than in a finding. */
      ["where should we focus", "planning"],
      ["resource allocation", "planning"],
      ["grassroots strength", "planning"],
    ]) {
      assert.equal(drive(said, room).act.tab, tab, `"${said}" did not reach ${tab}`);
    }
  });

  it("splits the where-questions by whether they end in a finding or a spend", () => {
    /* "Where are the strongholds" is a question about the country and ends in
       a finding, so it opens the analysis. "Where are the opportunities" is
       asked by somebody deciding where to send people and ends in a
       commitment, so it opens the plan. The two screens are kept apart for
       exactly that reason — see StrategicPlanning.jsx — and the vocabulary
       has to make the same cut or the split is cosmetic. */
    for (const said of ["strongholds", "swing states", "battlegrounds"]) {
      assert.equal(drive(said, room).act.tab, "analytics", `"${said}" should open the analysis`);
    }
    for (const said of ["opportunities", "priorities", "resource allocation"]) {
      assert.equal(drive(said, room).act.tab, "planning", `"${said}" should open the plan`);
    }
  });

  it("does not let a strategic word steal a place name", () => {
    /* "Target" is on the brief's list and is also an ordinary English word.
       A sentence naming a state must still reach that state. */
    const order = drive("target kano", room);
    assert.equal(order.act.tab, "planning");
    assert.equal(order.act.place.state.code, "KAN");
  });

  it("only looks things up when plainly asked to", () => {
    assert.equal(drive("look up the eiffel tower", room).act.query, "the eiffel tower");
    assert.equal(drive("inec on the web", room).act.query, "inec");
    /* Not a lookup: the product answers this itself. */
    assert.notEqual(drive("who won kano", room)?.act?.do, "lookup");
  });
});

describe("correcting a mishearing", () => {
  it("takes the corrected word out of the repair", () => {
    assert.equal(repair("no I meant Atiku"), "atiku");
    assert.equal(repair("I said Kano"), "kano");
    assert.equal(repair("not Kano, Kaduna"), "kaduna");
  });

  it("leaves an ordinary sentence alone", () => {
    assert.equal(repair("show me Kano"), null);
    assert.equal(repair("what is turnout"), null);
  });
});

describe("people are people, not their party", () => {
  it("finds a candidate by any of the ways they are named", () => {
    for (const said of ["atiku abubakar", "atiku", "what did atiku get"]) {
      assert.equal(findPerson(said)?.name, "Atiku Abubakar", `missed "${said}"`);
    }
    assert.equal(findPerson("peter obi")?.name, "Peter Obi");
    assert.equal(findPerson("inec")?.name, "INEC");
  });

  it("answers about the person before the party", () => {
    const answer = ask("atiku abubakar", {});
    assert.equal(answer.kind, "person");
    assert.ok(answer.text.startsWith("Atiku Abubakar"), `answered: ${answer.text.slice(0, 60)}`);
  });

  it("finds everyone named, not just the first", () => {
    const found = findEveryone("peter obi and tinubu").map((person) => person.name);
    assert.equal(found.length, 2);
  });
});

describe("what goes on the board by itself", () => {
  it("harvests every state named, not just the first", () => {
    const found = harvest("compare kano and rivers").map((spec) => spec.place.state.name);
    assert.deepEqual(found.sort(), ["Kano", "Rivers"]);
  });

  it("harvests nothing from a question", () => {
    assert.deepEqual(harvest("what is turnout"), []);
  });

  it("looks up a person by the name an encyclopaedia files them under", () => {
    assert.deepEqual(
      topics("what did Atiku Abubakar get").map((topic) => topic.look),
      ["Atiku Abubakar"]
    );
    assert.deepEqual(
      topics("tell me about INEC").map((topic) => topic.look),
      ["Independent National Electoral Commission"]
    );
  });

  it("fetches nothing on the strength of one stray word", () => {
    /* A cough, a chair, half of somebody else's sentence. */
    assert.deepEqual(topics("erm"), []);
    assert.deepEqual(topics("yes okay"), []);
  });
});

describe("finding places and parties in a sentence", () => {
  it("does not let a short name swallow a longer one", () => {
    assert.equal(findState("cross river")?.name, "Cross River");
    assert.equal(findState("show me akwa ibom")?.name, "Akwa Ibom");
  });

  it("knows the aliases people actually use", () => {
    assert.equal(findState("abuja")?.code, "FCT");
    assert.equal(findState("nassarawa")?.name, "Nasarawa");
  });

  it("finds a party by candidate surname", () => {
    assert.equal(findParty("what did obi get")?.id, "LP");
    assert.equal(findParty("kwankwaso")?.id, "NNPP");
  });
});
