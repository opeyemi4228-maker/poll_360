import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditSheet, EC8A_BOXES, validateReturn } from "../lib/results.js";
import { ballotFor, countedParties } from "../lib/races.js";
import { partyById, printedAs, scanList } from "../lib/party-register.js";
import { parseUnitCode } from "../lib/units.js";
import { parseSheet } from "../lib/sheet-vision.js";

const sheet = (lines) => parseSheet(lines.join("\n"));

/**
 * Form EC8A, from a real sheet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Every figure below is transcribed from an actual INEC Statement of Result
 *  of Poll: 2026 Osun State Governorship Election, S/N 0000611, Idiomo Apena
 *  Compd., Ede North, Olusokun ward, 15 August 2026.
 *
 *  It is used as a fixture rather than an invented one for a specific reason:
 *  the sheet does not add up. Issued less unused is 557 and spoiled plus
 *  rejected plus valid is 557, but box #8 says 556 — the presiding officer
 *  wrote the accredited figure into the used-papers box and lost the spoiled
 *  ballot. A fixture somebody made up would balance, and the one behaviour
 *  most worth testing here is what happens when a real sheet does not.
 * ══════════════════════════════════════════════════════════════════════════
 */
const OSUN = {
  formSerial: "0000611",
  unitCode: "29/07/04/010",
  sheetDate: "15-08-2026",
  contested: true,
  registered: 974, //     #1
  accredited: 556, //     #2
  ballotsIssued: 974, //  #3
  unusedBallots: 417, //  #4
  spoiled: 1, //          #5
  rejected: 1, //         #6
  statedValid: 555, //    #7
  usedBallots: 556, //    #8  ← wrong on the paper
  votes: {
    ACCORD: 417,
    AA: 0, AAC: 0, ADC: 0, ADP: 0,
    APC: 138,
    APGA: 0, APM: 0, APP: 0, BP: 0,
    NNPP: 0, PRP: 0, SDP: 0, YPP: 0, ZLP: 0,
  },
};

describe("the sheet's own arithmetic", () => {
  it("finds the error a real presiding officer made", () => {
    const { balances, findings } = auditSheet(OSUN);

    assert.equal(balances, false, "a sheet that does not add up was reported as balancing");
    assert.equal(findings.length, 2, `expected both used-total identities to fail: ${JSON.stringify(findings)}`);
    /* Both fail by exactly one, which is the spoiled ballot. */
    for (const finding of findings) assert.equal(finding.off, 1);
  });

  it("names the one box every failing sum has in common", () => {
    /* This is the whole value of the feature. "The arithmetic is wrong" sends
       somebody back to redo it; "box #8 says 556 and the rest of the page says
       557" is a sentence they can act on without re-adding anything. */
    const { culprit } = auditSheet(OSUN);
    assert.equal(culprit, "#8");
    assert.equal(EC8A_BOXES[culprit], "Total used ballot papers");
  });

  it("balances once that one box is corrected", () => {
    const corrected = auditSheet({ ...OSUN, usedBallots: 557 });
    assert.equal(corrected.balances, true, JSON.stringify(corrected.findings));
    assert.equal(corrected.culprit, null);
  });

  it("agrees with the party rows and the accredited count as written", () => {
    /* Everything except box #8 is internally consistent on this sheet, and the
       audit must not manufacture findings out of the parts that are right:
       417 + 138 = 555 = #7, and 1 rejected + 555 valid = 556 accredited. */
    const findings = auditSheet(OSUN).findings.map((f) => f.boxes.join("+"));
    assert.ok(!findings.includes("#7+parties"), "the party rows were reported as disagreeing");
    assert.ok(!findings.includes("#2+#6+#7"), "the accredited count was reported as disagreeing");
  });

  it("blames nobody when a box was never captured", () => {
    /* A blank is not a zero. Every identity that touches an uncaptured box
       withdraws rather than failing against a figure nobody wrote — otherwise
       a half-filled form accuses the agent of an error they did not make. */
    const partial = auditSheet({ ...OSUN, usedBallots: null, spoiled: null });
    assert.deepEqual(partial.findings, []);
    assert.equal(partial.balances, true);
  });

  it("still refuses figures that are impossible rather than merely inconsistent", () => {
    const impossible = auditSheet({ ...OSUN, accredited: 2000 });
    const says = impossible.findings.map((f) => f.says);
    assert.ok(
      says.some((line) => /register/i.test(line)),
      `expected an accredited-over-register finding, got ${JSON.stringify(says)}`
    );
  });

  it("never blocks the return, however badly the sheet fails", () => {
    /* The arithmetic that failed is the presiding officer's. An agent who
       transcribed it faithfully must be able to file it — a product that
       refuses here teaches them to type figures that reconcile instead of
       figures that are written, which destroys the only evidence there was. */
    const check = validateReturn({
      registered: OSUN.registered,
      accredited: OSUN.accredited,
      rejected: OSUN.rejected,
      votes: OSUN.votes,
    });
    assert.equal(check.ok, true, `a faithfully transcribed sheet was refused: ${JSON.stringify(check.errors)}`);
    assert.equal(check.cast, 555);
  });
});

