import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inTurn, irev, serviceIn } from "../lib/irev/client.js";
import { check, listing, step, turn } from "../lib/irev/gather.js";
import { kindOf, readSome, readingRow } from "../lib/irev/read.js";
import { chosen, electionRow, heldOn, placeRows, sheetRow, sheetRows, typeCode, uploadedAt } from "../lib/irev/shape.js";
import { ACCOUNT, FAULTS, FAULT_NAMES, LATE_DAYS, TABLES, VIEWS, createStatement } from "../lib/irev/vault.js";

/**
 * Gathering from INEC's Result Viewing Portal.
 *
 * The shapes below are cut from the portal's real answers, trimmed. What is
 * tested is the part that can go wrong quietly: a date a day out, a unit
 * counted twice, a busy portal treated as an empty one, a watch that re-reads
 * the country every minute.
 */

const OSUN = {
  _id: "6a7f788adcbc755a763f082a",
  full_name: "Governorship election - 2026-08-15 - OSUN",
  election_id: 5008,
  state_id: 30,
  state: { name: "OSUN", state_id: 30 },
  election_date: "2026-08-14T23:00:00.000Z",
  domain: { name: "OSUN" },
  election_type: { code: "GOV", name: "Governorship election" },
  onModel: "State",
};

const UNIT = {
  _id: "6a7f7928dcbc755a763f1347",
  polling_unit_id: 97559,
  name: "IDIOMO APENA COMPD.",
  pu_code: "29/07/04/010",
  ward_id: 24455,
  lga_id: 3710,
  polling_unit: { state_id: 30 },
  old_documents: [],
  is_zero_pu: false,
  document: { url: "https://example.test/sheet.jpg", updated_at: "2026-08-19T04:36:02.831Z", is_supplement: false },
};

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => String(body) });

describe("IReV rows", () => {
  it("takes the day from the election's title, not the stored midnight", () => {
    assert.equal(heldOn(OSUN), "2026-08-15");
    assert.equal(heldOn({ election_date: "2026-08-14T23:00:00.000Z" }), "2026-08-15");
    assert.equal(heldOn({}), null);
  });

  it("names an election by type, year and state", () => {
    const row = electionRow(OSUN);
    assert.deepEqual(
      [row.election_id, row.type_code, row.year, row.state_name, row.held_on],
      [5008, "GOV", 2026, "OSUN", "2026-08-15"]
    );
  });

  it("does not file a presidential election under one state", () => {
    const row = electionRow({ ...OSUN, state_id: 1, state: { name: "ABIA" }, election_type: { code: "PRES" } });
    assert.equal(row.state_id, null);
    assert.equal(row.state_name, null);
  });

  it("keeps a unit with no sheet, as a unit with no sheet", () => {
    const row = sheetRow(5008, { ...UNIT, document: undefined });
    assert.equal(row.unit_id, 97559);
    assert.equal(row.sheet_url, null);
    assert.equal(sheetRow(5008, UNIT).sheet_url, "https://example.test/sheet.jpg");
  });

  it("lists a unit once however many times the portal sends it", () => {
    assert.equal(sheetRows(5008, [UNIT, UNIT, { name: "no id" }]).length, 1);
  });

  it("flattens local governments and their wards", () => {
    const { lgas, wards } = placeRows(5008, [
      {
        lga: { _id: "l1", lga_id: 3710, name: "EDE NORTH", code: "07", state_id: 30 },
        state: { name: "OSUN", state_id: 30 },
        wards: [
          { _id: "w1", ward_id: 24455, name: "OLUSOKUN", code: "04", lga_id: 3710, state_id: 30 },
          { _id: "w1", ward_id: 24455, name: "OLUSOKUN", code: "04", lga_id: 3710, state_id: 30 },
        ],
      },
    ]);
    assert.equal(lgas[0].state_name, "OSUN");
    assert.equal(wards.length, 1);
  });

  it("understands the words people type for a type", () => {
    assert.equal(typeCode("Governorship"), "GOV");
    assert.equal(typeCode("pres"), "PRES");
    assert.equal(typeCode("mayor"), null);
  });

  it("narrows by every part given and none left out", () => {
    const all = [electionRow(OSUN), electionRow({ ...OSUN, election_id: 1291, full_name: "Governorship election - 2022-07-16 - OSUN" })];
    assert.equal(chosen(all, { state: "osun" }).length, 2);
    assert.deepEqual(chosen(all, { state: "Osun", year: "2022" }).map((e) => e.election_id), [1291]);
    assert.equal(chosen(all, { type: "PRES" }).length, 0);
    assert.equal(chosen(all, { id: "5008" }).length, 1);
  });
});

