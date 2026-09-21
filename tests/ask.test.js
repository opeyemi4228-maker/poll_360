import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parse } from "../lib/ask/parse.js";
import { run } from "../lib/ask/engine.js";
import { write, PROVENANCE } from "../lib/ask/write.js";
import { checkAnswer, checkSentence, figuresFrom } from "../lib/ask/verify.js";
import { holds, seal } from "../lib/ask/sign.js";
import { briefPdf } from "../lib/ask/files/pdf.js";
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

    const pdf = briefPdf(input);
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
