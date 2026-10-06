import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compare, differences, pictureFlags, projectFor } from "../lib/irev/compare.js";
import { deflateSync } from "node:zlib";

import { fetchSheet, fit, pictureRow, readingRow } from "../lib/irev/read.js";
import { analyse, kindOf, metresBetween, packedPageInside, picturesInside } from "../lib/picture.js";
import { figuresFromText } from "../lib/irev/reader.js";
import { buildAccount, depthOf, tidyUnder } from "../lib/irev/verify.js";
import { inside, rings, samePlace, spotMap, whereIs } from "../lib/place.js";

/**
 * What a picture's own file says, where that is, and INEC's sheet against ours.
 *
 * The photograph below is built by hand, field by field, in the layout a
 * camera writes. It is small enough to read and it is the real format: the
 * same reader was run over sheets taken from INEC's portal and returned the
 * device, the time and the coordinates they carry.
 */

/** A camera's note, as bytes. `fields` is [directory][tag, type, value]. */
function note({ make = "EMP2920", model = "EMP2920", taken = "2026:09:19 23:29:16", gps = true } = {}) {
  const chunks = [];
  let size = 8;
  const put = (buffer) => {
    const at = size;
    chunks.push(buffer);
    size += buffer.length;
    return at;
  };
  const text = (value) => Buffer.from(`${value}\0`, "latin1");
  const rationals = (values) => {
    const out = Buffer.alloc(values.length * 8);
    values.forEach((value, index) => {
      out.writeUInt32LE(Math.round(value * 1000), index * 8);
      out.writeUInt32LE(1000, index * 8 + 4);
    });
    return out;
  };

  /* Values first, so the directories can point at them. */
  const at = {
    make: put(text(make)),
    model: put(text(model)),
    taken: put(text(taken)),
    lat: put(rationals([11, 28, 54.65])),
    lon: put(rationals([9, 55, 9.64])),
    day: put(text("2026:09:19")),
    clock: put(rationals([22, 29, 16])),
  };

  const directory = (entries) => {
    const out = Buffer.alloc(2 + entries.length * 12 + 4);
    out.writeUInt16LE(entries.length, 0);
    entries.forEach(([tag, type, count, value], index) => {
      const here = 2 + index * 12;
      out.writeUInt16LE(tag, here);
      out.writeUInt16LE(type, here + 2);
      out.writeUInt32LE(count, here + 4);
      if (typeof value === "string") out.write(value, here + 8, "latin1");
      else out.writeUInt32LE(value, here + 8);
    });
    return out;
  };

  const detail = put(directory([[0x9003, 2, taken.length + 1, at.taken]]));
  const place = gps
    ? put(directory([
        [1, 2, 2, "N\0"],
        [2, 5, 3, at.lat],
        [3, 2, 2, "E\0"],
        [4, 5, 3, at.lon],
        [7, 5, 3, at.clock],
        [0x1d, 2, 11, at.day],
      ]))
    : null;
  const main = put(directory([
    [0x010f, 2, make.length + 1, at.make],
    [0x0110, 2, model.length + 1, at.model],
    [0x8769, 4, 1, detail],
    ...(gps ? [[0x8825, 4, 1, place]] : []),
  ]));

  const head = Buffer.alloc(8);
  head.write("II", 0, "latin1");
  head.writeUInt16LE(42, 2);
  head.writeUInt32LE(main, 4);
  return Buffer.concat([head, ...chunks]);
}

/** A photograph carrying that note, 3072 × 4096. */
function photograph(options) {
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), note(options)]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(body.length + 2, 2);
  const frame = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x10, 0x00, 0x0c, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, body, frame, Buffer.from([0xff, 0xd9])]);
}