describe("the IReV reader", () => {
  it("finds the data service in the portal's script", () => {
    const script = 'x}getEndpoint(){return"https://somewhere.example/api/v1/"}getUrl(){';
    assert.equal(serviceIn(script), "https://somewhere.example/api/v1/");
    assert.equal(serviceIn("nothing here"), null);
  });

  it("tries again when the portal is busy, and gets the answer", async () => {
    let asked = 0;
    const reader = irev({
      service: "https://irev.test/api/v1/",
      wait: async () => {},
      fetcher: async () => (++asked < 3 ? answer({}, 503) : answer({ success: true, data: [{ code: "GOV" }] })),
    });
    assert.deepEqual(await reader.types(), [{ code: "GOV" }]);
    assert.equal(asked, 3);
  });

  it("does not ask again for something the portal refused", async () => {
    let asked = 0;
    const reader = irev({
      service: "https://irev.test/api/v1/",
      wait: async () => {},
      fetcher: async () => (asked++, answer({ success: false, message: "bad type" }, 400)),
    });
    await assert.rejects(reader.elections("nope"), /400/);
    assert.equal(asked, 1);
  });

  it("follows the portal when the data service has moved", async () => {
    const reader = irev({
      service: "https://old.test/api/v1/",
      wait: async () => {},
      fetcher: async (url) => {
        const at = String(url);
        if (at.startsWith("https://old.test")) throw new Error("gone");
        if (at.endsWith(".js")) return answer('getEndpoint(){return"https://new.test/api/v1/"}');
        if (at.startsWith("https://www.inecelectionresults.ng")) return answer('<script src="main.abc123.js">');
        return answer({ success: true, data: { pus: 10, documents: 4 } });
      },
    });
    assert.deepEqual(await reader.stats("e1"), { pus: 10, documents: 4 });
    assert.equal(reader.service(), "https://new.test/api/v1/");
  });

  it("carries on past one ward that will not load", async () => {
    const done = [];
    const failed = await inTurn([1, 2, 3, 4], async (n) => {
      if (n === 2) throw new Error("no");
      done.push(n);
    }, { atOnce: 2 });
    assert.deepEqual(done.sort(), [1, 3, 4]);
    assert.equal(failed[0].item, 2);
  });
});

