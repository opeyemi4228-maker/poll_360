import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parse } from "../lib/ask/parse.js";
import { run } from "../lib/ask/engine.js";
import { write, PROVENANCE } from "../lib/ask/write.js";
import { checkAnswer, checkSentence, figuresFrom } from "../lib/ask/verify.js";
import { holds, seal } from "../lib/ask/sign.js";
import { deflateSync } from "node:zlib";
import { briefPdf as writePdf } from "../lib/ask/files/pdf.js";

const briefPdf = async (input, options = {}) =>
  Buffer.concat(await writePdf(input, { compress: async (bytes) => deflateSync(bytes), ...options }));
import { briefCsv, briefXml } from "../lib/ask/files/tables.js";

/**
 * Ask Poll360, held to the record.
 *
 * The figures below are INEC's declared 2023 results as this product holds
 * them. If one of these fails, either the record changed or the engine did,
 * and a campaign would be reading a different number off the screen.
 */

const ATIKU = { kind: "candidate", name: "Atiku Abubakar" };
const ADAMAWA = { level: "STATE", key: "02", name: "Adamawa", stateNumber: "02", stateName: "Adamawa", stateCode: "ADA", lgas: null };

describe("reading a question", () => {
  it("reads the example question as four levels against 25%", () => {
    const { plan } = parse("LIst of States Atiku can get 25%, LGA, ward and Polling unit");
    assert.equal(plan.intent, "reach");
    assert.equal(plan.threshold, 25);
    assert.deepEqual(plan.levels, ["state", "lga", "ward", "unit"]);
    assert.equal(plan.who.name, "Atiku Abubakar");
  });

  it("reads Kano as the state, and Nassarawa LGA as Kano's local government", () => {
    assert.deepEqual(parse("Where can Atiku get 25% in Kano state").plan.within.states, ["KAN"]);
    const nassarawa = parse("Nassarawa LGA in Kano").plan.within;
    assert.deepEqual(nassarawa.states, ["KAN"]);
    assert.equal(nassarawa.lgas.length, 1);
  });

  it("reads common spellings of a local government", () => {
    assert.ok(parse("Danbatta").plan.within.lgas.length === 1);
    assert.ok(parse("Dawakin Kudu").plan.within.lgas.length === 1);
  });

  it("takes 'since 2019' as the year to compare against", () => {
    const { plan } = parse("Where did Atiku lose ground since 2019?");
    assert.equal(plan.intent, "swing");
    assert.equal(plan.compareYear, 2019);
    assert.equal(plan.year, null);
  });

  it("reads a scenario with two parties moving", () => {
    const { plan } = parse("What if Atiku gains 5 points and Tinubu loses 3?");
    assert.deepEqual(plan.scenario.swing, { PDP: 5, APC: -3 });
  });

  it("reads a membership question as the register alone, weakest first", () => {
    const { plan } = parse("Where is the party very weak in terms of party membership (ADC)?");
    assert.equal(plan.intent, "strength");
    assert.deepEqual(plan.who, { kind: "party", id: "ADC" });
    assert.equal(plan.against, null);
    assert.equal(plan.sort?.dir, "asc");
  });

  it("sets the register against Atiku's vote only when asked to compare", () => {
    const { plan } = parse("Compare the party strength with Atiku's vote and the party membership spread");
    assert.equal(plan.intent, "strength");
    assert.equal(plan.who.id, "ADC");
    assert.equal(plan.against, "vote");
  });

  it("follows up on the last question", () => {
    const first = parse("States Atiku can get 25%").plan;
    const next = parse("now the wards in Plateau", first).plan;
    assert.equal(next.intent, "reach");
    assert.deepEqual(next.levels, ["ward"]);
    assert.deepEqual(next.within.states, ["PLA"]);
  });
});

