import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkReason, checkRows, diffList, parseCsv, planCommit, toRecords } from "../lib/assignments.js";

/**
 * The party's list: reading it, checking it against INEC's list, and working
 * out what committing it would change. Storage is not touched here.
 */
const PLACES = new Set(["01", "01/01", "01/01/01", "01/01/01/005", "01/01/01/006", "01/01/01/007", "01/01/02", "01/01/02/001", "02"]);
const exists = (code) => PLACES.has(code);
const HEAD = "role,full_name,phone,state_code,lga_code,ward_code,pu_code,assignment_type,party_ref";
const read = (lines) => checkRows(toRecords(parseCsv([HEAD, ...lines].join("\n"))).records, { exists });
const empty = { people: [], assignments: [] };

describe("reading the party list", () => {
  it("reads quoted cells and a row with several polling units", () => {
    const { clean, errors } = read(['AGENT,"Okafor, Ngozi",0803 000 0001,1,1,1,005;006,,P-1']);
    assert.equal(errors.length, 0);
    assert.equal(clean[0].fullName, "Okafor, Ngozi");
    assert.equal(clean[0].phone, "2348030000001");
    assert.deepEqual(clean[0].targets.map((target) => target.code), ["01/01/01/005", "01/01/01/006"]);
    assert.equal(clean[0].targets[0].role, "PRIMARY");
  });

  it("names the missing columns", () => {
    assert.deepEqual(toRecords(parseCsv("role,full_name\nAGENT,A")).missing, ["phone", "state_code", "lga_code", "ward_code"]);
  });

  it("refuses a place INEC does not list, and a hierarchy that does not agree, with the reason", () => {
    const { errors } = read([
      "AGENT,A,08030000001,01,01,09,001,,",
      "AGENT,B,08030000002,01,01,01,999,,",
      "AGENT,C,08030000003,01,01,01,01/01/02/001,,",
      "AGENT,D,12345,01,01,01,005,,",
      "AGENT,E,08030000005,01,01,01,,,",
      "CLERK,F,08030000006,01,01,01,005,,",
    ]);
    assert.equal(errors.length, 6);
    assert.match(errors[0].error, /Ward/);
    assert.match(errors[1].error, /no polling unit/);
    assert.match(errors[2].error, /not in the ward/);
    assert.match(errors[3].error, /phone/);
    assert.match(errors[4].error, /at least one polling unit/);
    assert.match(errors[5].error, /Role/);
  });

  it("a ward coordinator is assigned to the ward and needs no polling unit", () => {
    const { clean } = read(["WARD_COORDINATOR,Musa,08030000009,01,01,01,,,"]);
    assert.deepEqual(clean[0].targets, [{ type: "WARD", code: "01/01/01", role: "COORDINATOR" }]);
  });
});

describe("what a list would change", () => {
  it("new people and new assignments on an empty roster", () => {
    const { clean } = read(["AGENT,A,08030000001,01,01,01,005,,P-1", "WARD_COORDINATOR,B,08030000002,01,01,01,,,P-2"]);
    const diff = diffList(clean, empty);
    assert.equal(diff.newPeople.length, 2);
    assert.equal(diff.newAssignments.length, 2);
    assert.equal(diff.conflicts.length, 0);
  });

  it("two primaries for one polling unit is a conflict, and the second is left out", () => {
    const { clean } = read(["AGENT,A,08030000001,01,01,01,005,,P-1", "AGENT,B,08030000002,01,01,01,005,,P-2"]);
    const diff = diffList(clean, empty);
    assert.equal(diff.conflicts[0].kind, "TWO_PRIMARY");
    assert.equal(diff.newAssignments.length, 1);
  });

  it("one phone number for two people is a conflict, and the second person is left out", () => {
    const { clean } = read(["AGENT,A,08030000001,01,01,01,005,,P-1", "AGENT,B,08030000001,01,01,01,006,,P-2"]);
    const diff = diffList(clean, empty);
    assert.equal(diff.conflicts[0].kind, "SHARED_PHONE");
    assert.equal(diff.newPeople.length, 1);
    assert.equal(diff.newAssignments.length, 1);
  });

  it("matches a person by the party's reference before their phone", () => {
    const { clean } = read(["AGENT,A,08039999999,01,01,01,005,,P-1"]);
    const diff = diffList(clean, { people: [{ id: "u1", name: "A", phone: "2348030000001", partyRef: "P-1" }], assignments: [{ id: "a1", personId: "u1", targetCode: "01/01/01/005", role: "PRIMARY", source: "IMPORT" }] });
    assert.equal(diff.newPeople.length, 0);
    assert.equal(diff.newAssignments.length, 0);
  });

  it("never overwrites a manual assignment without a choice", () => {
    const { clean } = read(["AGENT,A,08030000001,01,01,01,005,,P-1"]);
    const current = {
      people: [{ id: "u1", name: "A", phone: "2348030000001", partyRef: "P-1" }, { id: "u2", name: "Stand-in", phone: "2348030000002", partyRef: null }],
      assignments: [{ id: "a2", personId: "u2", targetCode: "01/01/01/005", role: "PRIMARY", source: "MANUAL" }],
    };
    const diff = diffList(clean, current);
    assert.equal(diff.manualDiffer.length, 1);
    assert.equal(diff.changed.length, 0);
    assert.deepEqual(planCommit(diff, {}).starts, []);
    assert.deepEqual(planCommit(diff, {}).ends, []);
    const accepted = planCommit(diff, { manual: { a2: "list" } });
    assert.deepEqual(accepted.ends, ["a2"]);
    assert.equal(accepted.starts[0].personId, "u1");
  });

  it("an assignment missing from the new file is listed, and ended only if ticked", () => {
    const { clean } = read(["AGENT,A,08030000001,01,01,01,005,,P-1"]);
    const current = {
      people: [{ id: "u1", name: "A", phone: "2348030000001", partyRef: "P-1" }, { id: "u3", name: "Gone", phone: "2348030000003", partyRef: "P-3" }],
      assignments: [
        { id: "a1", personId: "u1", targetCode: "01/01/01/005", role: "PRIMARY", source: "IMPORT" },
        { id: "a3", personId: "u3", targetCode: "01/01/01/006", role: "PRIMARY", source: "IMPORT" },
        { id: "a4", personId: "u3", targetCode: "01/01/01/007", role: "PRIMARY", source: "MANUAL" },
      ],
    };
    const diff = diffList(clean, current);
    /* The manual one is an override, not a leftover, and is not offered. */
    assert.deepEqual(diff.missing.map((row) => row.endId), ["a3"]);
    assert.deepEqual(planCommit(diff, {}).ends, []);
    assert.deepEqual(planCommit(diff, { end: ["a3"] }).ends, ["a3"]);
  });

  it("every manual change needs a reason, and Other needs a note", () => {
    assert.equal(checkReason("SECURITY", ""), null);
    assert.ok(checkReason("", ""));
    assert.ok(checkReason("OTHER", "  "));
    assert.equal(checkReason("OTHER", "Agent's own request"), null);
  });
});