describe("the account in Data Bank", () => {
  it("is a vault Data Bank will accept, with a row number on every table", () => {
    assert.match(ACCOUNT.schema, /^bank_[a-z0-9_]+$/);
    for (const table of Object.keys(TABLES)) {
      const statement = createStatement(table);
      assert.match(statement, /^CREATE TABLE IF NOT EXISTS bank_inec_result_datas\./);
      assert.match(statement, /\(_row bigint /);
      for (const [name] of TABLES[table].columns) assert.match(name, /^[a-z][a-z0-9_]*$/);
    }
  });
});

/* A database that records what it was asked and answers from a script. An
   answer may be a function of how many times that question has been asked. */
function recorder(answers = {}) {
  const asked = [];
  const times = {};
  const db = async (text, params) => {
    asked.push({ text, params });
    const hit = Object.keys(answers).find((part) => text.includes(part));
    if (!hit) return [];
    times[hit] = (times[hit] ?? 0) + 1;
    return typeof answers[hit] === "function" ? answers[hit](times[hit]) : answers[hit];
  };
  return { db, asked, wrote: (part) => asked.filter((q) => q.text.includes(part)) };
}

function portal(over = {}) {
  const calls = [];
  const note = (name, value) => async (...args) => (calls.push(name), typeof value === "function" ? value(...args) : value);
  return {
    calls,
    types: note("types", [{ _id: "t-gov", code: "GOV", name: "Governorship election", election_type_id: 2 }]),
    elections: note("elections", [OSUN]),
    stats: note("stats", over.stats ?? { pus: 1, documents: 1 }),
    places: note("places", []),
    ward: note("ward", over.ward ?? [UNIT]),
    recent: note("recent", [UNIT]),
  };
}

const WARDS = [{ ward_id: 1, ref: "w1", name: "A" }, { ward_id: 2, ref: "w2", name: "B" }];

describe("gathering", () => {
  const election = { ...electionRow(OSUN), sheets_up: 1 };

  it("lists without saving", async () => {
    const found = await listing(portal(), { type: "GOV" });
    assert.equal(found.elections[0].election_id, 5008);
  });

  it("reads the wards that are left and closes the read-through", async () => {
    const bank = recorder({
      "count(*)::int AS n FROM bank_inec_result_datas.wards": [{ n: 2 }],
      "w.read_at < e.pass_started_at": (time) => (time === 1 ? WARDS : []),
      RETURNING: [{ fresh: true, up: true }],
    });
    const went = await step(portal(), bank.db, election);
    assert.deepEqual([went.wardsRead, went.unitsSeen, went.sheetsChanged, went.left, went.done], [2, 2, 2, 0, true]);
    assert.equal(bank.wrote("SET gathered_at").length, 1);
  });

  it("leaves a ward that will not load for a later step, and does not call the election whole", async () => {
    const bank = recorder({
      "count(*)::int AS n FROM bank_inec_result_datas.wards": [{ n: 1 }],
      "w.read_at < e.pass_started_at": [WARDS[0]],
    });
    const reader = portal({ ward: () => { throw new Error("timed out"); } });
    const went = await step(reader, bank.db, election);
    assert.deepEqual([went.done, went.stuck, went.failures, went.left], [false, true, 1, 1]);
    assert.equal(bank.wrote("SET gathered_at").length, 0);
    /* Asked for once, not over and over until the budget ran out. */
    assert.equal(reader.calls.filter((call) => call === "ward").length, 1);
  });

  it("stops when its time is up and says how many wards are left", async () => {
    const bank = recorder({
      "count(*)::int AS n FROM bank_inec_result_datas.wards": [{ n: 2 }],
      "w.read_at < e.pass_started_at": WARDS,
    });
    const went = await step(portal(), bank.db, election, { budgetMs: 0 });
    assert.deepEqual([went.wardsRead, went.left, went.done, went.stuck], [0, 2, false, true]);
  });

  it("asks the portal one question when nothing has gone up", async () => {
    const reader = portal();
    const bank = recorder();
    assert.deepEqual(await check(reader, bank.db, election), { moved: false, sheetsUp: 1 });
    assert.deepEqual(reader.calls, ["stats"]);
    assert.equal(bank.wrote(".sheets").length, 0);
  });

  it("reads only the latest uploads when the count has moved", async () => {
    const reader = portal({ stats: { pus: 5, documents: 2 } });
    const bank = recorder({ RETURNING: [{ fresh: false, up: true }], "sheet_url IS NOT NULL": [{ n: 2 }] });
    const result = await check(reader, bank.db, election);
    assert.deepEqual([result.sheetsChanged, result.behind], [1, false]);
    assert.deepEqual(reader.calls, ["stats", "recent"]);
    assert.equal(bank.wrote("SET pass_started_at = now()").length, 0);
  });

  it("begins a read-through when more went up than the latest list shows", async () => {
    const reader = portal({ stats: { pus: 500, documents: 400 } });
    const bank = recorder({ "sheet_url IS NOT NULL": [{ n: 100 }] });
    const result = await check(reader, bank.db, election);
    assert.equal(result.behind, true);
    assert.equal(bank.wrote("SET pass_started_at = now()").length, 1);
    /* Begun, not done: the steps carry it on. */
    assert.ok(!reader.calls.includes("ward"));
  });

  it("gives way when another gatherer has the turn", async () => {
    const reader = portal();
    const bank = recorder({ "WHERE name = 'turn' AND at < now()": [] });
    assert.deepEqual(await turn(reader, bank.db), { busy: true });
    assert.deepEqual(reader.calls, []);
  });
});

describe("reading a sheet into figures", () => {
  const sheet = { election_id: 5008, unit_id: 97559, pu_code: "29/07/04/010", sheet_url: "https://example.test/s.jpg", attempts: 0 };
  const read = {
    ok: true,
    reader: "claude",
    legibility: "clear",
    figures: { votes: { APC: 120, PDP: 98, LP: null } },
    folded: ["BOOT 3"],
    usage: { input_tokens: 5000, output_tokens: 900, cache_read_input_tokens: 100 },
    parsed: {
      unitCode: "29-07-04-010", registered: 600, accredited: 230, rejected: 9, sum: 221, statedValid: 221,
      balanced: true, problems: [], certification: { signature: "present", stamp: "unclear", alteration: "none" },
    },
  };

  it("knows a photograph from a scanned document", () => {
    assert.equal(kindOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
    assert.equal(kindOf(Buffer.from("%PDF-1.7")), "pdf");
    assert.equal(kindOf(Buffer.from("<html>")), null);
  });

  it("keeps every party that carried a figure, and only those", () => {
    const row = readingRow(sheet, read);
    assert.deepEqual(row.party_votes, { APC: 120, PDP: 98, BOOT: 3 });
    assert.deepEqual([row.status, row.balanced, row.valid_votes, row.accredited], ["read", true, 221, 230]);
    assert.deepEqual([row.tokens_in, row.tokens_out, row.attempts], [5100, 900, 1]);
  });

  it("says whether the code on the paper is the unit the portal filed it under", () => {
    assert.equal(readingRow(sheet, read).code_matches, true);
    assert.equal(readingRow({ ...sheet, pu_code: "29/07/04/011" }, read).code_matches, false);
    assert.equal(readingRow(sheet, { ...read, parsed: { ...read.parsed, unitCode: null } }).code_matches, null);
  });

  it("does not call a page with nothing on it a reading", () => {
    const row = readingRow(sheet, { ok: true, reader: "claude", figures: { votes: {} }, parsed: { accredited: null } });
    assert.deepEqual([row.status, row.balanced, row.party_votes], ["unreadable", null, null]);
  });

  it("tells a sheet that is gone from one worth another try", () => {
    assert.equal(readingRow(sheet, { ok: false, gone: true, reason: "gone" }).status, "gone");
    const failed = readingRow({ ...sheet, attempts: 1 }, { ok: false, reason: "the reader is busy" });
    assert.deepEqual([failed.status, failed.attempts], ["failed", 2]);
  });
});

describe("a reader in trouble", () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const fetcher = async () => ({ ok: true, status: 200, arrayBuffer: async () => JPEG });
  const waiting = [1, 2, 3, 4].map((unit) => ({ election_id: 1, unit_id: unit, pu_code: `x${unit}`, sheet_url: `https://example.test/${unit}.jpg`, attempts: 0 }));

  it("stops the batch and writes nothing against the sheets", async () => {
    let asked = 0;
    const bank = recorder({ "FROM bank_inec_result_datas.sheets s": waiting });
    const went = await readSome(bank.db, 1, {
      limit: 4,
      atOnce: 1,
      fetcher,
      readSheet: async () => (asked++, { ok: false, reason: "the reader is busy — it was tried three times" }),
    });
    assert.equal(asked, 1);
    assert.match(went.paused, /busy/);
    assert.deepEqual([went.read, went.failed, went.tried], [0, 0, 0]);
    assert.equal(bank.wrote("INSERT INTO bank_inec_result_datas.readings").length, 0);
  });

  it("still records a sheet the reader simply could not make out", async () => {
    const bank = recorder({ "FROM bank_inec_result_datas.sheets s": waiting.slice(0, 1) });
    const went = await readSome(bank.db, 1, { limit: 1, fetcher, readSheet: async () => ({ ok: false, reason: "no text found in the image" }) });
    assert.deepEqual([went.paused, went.failed], [null, 1]);
    assert.equal(bank.wrote("INSERT INTO bank_inec_result_datas.readings").length, 1);
  });
});

describe("when a sheet went up", () => {
  const SHEET_2023 = "https://irev-results.lon1.digitaloceanspaces.com/1292/elections_prod/1292/state/01/lga/13/ward/01/pu/025/025-1677397507.pdf";

  it("reads the second the commission received a file from the file's own name", () => {
    assert.equal(uploadedAt(SHEET_2023), "2023-02-26T07:45:07.000Z");
    assert.equal(uploadedAt("https://x.test/1292/120690-1678455458.pdf"), "2023-03-10T13:37:38.000Z");
    /* The other two ways the commission's systems named a file. */
    assert.equal(uploadedAt("https://x.test/1292/elections/1292/1677437530-719.pdf"), "2023-02-26T18:52:10.000Z");
    assert.equal(uploadedAt("https://x.test/cached/results/1000/result_162174_1677505713_thumb.jpg"), "2023-02-27T13:48:33.000Z");
    assert.equal(uploadedAt("https://x.test/"), null);
  });

  it("finds no time in a name that carries none, and does not invent one", () => {
    assert.equal(uploadedAt("https://x.test/results/2998/30/616/ddd20592-e900-46d8-82e6-4531a8e44ce7.jpg"), null);
    assert.equal(uploadedAt(null), null);
    /* Ten digits that are not a believable moment: 2001, and the far future. */
    assert.equal(uploadedAt("https://x.test/a-1000000000.pdf"), null);
    assert.equal(uploadedAt("https://x.test/a-9999999999.pdf"), null);
  });

  it("keeps the time on the row, and none where there is no sheet", () => {
    const up = sheetRow(1292, { ...UNIT, document: { url: SHEET_2023, updated_at: "2024-04-10T11:59:48.890Z" } });
    assert.equal(up.uploaded_at, "2023-02-26T07:45:07.000Z");
    assert.equal(sheetRow(1292, { ...UNIT, document: null }).uploaded_at, null);
  });
});

describe("what can be wrong with a sheet", () => {
  it("names every fault once, and offers each as a view of the list", () => {
    assert.deepEqual(FAULT_NAMES, ["missing", "late", "replaced", "gone", "unreadable", "doubt", "wrong_paper", "overvote", "odd_picture"]);
    for (const name of FAULT_NAMES) assert.ok(VIEWS.includes(name), name);
  });

  it("does not call a unit with no voters a missing sheet", () => {
    assert.match(FAULTS.missing(), /sheet_url IS NULL AND NOT s\.no_voters/);
  });

  it("measures late from polling day on a Lagos calendar, and not the day after", () => {
    assert.equal(LATE_DAYS, 2);
    const test = FAULTS.late("$4");
    assert.match(test, /AT TIME ZONE 'Africa\/Lagos'/);
    assert.match(test, /\$4::date\) >= 2/);
  });

  it("keeps the upload time in the sheets table", () => {
    assert.match(createStatement("sheets"), /uploaded_at timestamptz/);
  });
});
