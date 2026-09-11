import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { REGISTERED_IDS, partyById, partyLogo } from "../lib/party-register.js";

/**
 * Every logo the register promises is a file that exists.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A MISSING FILE IS WORSE HERE THAN ON AN ORDINARY PAGE
 *
 *  These marks are drawn into result cards that are rendered to an image on
 *  the server and published. A browser's `onError` fallback does not run
 *  there. So a party flagged `logo: true` whose file is absent does not
 *  degrade to its colour block — it exports a broken image into a graphic
 *  going out under the organisation's name, on an election night.
 *
 *  public/parties/README.md states the rule in two steps: add the file, then
 *  add the flag. Nothing enforced the pairing until this file. It is the kind
 *  of thing that is correct the day it is written and wrong the first time
 *  somebody renames a file.
 * ══════════════════════════════════════════════════════════════════════════
 */

const FOLDER = join(process.cwd(), "public", "parties");

describe("party marks", () => {
  it("has a real file behind every party flagged as having one", () => {
    const promised = REGISTERED_IDS.map((id) => [id, partyLogo(id)]).filter(([, url]) => url);
    assert.ok(promised.length > 0, "no party in the register carries a logo");

    const missing = promised
      .filter(([, url]) => !existsSync(join(process.cwd(), "public", url)))
      .map(([id, url]) => `${id} -> public${url}`);

    assert.deepEqual(
      missing,
      [],
      `\n  Flagged \`logo: true\` with no file behind it:\n    ${missing.join("\n    ")}\n` +
        "  A server-rendered broadcast card cannot fall back. Add the file, or drop the flag.\n"
    );
  });

  it("has a party flagged for every file in the directory", () => {
    /* The other direction. A file nobody points at is dead weight in the
       bundle and, more usefully, it is the symptom of step two of the README
       having been skipped — the file was added and the flag was not, so the
       party still draws as a colour block and nobody knows why. */
    const orphans = readdirSync(FOLDER)
      .filter((name) => name.endsWith(".png"))
      .filter((name) => {
        const id = name.replace(/\.png$/, "").toUpperCase();
        return partyLogo(id) === null;
      });

    assert.deepEqual(
      orphans,
      [],
      `\n  Files in public/parties with no party flagged for them: ${orphans.join(", ")}.\n` +
        "  Add `logo: true` to that party's row in lib/party-register.js.\n"
    );
  });

  it("names each file after the party id, lowercased", () => {
    for (const id of REGISTERED_IDS) {
      const url = partyLogo(id);
      if (url) assert.equal(url, `/parties/${id.toLowerCase()}.png`, `${id} points somewhere else`);
    }
  });

  it("gives the four parties that carried a state in 2023 their own mark", () => {
    /* APC, PDP and LP carried states in 2023; ADC is the party whose
       membership register this product holds. These four are the marks a
       reader actually meets on a result board, so their absence is asserted
       outright rather than left to the pairing checks above. */
    for (const id of ["APC", "PDP", "LP", "ADC"]) {
      assert.ok(partyLogo(id), `${id} has no mark`);
      assert.ok(partyById(id), `${id} is not in the register at all`);
    }
  });

  it("draws a party with no file as a colour block, not as nothing", () => {
    /* Null is the contract PartyMark switches on. A guessed path would render
       a broken image; null renders the party's colour with its code on it,
       which the README calls a finished state rather than a placeholder. */
    assert.equal(partyLogo("NNPP"), null);
    assert.ok(partyById("NNPP").token, "NNPP has no colour to fall back to");
  });
});
