/**
 * IReV's answers, reduced to the rows Data Bank keeps.
 *
 * Pure functions and nothing else: no network, no database. What the portal
 * sends is deeply nested and repeats the whole election inside every polling
 * unit; a row here is the handful of facts worth keeping, named plainly.
 */

/**
 * The election types the portal knows, and the short words a person may type
 * for each. The codes are the commission's own.
 */
export const TYPE_WORDS = {
  PRES: ["pres", "president", "presidential"],
  GOV: ["gov", "governor", "governorship"],
  SEN: ["sen", "senate", "senatorial"],
  REPS: ["reps", "rep", "house", "representatives"],
  ASSEMBLY: ["assembly", "state-assembly", "hoa"],
  CHAIRMAN: ["chairman", "chairmanship"],
  COUNCILLOR: ["councillor", "councillorship"],
};

/** The commission's code for a word somebody typed, or null. */
export function typeCode(word) {
  const said = String(word ?? "").trim().toLowerCase();
  if (!said) return null;
  for (const [code, words] of Object.entries(TYPE_WORDS)) {
    if (code.toLowerCase() === said || words.includes(said)) return code;
  }
  return null;
}

export function typeRow(type) {
  return {
    code: type.code,
    name: type.name,
    type_id: type.election_type_id ?? null,
    ref: type._id,
  };
}

/**
 * The day an election was held.
 *
 * The portal stores the day as midnight in Lagos, which is eleven at night
 * the day before in the form it sends — and on some elections it stores a
 * different day altogether. The election's own title carries the date the
 * commission announced, so that is used where it is there.
 */
export function heldOn(election) {
  const titled = String(election?.full_name ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (titled) return titled;

  const stored = Date.parse(election?.election_date ?? "");
  if (Number.isNaN(stored)) return null;
  return new Date(stored + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function electionRow(election) {
  const day = heldOn(election);
  const type = election.election_type ?? {};
  const nationwide = type.code === "PRES";

  return {
    election_id: election.election_id,
    ref: election._id,
    type_code: type.code ?? null,
    type_name: type.name ?? null,
    year: day ? Number(day.slice(0, 4)) : null,
    held_on: day,
    name: election.full_name ?? null,
    /* A presidential election is filed under the first state alphabetically,
       which is a placeholder and not a place it was held. */
    state_id: nationwide ? null : (election.state_id ?? null),
    state_name: nationwide ? null : (election.state?.name ?? null),
    area_name: election.domain?.name ?? null,
    area_kind: election.onModel ?? null,
  };
}

/** One answer from `places`, as its local governments and their wards. */
export function placeRows(electionId, places) {
  const lgas = [];
  const wards = new Map();

  for (const place of places ?? []) {
    const lga = place.lga ?? {};
    if (!lga._id) continue;

    lgas.push({
      election_id: electionId,
      lga_id: lga.lga_id,
      ref: lga._id,
      name: lga.name ?? null,
      code: lga.code ?? null,
      state_id: place.state?.state_id ?? lga.state_id ?? null,
      state_name: place.state?.name ?? null,
    });

    for (const ward of place.wards ?? []) {
      if (!ward._id) continue;
      wards.set(ward.ward_id, {
        election_id: electionId,
        ward_id: ward.ward_id,
        ref: ward._id,
        name: ward.name ?? null,
        code: ward.code ?? null,
        lga_id: ward.lga_id ?? lga.lga_id,
        state_id: ward.state_id ?? lga.state_id ?? null,
      });
    }
  }

  return { lgas, wards: [...wards.values()] };
}

/**
 * When a sheet went up, read off its own address.
 *
 * ── THE ONE TIME ON A SHEET THAT NOBODY HAS REWRITTEN ──────────────────────
 * The portal's own "updated at" for the 2023 elections is the day in 2024 the
 * commission moved its files to new storage, on every sheet alike. But the
 * commission's system named each file with the second it received it —
 * `025-1677397507.pdf` — and a file's name does not change when it is moved.
 * Checked against the time written inside the documents themselves, the two
 * agree to within a few seconds.
 *
 * The time sits in different places in the name depending on which of the
 * commission's systems took the file in — `025-1677397507.pdf`,
 * `1677437530-719.pdf`, `result_162174_1677505713_thumb.jpg` — so it is
 * looked for as what it is: ten digits standing alone that make a believable
 * moment. Elections since late 2025 name their files with no time in them;
 * for those this is null and the photograph's own details are used.
 */
export function uploadedAt(url, now = Date.now()) {
  const name = String(url ?? "").split("?")[0].split("/").at(-1);
  for (const [, digits] of name.matchAll(/(?<!\d)(\d{10})(?!\d)/g)) {
    const at = Number(digits) * 1000;
    /* Before the portal existed, or in the future, is not a time it went up. */
    if (at >= Date.UTC(2019, 0, 1) && at <= now + 86400000) return new Date(at).toISOString();
  }
  return null;
}

/**
 * One polling unit as the portal lists it, with its sheet where one is up.
 *
 * A unit with no sheet is still a row. "Not uploaded yet" is the fact most
 * worth knowing on the night, and it cannot be read off a table that only
 * holds the units that have one.
 */
export function sheetRow(electionId, unit) {
  const sheet = unit.document?.url ? unit.document : null;
  const unitId = unit.polling_unit_id ?? unit.polling_unit?.polling_unit_id ?? null;
  if (unitId === null) return null;

  return {
    election_id: electionId,
    unit_id: unitId,
    pu_code: unit.pu_code ?? unit.polling_unit?.pu_code ?? null,
    unit_name: unit.name ?? unit.polling_unit?.name ?? null,
    ward_id: unit.ward_id ?? unit.polling_unit?.ward_id ?? null,
    lga_id: unit.lga_id ?? unit.polling_unit?.lga_id ?? null,
    state_id: unit.polling_unit?.state_id ?? null,
    sheet_url: sheet?.url ?? null,
    sheet_at: sheet?.updated_at ?? null,
    uploaded_at: uploadedAt(sheet?.url),
    supplement: Boolean(sheet?.is_supplement),
    earlier_sheets: Array.isArray(unit.old_documents) ? unit.old_documents.length : 0,
    no_voters: Boolean(unit.is_zero_pu),
  };
}

/** Many units as rows, one per unit: the portal can list a unit twice. */
export function sheetRows(electionId, units) {
  const rows = new Map();
  for (const unit of units ?? []) {
    const row = sheetRow(electionId, unit);
    if (row) rows.set(row.unit_id, row);
  }
  return [...rows.values()];
}

/**
 * Which elections somebody asked for.
 *
 * `want` is what was typed: a type, a year, a state, a word from the name, or
 * the portal's own number for one election. Every part given must match;
 * a part left out matches everything.
 */
export function chosen(elections, want = {}) {
  const state = String(want.state ?? "").trim().toLowerCase();
  const word = String(want.name ?? "").trim().toLowerCase();
  const year = want.year ? Number(want.year) : null;
  const id = want.id ? String(want.id) : null;

  return elections.filter((election) => {
    if (id && String(election.election_id) !== id && election.ref !== id) return false;
    if (want.type && election.type_code !== want.type) return false;
    if (year && election.year !== year) return false;
    if (state && String(election.state_name ?? "").toLowerCase() !== state) return false;
    if (word && !String(election.name ?? "").toLowerCase().includes(word)) return false;
    return true;
  });
}