describe("answering from the record", () => {
  it("finds Atiku over 25% in 21 of 36 states in 2023, three short of Section 134", async () => {
    const result = await run({ intent: "reach", who: ATIKU, levels: ["state"], threshold: 25 });
    const facts = result.sections[0].facts;
    assert.equal(facts.section134.cleared, 21);
    assert.equal(facts.section134.shortBy, 3);
    assert.match(write(result).headline, /21 of the 36 states/);
  });

  it("says where the nearest places are when nothing is near the line", async () => {
    const result = await run({ intent: "reach", who: ATIKU, levels: ["lga"], threshold: 25, within: { states: ["KAN"] } });
    const text = write(result);
    assert.match(text.headline, /none of Kano's 44 local governments/);
    assert.ok(text.reading.some((line) => line.startsWith("Nearest to the line")));
  });

  it("counts every ward read, not only the ones that match", async () => {
    const result = await run({ intent: "list", who: ATIKU, levels: ["ward"], within: { states: ["KAN"] }, filters: [{ field: "won", op: "=", value: true }] });
    assert.equal(result.sections[0].read, 484);
    assert.match(write(result).headline, /none of Kano's 484 wards/);
  });

  it("reads nobody but Atiku below the state, and says so", async () => {
    const result = await run({ intent: "reach", who: { kind: "party", id: "APC" }, levels: ["lga"], threshold: 25 });
    assert.equal(result.sections[0].level, "state");
    assert.ok(result.notes.some((note) => /nobody else's/.test(note)));
  });

  it("keeps an account inside its own ground", async () => {
    const result = await run({ intent: "reach", who: ATIKU, levels: ["state"], threshold: 25, within: { states: ["KAN"] } }, { territory: ADAMAWA });
    assert.deepEqual(result.sections[0].rows.map((row) => row.code), ["ADA"]);
    assert.ok(result.notes.some((note) => /outside it/.test(note)));
  });

  it("reads nothing for a ground that no longer resolves", async () => {
    const result = await run({ intent: "list", who: ATIKU, levels: ["state"] }, { territory: { level: "UNRESOLVED", stateCode: null, lgas: [] } });
    assert.equal(result.sections.length, 0);
  });

  it("answers membership from the register without the vote", async () => {
    const result = await run({ intent: "strength", who: { kind: "party", id: "ADC" }, levels: ["state"], sort: { field: "per_thousand", dir: "asc" } });
    assert.deepEqual(result.sections.map((section) => section.provenance), ["register"]);
    const rows = result.sections[0].rows;
    assert.ok(rows[0].per_thousand <= rows[rows.length - 1].per_thousand);
  });
});

describe("holding the model's words to the record", () => {
  it("passes a figure the engine gave, at the precision printed", () => {
    const allowed = figuresFrom([{ share: 57.11778, need: 1345005 }]);
    assert.ok(checkSentence("Adamawa gave him 57.1%.", allowed).ok);
    assert.ok(checkSentence("About 1.3 million votes to find.", allowed).ok);
  });

  it("drops a sentence carrying a figure nobody computed", () => {
    const allowed = figuresFrom([{ share: 57.11778 }]);
    const checked = checkAnswer({ headline: "He took 57.1%.", reading: ["He took 57.1%.", "He will win 61% next time."], plan: [] }, allowed);
    assert.ok(checked.headlineOk);
    assert.deepEqual(checked.reading, ["He took 57.1%."]);
    assert.equal(checked.dropped.length, 1);
  });
});

describe("files", () => {
  it("seals an answer to the account that asked", () => {
    const payload = { id: "x", question: "q", askedAt: new Date().toISOString(), engine: "poll360", plans: [], answer: { headline: "h" } };
    const token = seal(payload, "u1");
    assert.ok(holds(payload, "u1", token));
    assert.ok(!holds(payload, "u2", token));
    assert.ok(!holds({ ...payload, answer: { headline: "forged" } }, "u1", token));
  });

  it("writes a PDF, a CSV and XML from one answer", async () => {
    const result = await run({ intent: "reach", who: ATIKU, levels: ["state"], threshold: 25 });
    const text = write(result);
    const payload = { id: "00000000-test", question: "States Atiku can get 25%", askedAt: new Date().toISOString(), engine: "poll360", plans: [result.plan], answer: text };
    const sections = result.sections.map((section) => ({ ...section, provenanceLabel: PROVENANCE[section.provenance] }));
    const input = { payload, sections, understood: result.understood, scopeName: "Nigeria" };

    const pdf = await briefPdf(input);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.match(pdf.subarray(-7).toString("latin1"), /%%EOF/);

    const csv = briefCsv(input);
    assert.ok(csv.startsWith("﻿Level,Rank,"));
    assert.equal(csv.trim().split("\r\n").length, 38);

    const xml = briefXml(input);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.match(xml, /<table n="1" level="state" basis="counted" rows="37"/);
  });
});

describe("the model path, against a scripted stand-in for the API", () => {
  it("runs the model's plan, keeps what traces and drops what does not", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-used";
    const { useClientForTests } = await import("../lib/ask/model.js");
    const { answer } = await import("../lib/ask/answer.js");

    const calls = [];
    const script = [
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "call-1",
            name: "query_record",
            input: { intent: "reach", who: { kind: "candidate", name: "Atiku Abubakar" }, levels: ["state"], threshold: 25 },
          },
        ],
      },
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "call-2",
            name: "deliver_answer",
            input: {
              headline: "Atiku cleared 25% in 21 of the 36 states in 2023, 3 short of the 24 needed.",
              reading: ["Adamawa gave him 57.1%.", "He will carry 30 states next time."],
              plan: [],
              followups: ["Now the local governments"],
              tables: ["t1.1"],
            },
          },
        ],
      },
    ];
    useClientForTests({
      beta: {
        messages: {
          create: async (params) => {
            calls.push(params);
            return script[calls.length - 1];
          },
        },
      },
    });

    try {
      const reply = await answer({ question: "Where can Atiku get 25%?", userId: "u1" });
      assert.equal(reply.engine, "model");
      assert.match(reply.answer.headline, /21 of the 36 states/);
      assert.ok(reply.answer.reading.includes("Adamawa gave him 57.1%."));
      assert.ok(!reply.answer.reading.some((line) => /30 states/.test(line)));
      assert.equal(reply.checked.dropped, 1);
      assert.equal(reply.sections[0].level, "state");
      /* The engine's result went back to the model as a tool result. */
      const toolResult = calls[1].messages
        .filter((message) => message.role === "user" && Array.isArray(message.content))
        .flatMap((message) => message.content)
        .find((block) => block.type === "tool_result");
      assert.equal(toolResult.tool_use_id, "call-1");
      assert.match(toolResult.content, /"cleared":21/);
    } finally {
      useClientForTests(null);
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("falls back to Poll360's own reader when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-used";
    const { useClientForTests } = await import("../lib/ask/model.js");
    const { answer } = await import("../lib/ask/answer.js");
    useClientForTests({ beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } });
    try {
      const reply = await answer({ question: "States Atiku can get 25%", userId: "u1" });
      assert.equal(reply.engine, "poll360");
      assert.match(reply.answer.headline, /21 of the 36 states/);
    } finally {
      useClientForTests(null);
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

describe("hardening", () => {
  it("answers on its own when the browser sends back a plan that no longer runs", async () => {
    const { answer } = await import("../lib/ask/answer.js");
    const broken = { intent: "reach", who: { kind: "candidate", name: "Atiku Abubakar" }, levels: ["nowhere"] };
    const reply = await answer({ question: "now the wards", previous: broken, userId: "u1", useModel: false });
    assert.ok(reply.sections.length > 0);
  });

  it("never writes a CSV cell that Excel would run as a formula", () => {
    const csv = briefCsv({
      sections: [
        {
          level: "ward",
          title: "t",
          provenanceLabel: { label: "Register" },
          columns: [{ key: "name", label: "Ward", kind: "text", main: true }, { key: "members", label: "Members", kind: "int" }],
          rows: [{ rank: 1, name: "=HYPERLINK(\"http://x\")", members: 4 }],
        },
      ],
    });
    assert.ok(csv.includes("\"'=HYPERLINK(\"\"http://x\"\")\""));
  });

  it("holds a plain count to the exact figure computed", () => {
    const allowed = figuresFrom([{ cleared: 21, share: 29.8 }]);
    assert.ok(checkSentence("He cleared it in 21 states.", allowed).ok);
    assert.ok(!checkSentence("He will carry 30 states.", allowed).ok);
    assert.ok(checkSentence("about 30 votes a unit", allowed).ok);
  });
});

describe("empty answers explain themselves", () => {
  it("says why Gombe has no primary strongholds, and lists what it has instead", async () => {
    const result = await run(parse("Primary strongholds in Gombe").plan);
    const section = result.sections[0];
    assert.equal(section.unfiltered, true);
    assert.equal(section.rows.length, 11);
    assert.ok(section.columns.some((column) => column.key === "won_prev"));
    const text = write(result);
    assert.match(text.headline, /None of Gombe's 11 local governments is a primary stronghold/);
    assert.match(text.headline, /none in 2019/);
    assert.ok(text.reading.some((line) => /2 secondary/.test(line) && /9 tertiary/.test(line)));
    assert.ok(result.understood.some((chip) => chip.value === "primary strongholds"));
  });
});

describe("the analysis under an answer", () => {
  it("works out the register covered, the edge and the zones for a 25% question", async () => {
    const { analyse } = await import("../lib/ask/insight.js");
    const result = await run(parse("List of States Atiku can get 25%").plan);
    const analysis = analyse(result);
    const labels = analysis.numbers.map((entry) => entry.label);
    assert.ok(labels.includes("Voters where he cleared 25%"));
    assert.ok(labels.includes("Narrowly over (25–30%)"));
    assert.equal(analysis.breakdown.bars.length, 6);
    assert.ok(analysis.findings.some((line) => /North East is where the line holds/.test(line)));
  });

  it("keeps a membership answer to membership", async () => {
    const { analyse } = await import("../lib/ask/insight.js");
    const result = await run(parse("Where is the ADC weakest on membership?").plan);
    const analysis = analyse(result);
    const written = write(result);
    /* The answer itself — the follow-ups offered after it may suggest the comparison. */
    const text = JSON.stringify(analysis) + JSON.stringify([written.headline, written.reading, written.plan]);
    assert.ok(!/Atiku/.test(text), "a membership answer does not bring in the vote");
    assert.ok(!/women/i.test(write(result).reading.join(" ")), "nor demographics nobody asked for");
  });
});

describe("maps and charts", () => {
  it("maps a national 25% question by state, in status colours, with a 2019-to-2023 chart", async () => {
    const { visualise, STATUS_COLOUR } = await import("../lib/ask/visual.js");
    const result = await run(parse("List of States Atiku can get 25%").plan);
    const { map, chart } = visualise(result);
    assert.equal(map.level, "state");
    assert.equal(Object.keys(map.fills).length, 37);
    assert.equal(map.fills.ADA.color, STATUS_COLOUR.held);
    assert.equal(map.fills.KAN.color, STATUS_COLOUR.beyond);
    assert.equal(chart.kind, "dumbbell");
    assert.equal(chart.rows.length, 37);
    assert.equal(chart.line, 25);
  });

  it("maps one state by local government, with bands that separate them", async () => {
    const { visualise } = await import("../lib/ask/visual.js");
    const result = await run(parse("Tell me about Kano State").plan);
    const { map } = visualise(result);
    assert.equal(map.level, "lga");
    assert.equal(map.state, "KAN");
    assert.ok(new Set(Object.values(map.fills).map((fill) => fill.color)).size >= 4, "not one colour");
    assert.match(map.note, /between/);
  });

  it("draws the map outlines into the PDF", async () => {
    const { visualise } = await import("../lib/ask/visual.js");
    const { geometryFor } = await import("../lib/ask/geometry.js");
    const result = await run(parse("List of States Atiku can get 25%").plan);
    const visual = visualise(result);
    const geometry = await geometryFor(visual.map);
    assert.equal(geometry.regions.length, 37);
    const payload = { id: "00000000-map", question: "q", askedAt: new Date().toISOString(), engine: "poll360", plans: [result.plan], answer: write(result) };
    const sections = result.sections.map((section) => ({ ...section, provenanceLabel: PROVENANCE[section.provenance] }));
    const pdf = await briefPdf({ payload, sections, understood: result.understood, scopeName: "Nigeria", visual, geometry });
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});

describe("answers lead with what was asked", () => {
  const ask = async (question) => {
    const { answer } = await import("../lib/ask/answer.js");
    return answer({ question, userId: "u1", useModel: false });
  };

  it("gives votes when asked how many votes", async () => {
    const reply = await ask("how many votes did atiku get in kaduna");
    assert.match(reply.answer.headline, /554,360 votes/);
  });

  it("sets two candidates against each other", async () => {
    const reply = await ask("atiku vs tinubu in oyo");
    assert.equal(reply.plans[0].intent, "versus");
    assert.match(reply.answer.headline, /Tinubu ahead/);
  });

  it("answers what it takes to win with both tests, on the declared national totals", async () => {
    const reply = await ask("What does Atiku need to win?");
    assert.equal(reply.plans[0].intent, "outlook");
    assert.match(reply.answer.headline, /1,810,206/);
    assert.match(reply.answer.headline, /short of the 24 at 25%/);
  });

  it("reads the national result from INEC's declared totals", async () => {
    const reply = await ask("who won the 2023 election");
    assert.match(reply.answer.headline, /8,794,726/);
  });

  it("works out another party's strongholds from its own runs", async () => {
    const { stateRows } = await import("../lib/ask/ground.js");
    const apc = stateRows({ kind: "party", id: "APC" });
    assert.equal(apc.find((row) => row.code === "LAG").tier, "TERTIARY", "carried in 2019, lost to Obi in 2023");
  });

  it("answers turnout questions about turnout", async () => {
    const reply = await ask("which states had the lowest turnout");
    assert.match(reply.answer.headline, /^Turnout across Nigeria/);
    assert.match(reply.answer.headline, /lowest in Bayelsa/);
  });

  it("reads 3 million as a number of voters", async () => {
    const reply = await ask("states with more than 3 million registered voters");
    assert.match(reply.answer.headline, /over 3,000,000 registered voters/);
  });

  it("does not read a turnout rise as a line of vote share", async () => {
    const reply = await ask("what if turnout rises 10%");
    assert.equal(reply.plans[0].threshold, null);
    assert.match(reply.answer.headline, /^If turnout rises 10%/);
  });

  it("answers a greeting with what it can do, not with a table", async () => {
    const reply = await ask("Hello");
    assert.equal(reply.sections.length, 0);
    assert.match(reply.answer.headline, /Ask Poll360 answers/);
  });
});

describe("regions", () => {
  const ask = async (question) => {
    const { answer } = await import("../lib/ask/answer.js");
    return answer({ question, userId: "u1", useModel: false });
  };
  const SOUTH = ["EKI", "LAG", "OGU", "OND", "OSU", "OYO", "ABI", "ANA", "EBO", "ENU", "IMO", "AKW", "BAY", "CRO", "DEL", "EDO", "RIV"];

  it("reads 'the south' as the 17 southern states and nothing else", async () => {
    const reply = await ask("states in the south atiku can get 25%");
    assert.equal(reply.plans[0].within.region, "South");
    const rows = reply.sections[0].rows;
    assert.equal(rows.length, 17);
    assert.ok(rows.every((row) => SOUTH.includes(row.key)));
    assert.match(reply.answer.headline, /of the South's 17 states/);
    assert.ok(Object.keys(reply.visual.map.fills).every((code) => SOUTH.includes(code)), "the map is the South");
  });

  it("reads 'northern states' as the 19 northern states and the FCT", async () => {
    const reply = await ask("northern states atiku won");
    assert.equal(reply.plans[0].within.region, "North");
    assert.match(reply.answer.headline, /19 states and the FCT/);
    assert.equal(Object.keys(reply.visual.map.fills).length, 20);
  });

  it("does not take Jos North for the North", async () => {
    const reply = await ask("wards in jos north atiku won");
    assert.equal(reply.plans[0].within.region, null);
  });

  it("gives a region its own result", async () => {
    const reply = await ask("who won the south in 2023");
    assert.match(reply.answer.headline, /^The South, 2023: Peter Obi/);
  });

  it("targets a region's local governments, only in that region", async () => {
    const reply = await ask("where should we focus in the south");
    assert.equal(reply.sections[0].level, "lga");
    assert.ok(reply.sections[0].rows.every((row) => SOUTH.includes(row.stateCode)));
  });
});

describe("research and the biggest places", () => {
  const ask = async (question) => {
    const { answer } = await import("../lib/ask/answer.js");
    return answer({ question, userId: "u1", useModel: false });
  };

  it("researches any candidate across their runs and parties", async () => {
    const reply = await ask("research Buhari");
    assert.equal(reply.plans[0].intent, "research");
    assert.match(reply.answer.headline, /5 times/);
    assert.match(reply.answer.headline, /ANPP/);
    assert.ok(reply.sections.some((section) => section.columns.some((column) => column.key === "average")));
  });

  it("finds an aspirant by a near spelling", async () => {
    const reply = await ask("Kwankwanso record");
    assert.match(reply.answer.headline, /^Rabiu Kwankwaso/);
  });

  it("says plainly when an aspirant has never stood", async () => {
    const reply = await ask("research Rotimi Amaechi");
    assert.match(reply.answer.headline, /has not stood for president in the record/);
  });

  it("ranks any number of the biggest polling units, and says how much of the register they hold", async () => {
    const reply = await ask("the 66,000 biggest polling units");
    assert.equal(reply.plans[0].intent, "ground");
    assert.equal(reply.plans[0].size, 66000);
    assert.match(reply.answer.headline, /66,000 biggest polling units/);
    assert.match(reply.answer.headline, /of the register/);
    assert.equal(reply.sections[0].provenance.startsWith("estimated"), true);
  });

  it("never ranks turnout above 100%", async () => {
    const reply = await ask("highest turnout polling units in the south");
    assert.ok(reply.sections[0].rows.every((row) => row.turnout <= 100));
  });

  it("keeps a share question about a candidate a share question", async () => {
    const reply = await ask("top 10 states for atiku");
    assert.equal(reply.plans[0].intent, "list");
  });

  it("draws the whole country behind a regional map, never a crop", async () => {
    const { geometryFor } = await import("../lib/ask/geometry.js");
    const reply = await ask("states in the south atiku can get 25%");
    const geometry = await geometryFor(reply.visual.map);
    assert.deepEqual(geometry.box, [0, 0, 1000, 812]);
    assert.equal(geometry.regions.length, 37);
  });
});

describe("the path to the next election", () => {
  const ask = async (question) => {
    const { answer } = await import("../lib/ask/answer.js");
    return answer({ question, userId: "u1", useModel: false });
  };

  it("answers 'chances of Atiku winning 2027' with the distance, never a made-up percentage", async () => {
    const reply = await ask("Chances of Atiku winning 2027 elections based on data.");
    assert.equal(reply.plans[0].intent, "outlook");
    assert.match(reply.answer.headline, /1,810,206 votes behind the APC/);
    assert.match(reply.answer.headline, /3 states short of the 24/);
    assert.ok(!/\d+% chance/.test(JSON.stringify(reply.answer)), "no invented probability");
    assert.deepEqual(reply.sections.map((section) => section.level), ["state", "lga", "ward", "unit"]);
  });

  it("gives every state a role", async () => {
    const reply = await ask("Chances of Atiku winning 2027 elections based on data.");
    const roles = new Set(reply.sections[0].rows.map((row) => row.role));
    assert.deepEqual([...roles].sort(), ["base", "defend", "out", "target"]);
    assert.ok(reply.sections[3].rows.every((row) => row.turnout === null || row.turnout <= 100));
  });
});

/** True when every row sits with its own state, local government and ward, never split. */
function nested(rows, keys) {
  const seen = keys.map(() => new Set());
  const last = keys.map(() => undefined);
  for (const row of rows) {
    for (const [at, key] of keys.entries()) {
      const value = key(row);
      /* A value that changes must be new: coming back to one means it was split. */
      if (value !== last[at]) {
        if (seen[at].has(value)) return false;
        seen[at].add(value);
      }
    }
    keys.forEach((key, at) => (last[at] = key(row)));
  }
  return true;
}

describe("arranged by state, local government, ward and polling unit", () => {
  const wardOf = (row) => String(row.key).split("-").slice(0, 3).join("-");
  async function full(question) {
    const { answer } = await import("../lib/ask/answer.js");
    const { sectionsOf } = await import("../lib/ask/rows.js");
    const reply = await answer({ question, userId: "u1", useModel: false });
    return { reply, sections: await sectionsOf(reply.plans, null, `test:${question}`) };
  }

  it("holds each state's places together, in the state table's order", async () => {
    const { reply, sections } = await full("Chances of Atiku winning 2027 elections based on data.");
    const [states, lgas, wards, units] = sections;
    const stateOrder = states.rows.map((row) => row.code);
    const order = (rows) => [...new Set(rows.map((row) => row.stateCode))];
    assert.deepEqual(order(lgas.rows), stateOrder.filter((code) => lgas.rows.some((row) => row.stateCode === code)));
    assert.deepEqual(order(units.rows), order(lgas.rows));
    assert.ok(nested(lgas.rows, [(row) => row.stateCode]));
    assert.ok(nested(wards.rows, [(row) => row.stateCode, (row) => row.lgaKey]));
    assert.ok(nested(units.rows, [(row) => row.stateCode, (row) => row.lgaKey, wardOf]));
    /* Inside a state, local governments come most important first, and
       each local government's wards follow the local government order. */
    const lgaAt = new Map(lgas.rows.map((row, index) => [row.key, index]));
    const firstState = lgas.rows.filter((row) => row.stateCode === stateOrder[0]);
    for (let at = 1; at < firstState.length; at += 1) assert.ok(firstState[at - 1].score >= firstState[at].score);
    let previous = -1;
    for (const row of wards.rows.filter((entry) => entry.stateCode === stateOrder[0])) {
      const at = lgaAt.get(row.lgaKey);
      assert.ok(at >= previous, "wards follow their local governments' order");
      previous = at;
    }
    assert.equal(units.group.key, "stateCode");
    assert.equal(reply.sections[3].groups.length, 37);
    assert.equal(reply.sections[3].groups.reduce((sum, group) => sum + group.count, 0), 176623);
    /* The reading still names places across several states. */
    const named = reply.answer.reading.find((line) => /^Local governments to focus on first/.test(line)) ?? "";
    assert.ok(new Set([...named.matchAll(/\(([^)]+)\)/g)].map((match) => match[1])).size >= 4, named);
  });

  it("starts at the local governments when the question is about one state", async () => {
    const { sections } = await full("Chances of Atiku winning 2027 in Kano");
    const [states, lgas, wards, units] = sections;
    assert.deepEqual(states.rows.map((row) => row.code), ["KAN"]);
    assert.equal(lgas.rows.length, 44);
    assert.equal(lgas.group, null);
    assert.equal(wards.group.key, "lgaKey");
    assert.equal(units.group.key, "lgaKey");
    assert.ok(nested(wards.rows, [(row) => row.lgaKey]));
    assert.ok(nested(units.rows, [(row) => row.lgaKey, wardOf]));
    assert.match(units.title, /by local government and ward/);
  });
});

describe("every row, not just some", () => {
  it("holds every state, local government, ward and polling unit in the path to 2027", async () => {
    const { answer } = await import("../lib/ask/answer.js");
    const reply = await answer({ question: "Chances of Atiku winning 2027 elections based on data.", userId: "u1", useModel: false });
    assert.deepEqual(reply.sections.map((section) => section.total), [37, 774, 8809, 176623]);
  });

  it("pages, searches and sorts across every row", async () => {
    const { sectionsOf, pageOf } = await import("../lib/ask/rows.js");
    const { answer } = await import("../lib/ask/answer.js");
    const reply = await answer({ question: "Chances of Atiku winning 2027 elections based on data.", userId: "u1", useModel: false });
    const sections = await sectionsOf(reply.plans, null, "test:outlook");
    const units = sections[3];

    const last = pageOf(units, { offset: 176600, limit: 100 });
    assert.equal(last.rows.length, 23, "the last page is there");
    assert.equal(last.rows[22].rank, 176623);

    const found = pageOf(units, { query: "utugu", limit: 100 });
    assert.ok(found.matched >= 1 && found.rows.every((row) => /utugu/i.test(row.name)));

    const biggest = pageOf(units, { sort: { key: "registered", dir: "desc" }, limit: 3 });
    assert.ok(biggest.rows[0].registered >= biggest.rows[1].registered);
    assert.equal(biggest.rows[0].registered, units.rows.reduce((top, row) => Math.max(top, row.registered ?? 0), 0));
  });

  it("keeps every ward in a 25% answer, not only those near the line", async () => {
    const result = await run(parse("wards in plateau atiku can get 25%").plan);
    assert.equal(result.sections[0].total, result.sections[0].read);
  });
});

describe("the PDF carries every row", () => {
  it("prints all 176,623 polling units, with bookmarks and page ranges", async () => {
    const { answer } = await import("../lib/ask/answer.js");
    const { sectionsOf } = await import("../lib/ask/rows.js");
    const { PROVENANCE: LABELS } = await import("../lib/ask/write.js");
    const reply = await answer({ question: "Chances of Atiku winning 2027 elections based on data.", userId: "u1", useModel: false });
    const sections = (await sectionsOf(reply.plans, null, "test:pdf")).map((section) => ({ ...section, provenanceLabel: LABELS[section.provenance] }));
    const payload = { id: reply.id, question: reply.question, askedAt: reply.askedAt, engine: reply.engine, plans: reply.plans, answer: reply.answer };
    let lastProgress = null;
    const pdf = await briefPdf({ payload, sections, understood: reply.understood, scopeName: "Nigeria" }, { onProgress: (progress) => (lastProgress = progress) });
    const text = pdf.toString("latin1");
    const pageCount = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)[1]);
    const rows = 37 + 774 + 8809 + 176623;
    assert.ok(pageCount > rows / 45, `every row printed across ${pageCount} pages`);
    assert.equal(lastProgress.page, pageCount);
    assert.match(text, /\/Outlines/);
    assert.match(text, /%%EOF\n$/);
  });
});

describe("the questions a campaign asks, read the way they are meant", () => {
  const read = async (question, previous = null) => {
    const { answer } = await import("../lib/ask/answer.js");
    return answer({ question, previous, userId: "u1", useModel: false });
  };
  const intentOf = (reply) => reply.plans[reply.plans.length - 1].intent;

  it("sends strategy and campaign questions to the path, in the ground named", async () => {
    for (const question of ["Where should Atiku campaign?", "How can Atiku win 2027?", "Which states should we focus on to win?"]) {
      assert.equal(intentOf(await read(question)), "outlook", question);
    }
    const kano = await read("Strategy to win Kano");
    assert.equal(intentOf(kano), "outlook");
    assert.match(kano.answer.headline, /^In Kano, Atiku took 7\.7% in 2023/);
    const southWest = await read("Can Atiku win the South West?");
    assert.match(southWest.answer.headline, /^In the South West, Atiku carried 1 of 6 states/);
  });

  it("gives the leader a leader's answer, never a swing of nothing", async () => {
    const reply = await read("Tinubu 2027 chances");
    assert.match(reply.answer.headline, /the one to beat/);
    assert.ok(!/swing of about 0 points/.test(reply.answer.headline));
  });

  it("answers how every state voted, in any mapped year and any region", async () => {
    const all = await read("Results of 2019 presidential election by state");
    assert.equal(intentOf(all), "national");
    assert.deepEqual(all.sections.map((section) => section.total), [6, 37]);
    const region = await read("Show me the North Central results");
    assert.equal(region.sections[1].total, 7);
    const year = await read("What happened in 2015?");
    assert.equal(year.plans[0].year, 2015);
    const most = await read("Which party won the most states in 2023?");
    assert.match(most.answer.headline, /carried 12 states each/);
  });

  it("answers who governs, and a party's governors", async () => {
    const rivers = await read("Who is the governor of Rivers?");
    assert.equal(intentOf(rivers), "governor");
    assert.match(rivers.answer.headline, /^Rivers' governor is Siminalayi Fubara/);
    const pdp = await read("How many governors does the PDP have?");
    assert.match(pdp.answer.headline, /^The PDP has/);
    const lagos = await read("and Lagos?", rivers.plans[0]);
    assert.equal(intentOf(lagos), "governor");
    assert.match(lagos.answer.headline, /Babajide Sanwo-Olu/);
  });

  it("pools a coalition's declared votes, and never pools the one to beat", async () => {
    const three = await read("Can Atiku win if Obi and Kwankwaso join him?");
    assert.equal(intentOf(three), "coalition");
    assert.deepEqual(three.plans[0].partners, ["PDP", "LP", "NNPP"]);
    const two = await read("If Atiku and Obi run together, can they beat Tinubu?");
    assert.deepEqual(two.plans[0].partners, ["PDP", "LP"]);
    assert.match(two.answer.headline, /13,086,053 votes/);
    assert.match(two.answer.headline, /4,291,327 more than the APC's 8,794,726/);
    const added = await read("add Kwankwaso", two.plans[0]);
    assert.deepEqual(added.plans[0].partners, ["PDP", "LP", "NNPP"]);
    const adc = await read("ADC and PDP coalition");
    assert.match(adc.answer.headline, /not held on its own/);
  });

  it("explains what it takes to win", async () => {
    for (const question of ["Explain section 134", "How many votes to win the presidency?"]) {
      const reply = await read(question);
      assert.equal(intentOf(reply), "rules", question);
      assert.match(reply.answer.headline, /24 of the 36/);
    }
  });

  it("reads the scenario in one state as that state's contest", async () => {
    const reply = await read("If turnout increases by 10% in Kano, what happens?");
    assert.match(reply.answer.headline, /Kano still goes to the NNPP/);
    assert.ok(!/wins on the plurality/.test(reply.answer.headline));
    const north = await read("What if Atiku gets 5% more in the North?");
    assert.equal(intentOf(north), "scenario");
    assert.equal(north.plans[0].scenario.swing.PDP, 5);
    assert.equal(north.plans[0].threshold, null);
  });

  it("reads the everyday shapes", async () => {
    const gombe = await read("Atiku votes in Gombe LGAs");
    assert.equal(gombe.sections[0].total, 11, "Gombe LGAs are the state's eleven, not the Gombe LGA");
    const register = await read("Registered voters in Kano");
    assert.match(register.answer.headline, /^Kano has 5,645,124 registered voters/);
    const swingStates = await read("Swing states in 2023");
    assert.equal(swingStates.plans[0].focus, "close");
    const tinubu = await read("Tinubu's strongholds");
    assert.match(tinubu.answer.headline, /one run in this record/);
    const fct = await read("Did Tinubu meet the 25% requirement in FCT?");
    assert.match(fct.answer.headline, /^No — Tinubu took 19\.8%/);
    const margin = await read("Rank states by Atiku vote margin");
    assert.equal(margin.plans[0].sort.field, "lead");
    const flipped = await read("Which states did Atiku win in 2019 but lose in 2023?");
    assert.match(flipped.answer.headline, /carried 14 states in 2019 that he lost in 2023/);
    const gains = await read("Where did PDP gain between 2019 and 2023?");
    assert.match(gains.answer.headline, /rose in 13 of 37 states/);
    assert.ok(!/\bhe\b/.test(gains.answer.headline), "a party is 'it'");
    const top = await read("Top 10 LGAs for Atiku in Kaduna");
    assert.equal(intentOf(top), "list");
    const trend = await read("Trend of PDP vote since 1999");
    assert.equal(intentOf(trend), "research");
    const versus = await read("Where did Obi beat Atiku?");
    assert.equal(intentOf(versus), "versus");
  });

  it("keeps a follow-up on the question it follows", async () => {
    const first = await read("Chances of Atiku winning 2027");
    const kano = await read("what about Kano?", first.plans[0]);
    assert.equal(intentOf(kano), "outlook");
    assert.deepEqual(kano.plans[0].within.states, ["KAN"]);
  });
});