describe("the picture analyser", () => {
  it("reads when, where and with what from a photograph", () => {
    const found = analyse(photograph());
    assert.equal(found.kind, "jpeg");
    assert.deepEqual([found.width, found.height], [3072, 4096]);
    assert.deepEqual([found.camera.make, found.camera.model], ["EMP2920", "EMP2920"]);
    assert.equal(found.taken.at, "2026-09-19 23:29:16");
    assert.ok(Math.abs(found.place.latitude - 11.481847) < 0.0001);
    assert.ok(Math.abs(found.place.longitude - 9.919344) < 0.0001);
    assert.equal(found.place.satelliteTime, "2026-09-19 22:29:16");
    assert.match(found.fingerprint, /^[0-9a-f]{64}$/);
  });

  it("says so in words when the device did not record where it was", () => {
    const found = analyse(photograph({ gps: false }));
    assert.equal(found.place, null);
    assert.match(found.notes.join(" "), /did not record where it was/);
  });

  it("explains a picture with no details instead of showing nothing", () => {
    const bare = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
    const found = analyse(bare);
    assert.equal(found.camera, null);
    assert.match(found.notes[0], /WhatsApp/);
  });

  it("finds the photograph inside a scanned document, and the document's own record", () => {
    const picture = photograph({ make: "TECNO MOBILE LIMITED", model: "TECNO BC2c", taken: "2023:02:26 04:06:43", gps: false });
    const pdf = Buffer.concat([
      Buffer.from("%PDF-1.3\n1 0 obj\n<< /Type /XObject /Filter /DCTDecode >>\nstream\n", "latin1"),
      picture,
      Buffer.from("\nendstream\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n3 0 obj\n<< /Producer (https://imagemagick.org) /CreationDate (D:20230226032917) >>\nendobj\n", "latin1"),
    ]);

    assert.equal(kindOf(pdf), "pdf");
    assert.equal(picturesInside(pdf).length, 1);

    const found = analyse(pdf);
    assert.equal(found.camera.model, "TECNO BC2c");
    assert.equal(found.taken.at, "2023-02-26 04:06:43");
    assert.deepEqual([found.document.pages, found.document.savedWith, found.document.created.at], [1, "https://imagemagick.org", "2023-02-26 03:29:17"]);
  });

  it("reads the note from only the head of a file", () => {
    const whole = Buffer.concat([Buffer.from("%PDF-1.3\nstream\n", "latin1"), photograph(), Buffer.alloc(5000)]);
    assert.equal(analyse(whole.subarray(0, 700)).camera.model, "EMP2920");
  });

  it("survives a file that lies about its own layout", () => {
    const broken = photograph();
    broken.writeUInt32LE(0xfffffff0, 2 + 4 + 6 + 4);
    assert.doesNotThrow(() => analyse(broken));
    assert.equal(analyse(Buffer.from("hello")).kind, null);
    assert.equal(analyse(Buffer.alloc(0)).kind, null);
  });

  it("measures the ground between two points", () => {
    const metres = metresBetween({ latitude: 6.5244, longitude: 3.3792 }, { latitude: 9.0765, longitude: 7.3986 });
    assert.ok(metres > 520000 && metres < 540000);
    assert.equal(metresBetween({ latitude: 1 }, null), null);
  });
});

describe("where a point is", () => {
  it("knows inside from outside, and a hole from the shape around it", () => {
    const square = "M0 0L10 0L10 10L0 10Z";
    assert.equal(inside(5, 5, square), true);
    assert.equal(inside(15, 5, square), false);
    assert.equal(inside(5, 5, `${square}M4 4L6 4L6 6L4 6Z`), false);
    assert.equal(rings(square).length, 1);
  });

  it("names the state and local government from the map's own boundaries", async () => {
    assert.deepEqual(await whereIs(11.481847, 9.919345), { state: "Bauchi", stateCode: "BAU", lga: "Shira" });
    assert.equal((await whereIs(6.00941, 7.08994)).state, "Anambra");
    assert.equal(await whereIs(0, 0), null);
    assert.equal(await whereIs(null, 3), null);
  });

  it("treats two spellings of one place as the same place", () => {
    assert.equal(samePlace("BAUCHI", "Bauchi"), true);
    assert.equal(samePlace("FEDERAL CAPITAL TERRITORY", "FCT"), true);
    assert.equal(samePlace("ANAMBRA", "Nasarawa"), false);
    assert.equal(samePlace(null, "Lagos"), false);
  });
});