describe("the paper this sheet came off", () => {
  it("has a box for every party printed on it", () => {
    const boxes = new Set(ballotFor("GOVERNORSHIP").map((party) => party.id));
    for (const id of Object.keys(OSUN.votes)) {
      assert.ok(boxes.has(id), `${id} is on the sheet and has no box on the form`);
    }
  });

  it("prints Accord as a bare A, and stores it as ACCORD", () => {
    /* The one party whose printed code is not its id. Getting this wrong puts
       417 votes in the bucket on the sheet this product was built around. */
    assert.equal(printedAs("ACCORD"), "A");
    assert.equal(partyById("ACCORD").name, "Accord");
  });

  it("gives the same paper to every position", () => {
    const gov = countedParties("GOVERNORSHIP").map((p) => p.id);
    const pres = countedParties("PRESIDENTIAL").map((p) => p.id);
    assert.deepEqual(pres, gov, "the presidential paper differs from the governorship one");
    assert.ok(gov.includes("PDP") && gov.includes("LP"), "PDP and LP are not on the ballot");
  });

  it("holds only the four to 'must be on every sheet'", () => {
    /* This Osun paper carries neither PDP nor LP. A reader that treats every
       party as required calls an ordinary sheet a failed reading — see
       tests/sheets.test.js. */
    const required = scanList().filter((party) => !party.optional).map((party) => party.id);
    assert.deepEqual(required.sort(), ["APC", "LP", "NNPP", "PDP"]);
  });

  it("reads the polling unit code off the sheet's four boxes", () => {
    /* State 29, LGA 07, RA 04, PU 010 — the four codes printed down the left
       of the form, which are what the count keys every figure to. */
    const place = parseUnitCode(OSUN.unitCode);
    assert.ok(place, "the unit code on a real sheet did not parse");
    assert.equal(place.stateNumber, "29");
    /* The sheet says OSUN beside code 29, and so does the product. */
    assert.equal(place.stateName, "Osun");
    assert.equal(place.wardCode, "29/07/04");
    assert.equal(place.unitNo, "010");
  });
});

describe("reading the whole form off a photograph", () => {
  /* Shaped like what an optical reader actually emits for this sheet: the
     numbered boxes as label-then-figure lines, in the order they are printed. */
  const scanned = [
    "INDEPENDENT NATIONAL ELECTORAL COMMISSION",
    "2026 OSUN STATE GOVERNORSHIP ELECTION",
    "STATEMENT OF RESULT OF POLL FROM POLLING UNIT",
    "S/N ...... 0000611",
    "State OSUN Code 2 9",
    "Local Government Area EDE NORTH Code 0 7",
    "Registration Area OLUSOKUN Code 0 4",
    "POLLING UNIT: 29/07/04/010",
    "1 Number of Voters on the Register 974",
    "2 Number of Accredited Voters 556",
    "3 Number of Ballot Papers Issued to the Polling Unit 974",
    "4 Number of Unused Ballot Papers 417",
    "5 Number of Spoiled Ballot Papers 1",
    "6 Number of Rejected Ballots 1",
    "7 Number of Total Valid Votes (Total Valid Votes cast for all parties) 555",
    "8 Total Number of Used Ballot Papers (Total of #5 + #6 + #7 above) 556",
    "1 A 417",
    "6 APC 138",
    "TOTAL VALID VOTES 555",
    "Name of Presiding Officer HASSAN HABEEB",
    "15-08-2026",
  ];

  it("reads all eight numbered boxes, not three", () => {
    const read = sheet(scanned);

    assert.equal(read.registered, 974, "box #1");
    assert.equal(read.accredited, 556, "box #2");
    assert.equal(read.ballotsIssued, 974, "box #3");
    assert.equal(read.unusedBallots, 417, "box #4");
    assert.equal(read.spoiled, 1, "box #5");
    assert.equal(read.rejected, 1, "box #6");
    assert.equal(read.statedValid, 555, "box #7");
    assert.equal(read.usedBallots, 556, "box #8");
  });

  it("does not read box #4 as box #8", () => {
    /* "UNUSED BALLOT PAPERS" contains "used ballot papers" as a substring, and
       box #4 is printed above box #8 on every form. Without a word boundary on
       the pattern the used total reads 417 instead of 556 — which turns a
       sheet that fails one identity into a sheet that fails a different one,
       and sends a desk looking at the wrong box entirely. */
    const read = sheet(scanned);
    assert.notEqual(read.usedBallots, read.unusedBallots, "the unused box was read as the used total");
    assert.equal(read.usedBallots, 556);
  });

  it("picks the serial number and the date off the paper", () => {
    const read = sheet(scanned);
    assert.equal(read.formSerial, "0000611");
    assert.equal(read.sheetDate, "15-08-2026");
  });

  it("refuses to guess the certification an optical reader cannot see", () => {
    /* The officer strikes one of "CONTESTED / NOT CONTESTED" out. OCR reads
       both words whichever was struck, so this must stay null rather than
       become a coin flip — a guess here records a certification nobody made. */
    assert.equal(sheet(scanned).contested, null);
  });

  it("hands the desk the same finding the model reader would", () => {
    const read = sheet(scanned);
    const { culprit, findings } = auditSheet(read);
    assert.equal(culprit, "#8", JSON.stringify(findings));
  });
});
