import { bank } from "../irev/bank.js";
import * as vault from "../irev/vault.js";

/**
 * What INEC's published sheet says about one polling unit, or null.
 *
 * Null means "nothing to compare with": the portal has not been gathered for
 * this project, Data Bank cannot be reached, or INEC does not list the unit.
 * None of those is a finding, and none of them may hold up a result, so every
 * failure here is swallowed into null and the unit is simply not compared.
 */
export async function inecForUnit(project, unitCode) {
  if (!project?.id || !unitCode) return null;
  try {
    const db = bank();
    if (!db || !(await vault.ready(db))) return null;
    const election = await vault.electionForProject(db, project.id);
    if (!election) return null;
    const digits = String(unitCode).replace(/\D/g, "");
    const rows = await vault.unitsByCode(db, election.election_id, [
      unitCode,
      String(unitCode).replaceAll("/", "-"),
      digits,
    ]);
    const row = rows[0];
    if (!row) return null;
    if (!row.sheet_up) return { published: false };
    if (row.status !== "read") return { published: true, votes: null, accredited: null, faults: [] };
    const votes = typeof row.party_votes === "string" ? JSON.parse(row.party_votes) : row.party_votes;
    return {
      published: true,
      votes: votes && typeof votes === "object" ? votes : null,
      accredited: row.accredited ?? null,
      registered: row.registered ?? null,
      faults: row.code_matches === false ? [{ kind: "wrong_paper", says: "The published sheet carries another unit's code" }] : [],
    };
  } catch {
    return null;
  }
}