describe("a sheet's picture details", () => {
  const sheet = { election_id: 2919, unit_id: 9120, pu_code: "04/05/03/005", sheet_url: "https://example.test/s.jpg" };

  it("flags a sheet photographed in another state, days after the poll", async () => {
    const row = await pictureRow(sheet, { ok: true, bytes: photograph({ taken: "2025:11:22 07:35:26" }) }, {
      heldOn: "2026-09-05",
      state: "ANAMBRA",
    });
    assert.deepEqual([row.status, row.device_model, row.taken_state, row.taken_lga, row.place_ok], ["examined", "EMP2920", "Bauchi", "Shira", false]);
    /* Counted from the satellites' day, in Lagos time. */
    assert.equal(row.days_from_poll, 14);
    assert.equal(pictureFlags(row, { heldOn: "2026-09-05" }).length, 2);
  });

  it("finds nothing to say about a sheet photographed where and when it should be", async () => {
    const row = await pictureRow(sheet, { ok: true, bytes: photograph() }, { heldOn: "2026-09-19", state: "BAUCHI" });
    assert.deepEqual([row.place_ok, row.days_from_poll], [true, 0]);
    assert.deepEqual(pictureFlags(row, { heldOn: "2026-09-19" }), []);
  });

  it("does not call a missing place a wrong place", async () => {
    const row = await pictureRow(sheet, { ok: true, bytes: photograph({ gps: false }) }, { heldOn: "2026-09-19", state: "BAUCHI" });
    assert.equal(row.place_ok, null);
    assert.equal((await pictureRow(sheet, { ok: false, gone: true, reason: "gone" })).status, "gone");
  });
});

describe("INEC's sheet against our return", () => {
  const ours = { unitCode: "05/16/01/014", registered: 157, accredited: 73, rejected: 3, votes: { APC: 28, APM: 39, PRP: 6, OTH: 0 } };
  const theirs = { unit_id: 15892, pu_code: "05/16/01/014", status: "read", balanced: true, code_matches: true, registered: 157, accredited: 73, rejected: 3, party_votes: { APC: 28, APM: 39, PRP: 6, APP: 0, ZLP: 0 } };

  it("finds nothing where the two say the same", () => {
    assert.deepEqual(differences(ours, theirs), []);
    const held = compare([ours], [theirs]);
    assert.deepEqual([held.both, held.agree, held.differ.length], [1, 1, 0]);
  });

  it("names every figure that differs, the largest gap first", () => {
    const gaps = differences({ ...ours, accredited: 74, votes: { ...ours.votes, APC: 128 } }, theirs);
    assert.deepEqual(gaps.map((gap) => gap.what), ["APC", "Accredited"]);
    assert.deepEqual(gaps[0], { what: "APC", ours: 128, inec: 28 });
  });

  it("counts a party one side left out as nought on that side", () => {
    assert.deepEqual(differences(ours, { ...theirs, party_votes: { ...theirs.party_votes, ZLP: 4 } }), [{ what: "ZLP", ours: 0, inec: 4 }]);
  });

  it("does not hold our return against a reading that does not add up", () => {
    const held = compare([{ ...ours, votes: { APC: 1 } }], [{ ...theirs, balanced: false }]);
    assert.deepEqual([held.unsure, held.differ.length], [1, 0]);
  });

  it("counts what only one side holds", () => {
    const held = compare(
      [ours, { ...ours, unitCode: "05/16/01/015" }],
      [theirs, { ...theirs, pu_code: "05/16/01/099" }, { ...theirs, pu_code: "05/16/01/098", status: "unreadable" }]
    );
    assert.deepEqual([held.ours, held.both, held.onlyOurs, held.onlyInec], [2, 1, 1, 1]);
  });
});

describe("the spot on the map", () => {
  it("draws the state by local government, with the point inside the one it names", async () => {
    const map = await spotMap(11.481847, 9.919345, { others: [{ latitude: 11.563, longitude: 9.98 }, { latitude: 6.5, longitude: 3.3 }] });
    assert.deepEqual([map.state, map.lga, map.shapes.length], ["Bauchi", "Shira", 20]);
    assert.deepEqual(map.shapes.filter((shape) => shape.here).map((shape) => shape.name), ["Shira"]);
    const [x, y, width, height] = map.box;
    assert.ok(map.pin[0] > x && map.pin[0] < x + width && map.pin[1] > y && map.pin[1] < y + height);
    /* A point in Lagos is not drawn on a map of Bauchi. */
    assert.equal(map.others.length, 1);
    assert.equal(await spotMap(0, 0), null);
  });
});

describe("the basic reader, held to the sheet's own arithmetic", () => {
  /* What the optical reader returned for two real sheets from the portal. */
  const CLEAR = [
    "1. Number of Voters on the Register\t157",
    "2. Number of Accredited Voters",
    "73",
    "6. Number of Rejected Ballots",
    "7. Number of Total Valid Votes (Total Valid Votes cast for all parties)",
    "PARTY\tIN FIGURES\tIN WORDS\tPOLLING AGENT",
    "APC\t28\tTWenty EIGHT",
    "APM\t39\tThirtY NINE\tDALEAA",
    "APP\tZERO",
    "4\tPRP\t06\tSIx",
    "ZLP\tZERO",
    "TOTAL VALID VOTES\t73\tSEVENT Three",
  ].join("\n");

  it("takes figures and words together and accepts a sheet that sums to its own total", () => {
    const read = figuresFromText(CLEAR);
    assert.deepEqual(read.figures.votes, { APC: 28, APM: 39, APP: 0, PRP: 6, ZLP: 0 });
    assert.deepEqual([read.parsed.registered, read.parsed.accredited, read.parsed.statedValid, read.parsed.sum], [157, 73, 73, 73]);
    assert.equal(read.parsed.balanced, true);
    assert.deepEqual(read.parsed.problems, []);
  });

  it("does not accept a sheet where a row went missing", () => {
    const read = figuresFromText(CLEAR.replace("APM\t39\tThirtY NINE\tDALEAA\n", ""));
    assert.equal(read.parsed.balanced, false);
    assert.match(read.parsed.problems[0], /add up to 34, and the sheet's own total says 73/);
  });

  it("does not accept figures it has no total to check against", () => {
    const read = figuresFromText("5\t\u0410\u0420\u0421\t10\tten\n4\tADC\tone");
    /* Letters returned from another alphabet are still the party they look like. */
    assert.deepEqual(read.figures.votes, { APC: 10, ADC: 1 });
    assert.equal(read.parsed.balanced, false);
    assert.match(read.parsed.problems[0], /cannot be checked/);
  });

  it("says so when it could make out nothing", () => {
    assert.match(figuresFromText("INDEPENDENT NATIONAL ELECTORAL COMMISSION").parsed.problems[0], /no party/);
  });
});

describe("which of our projects an INEC election belongs with", () => {
  const states = [{ name: "Osun", code: "OSU" }, { name: "Ekiti", code: "EKI" }];
  const projects = [
    { id: "p27", title: "2027 Presidential Election", kind: "PRESIDENTIAL", votesOn: new Date("2027-02-20"), scopeStates: [] },
    { id: "p23", title: "2023 Presidential Election", kind: "PRESIDENTIAL", votesOn: null, isDemo: true, scopeStates: [] },
    { id: "osun", title: "Osun Governorship 2026", kind: "GOVERNORSHIP", votesOn: new Date("2026-08-15"), scopeStates: ["OSU"] },
  ];

  it("ties an election to the one project of the same contest, year and state", () => {
    assert.equal(projectFor({ type_code: "GOV", year: 2026, state_name: "OSUN" }, projects, states)?.id, "osun");
    assert.equal(projectFor({ type_code: "PRES", year: 2023, state_name: null }, projects, states)?.id, "p23");
    assert.equal(projectFor({ type_code: "PRES", year: 2027, state_name: null }, projects, states)?.id, "p27");
  });

  it("ties nothing where no project fits, or more than one does", () => {
    assert.equal(projectFor({ type_code: "GOV", year: 2026, state_name: "EKITI" }, projects, states), null);
    assert.equal(projectFor({ type_code: "GOV", year: 2022, state_name: "OSUN" }, projects, states), null);
    assert.equal(projectFor({ type_code: "CHAIRMAN", year: 2026, state_name: "OSUN" }, projects, states), null);
    const twice = [...projects, { ...projects[2], id: "osun-2" }];
    assert.equal(projectFor({ type_code: "GOV", year: 2026, state_name: "OSUN" }, twice, states), null);
  });
});

describe("a scanned document whose page was stored packed", () => {
  /* A 300 × 240 grey page, packed the way INEC's 2023 documents hold theirs. */
  const pixels = Buffer.alloc(300 * 240 * 3, 200);
  const packed = Buffer.concat([
    Buffer.from("%PDF-1.3\n8 0 obj\n<<\n/Type /XObject\n/Subtype /Image\n/Filter [ /FlateDecode ]\n/Width 300\n/Height 240\n/ColorSpace 10 0 R\n/BitsPerComponent 8\n>>\nstream\n", "latin1"),
    deflateSync(pixels),
    Buffer.from("\nendstream\nendobj\n17 0 obj\n<< /Producer (https://imagemagick.org) /CreationDate (D:20230318183637) >>\nendobj\n", "latin1"),
  ]);

  it("is unpacked into plain pixels", () => {
    const page = packedPageInside(packed);
    assert.deepEqual([page.width, page.height, page.channels, page.data.length], [300, 240, 3, pixels.length]);
    assert.equal(packedPageInside(Buffer.from("%PDF-1.3 nothing here")), null);
  });

  it("comes out of fitting as a photograph any reader takes", async () => {
    const fitted = await fit(packed, "pdf");
    assert.equal(fitted.ok, true);
    assert.equal(kindOf(fitted.bytes), "jpeg");
    assert.equal(fitted.document, undefined);
  });

  it("gives the time INEC's system received it, where the camera's own time was removed", async () => {
    const sheet = { election_id: 2772, unit_id: 1, pu_code: "24/01/04/024", sheet_url: "https://example.test/s.pdf" };
    /* The storage's own date is the day the files were moved, years later. */
    const row = await pictureRow(sheet, { ok: true, bytes: packed, storedAt: "2024-11-30T16:37:54.000Z" }, { heldOn: "2023-03-18", state: "LAGOS" });
    assert.deepEqual([row.taken_at, row.device_model, row.stored_at], [null, null, "2023-03-18T18:36:37Z"]);
    assert.match(row.notes, /camera's details removed/);
  });

  it("does not believe a storage date years from polling day", async () => {
    const sheet = { election_id: 1, unit_id: 2, pu_code: "x", sheet_url: "u" };
    const bare = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
    assert.equal((await pictureRow(sheet, { ok: true, bytes: bare, storedAt: "2024-11-30T16:37:54.000Z" }, { heldOn: "2024-09-21" })).stored_at, null);
    assert.equal((await pictureRow(sheet, { ok: true, bytes: bare, storedAt: "2024-09-21T19:00:00.000Z" }, { heldOn: "2024-09-21" })).stored_at, "2024-09-21T19:00:00.000Z");
  });

  it("does not keep trying a sheet the reader in use can never open", () => {
    const sheet = { election_id: 1, unit_id: 3, pu_code: "x", sheet_url: "u", attempts: 0 };
    assert.equal(readingRow(sheet, { ok: false, unreadable: true, reason: "a document" }).status, "unreadable");
    assert.equal(readingRow(sheet, { ok: false, reason: "busy" }).status, "failed");
  });
});

describe("the verification account, added up by place", () => {
  const total = (key, over = {}) => ({
    key, lga_name: "SHIRA", ward_name: "ANDUBUN", unit_name: "KOFAR FADA", unit_id: 1,
    units: 10, sheets: 8, read: 6, sound: 5, doubt: 1, odd_picture: 0, replaced: 0, overvote: 0, wrong_paper: 0,
    registered: 900, accredited: 400, rejected: 10, valid: 390, ...over,
  });
  const unit = (code, votes, over = {}) => ({
    unit_id: Number(code.slice(-3)), pu_code: code, unit_name: `Unit ${code.slice(-3)}`, sheet_up: true,
    status: "read", balanced: true, code_matches: true, accredited: 100, rejected: 0, party_votes: votes, ...over,
  });

  it("knows how deep a place is, and refuses a code that is not one", () => {
    assert.deepEqual([depthOf(""), depthOf("05"), depthOf("05/16"), depthOf("05/16/01")], [0, 1, 2, 3]);
    assert.equal(tidyUnder("05/16/01/014"), "05/16/01");
    assert.equal(tidyUnder("99"), "");
    assert.equal(tidyUnder("5; drop table"), "");
  });

  it("adds INEC's sheets up, and measures the gap only on the units both hold", () => {
    const account = buildAccount({
      under: "",
      totals: [total("05"), total("24", { sound: 0, read: 0, doubt: 0, valid: 0, accredited: 0 })],
      votes: [{ key: "05", party: "APC", votes: 300 }, { key: "05", party: "PDP", votes: 90 }],
      ourRows: [
        { unitCode: "05/16/01/001", accredited: 100, rejected: 0, votes: { APC: 60, PDP: 40 } },
        { unitCode: "05/16/01/002", accredited: 100, rejected: 0, votes: { APC: 90, PDP: 10 } },
        { unitCode: "05/16/01/003", accredited: 100, rejected: 0, votes: { APC: 50, PDP: 50 } },
      ],
      held: [
        unit("05/16/01/001", { APC: 60, PDP: 40 }),
        unit("05/16/01/002", { APC: 70, PDP: 30 }),
        unit("05/16/01/003", { APC: 1 }, { balanced: false }),
      ],
    });

    const bauchi = account.children.find((place) => place.key === "05");
    assert.deepEqual([bauchi.name, bauchi.stateCode, bauchi.inec.votes.APC], ["Bauchi", "BAU", 300]);
    assert.deepEqual(bauchi.shared, { units: 3, agree: 1, differ: 1, unsure: 1, noSheet: 0, inec: { APC: 130, PDP: 70 }, ours: { APC: 150, PDP: 50 } });
    /* All three of our returns are counted as ours; only two are compared. */
    assert.deepEqual([bauchi.ours.returns, bauchi.ours.votes.APC], [3, 200]);
    assert.equal(bauchi.status, "irregular");
    assert.equal(account.children.find((place) => place.key === "24").status, "waiting");
    assert.deepEqual([account.whole.units, account.whole.inec.votes.APC, account.whole.shared.differ], [20, 300, 1]);
  });

  it("names each irregularity in words, the worst first", () => {
    const account = buildAccount({
      under: "05/16/01",
      totals: [total("05/16/01/001"), total("05/16/01/002"), total("05/16/01/009", { sheets: 0, read: 0, sound: 0, doubt: 0 })],
      flags: [
        { unit_id: 2, pu_code: "05/16/01/002", unit_name: "B", place_ok: false, taken_lga: "Karu", taken_state: "Nasarawa", days_from_poll: 14, sound: true, valid_votes: 120, accredited: 100, earlier_sheets: 1 },
      ],
      ourRows: [
        { unitCode: "05/16/01/001", accredited: 100, rejected: 0, votes: { APC: 99 } },
        { unitCode: "05/16/01/009", votes: { APC: 5 } },
      ],
      held: [unit("05/16/01/001", { APC: 60 }), unit("05/16/01/009", null, { sheet_up: false, status: null })],
    });

    assert.equal(account.level, "unit");
    assert.deepEqual(account.flags.map((flag) => flag.unitCode), ["05/16/01/001", "05/16/01/002", "05/16/01/009"]);
    assert.match(account.flags[0].what[0], /differs from our return: APC 99 ours, 60 INEC/);
    assert.deepEqual(account.flags[1].what, [
      "photographed in Karu, Nasarawa, not where the unit is",
      "photographed 14 days after polling day",
      "120 valid votes from 100 accredited voters",
      "the sheet was replaced 1 time(s)",
    ]);
    assert.match(account.flags[2].what[0], /INEC has published no sheet/);
    assert.equal(account.flagged, 3);
  });

  it("shows what INEC announced only at the level it announced it", () => {
    const account = buildAccount({
      under: "",
      totals: [total("05"), total("24")],
      announced: [
        { level: "STATE", key: "05", votes: { APC: 4000, PDP: 3000 }, accredited: 7100 },
        /* A local government's figure is not the state's, whatever its key begins with. */
        { level: "LGA", key: "24/01", votes: { APC: 9 } },
      ],
    });
    assert.deepEqual(account.children[0].announced.votes, { APC: 4000, PDP: 3000 });
    assert.equal(account.children[1].announced, null);
    assert.deepEqual([account.whole.announced.places, account.whole.announced.votes.APC], [1, 4000]);
  });
});

describe("a sheet that could not be fetched", () => {
  it("is not written off because its address would not resolve for a moment", async () => {
    const fails = async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); };
    const got = await fetchSheet("https://example.test/s.pdf", { fetcher: fails });
    assert.equal(got.ok, false);
    assert.equal(got.gone, undefined);
    assert.equal(readingRow({ election_id: 1, unit_id: 1, pu_code: "x", sheet_url: "u" }, got).status, "failed");
  });

  it("is written off when the storage itself says it is not there", async () => {
    const got = await fetchSheet("https://example.test/s.pdf", { fetcher: async () => ({ ok: false, status: 404 }) });
    assert.equal(got.gone, true);
  });
});
