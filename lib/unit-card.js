import { screenReturn } from "./anomalies.js";
import { lgaNameForCode } from "./lga-names.js";
import { stageOf } from "./operations.js";
import { auditSheet } from "./results.js";
import { parseUnitCode } from "./units.js";

/**
 * Everything the room knows about one polling unit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS BUILT ONCE ON THE SERVER AND NOT FETCHED ON A CLICK
 *
 *  The card is opened by clicking a booth — on the map, in the stuck list, in
 *  the coverage table. Clicking is the fastest interaction in the room and it
 *  happens most when the night is busiest, which is exactly when a round trip
 *  per click is least affordable and most likely to fail.
 *
 *  So the whole index is assembled with the rows already in hand and handed
 *  down with the page. It costs one pass over returns the room has already
 *  fetched for three other screens, and the card opens instantly with no
 *  network at all — including on the connection in the room, at the hour the
 *  connection in the room is worst.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND WHY IT IS TRIMMED HARD ─────────────────────────────────────────────
 * A return carries thirty columns. Shipping all of them for four thousand
 * booths would put a megabyte on the wire to answer a question about one.
 * Only what the card prints is kept, and the party figures are kept as a plain
 * object because that is what the card draws.
 */

/**
 * Build the index.
 *
 * Keyed by the canonical unit code — with slashes, the way INEC prints it and
 * the way every other key in this product is written. A second spelling is a
 * second booth that never joins to the first; see the note in lib/units.js.
 */
export function unitCards({ rows = [], incidents = [], coordinators = [], photos = {} } = {}) {
  const cards = new Map();

  const reach = (unitCode) => {
    const code = String(unitCode ?? "").trim();
    if (!code) return null;
    if (!cards.has(code)) {
      const parsed = parseUnitCode(code);
      cards.set(code, {
        unitCode: code,
        state: parsed?.stateName ?? null,
        stateCode: parsed?.stateCode ?? null,
        /* The local government by name, not by its two digits. "18/03" is not
           a place anybody in a room recognises, and the mapping from digits to
           name reads from disk — so it is done here, once, and never in a
           browser. */
        lga: parsed?.lgaCode ? lgaNameForCode(parsed.lgaCode) : null,
        lgaCode: parsed?.lgaCode ?? null,
        /* The ward has no name table in this product yet. Its code is printed
           rather than a made-up label: a card that invents "Ward 4" where the
           register says something else is worse than one that shows the code. */
        wardCode: parsed?.wardCode ?? null,
        unitNo: parsed?.unitNo ?? null,
        result: null,
        agent: null,
        incidents: [],
      });
    }
    return cards.get(code);
  };

  /* ── THE RETURN ────────────────────────────────────────────────────────*/
  for (const row of rows) {
    const card = reach(row.unitCode);
    if (!card) continue;

    const at = stageOf(row);
    const audit = auditSheet(row);
    const flags = screenReturn(row);

    card.result = {
      race: row.race,
      registered: row.registered ?? null,
      accredited: row.accredited ?? null,
      rejected: row.rejected ?? null,
      votes: row.votes ?? {},
      status: row.status,
      /* Where it is on the pipeline, from the same function the operations
         screen uses. Two places computing "verified" separately is how a card
         comes to disagree with the chart it was opened from. */
      stage: at.reached,
      next: at.next,
      source: row.source ?? null,
      formSerial: row.formSerial ?? null,
      /* Whether the sheet was photographed, and whether the photograph was
         actually held against the typed figures. Three states, kept apart —
         see toResult in lib/db.js. */
      sheet: row.sheetMatch
        ? { compared: row.sheetMatch.compared === true, agrees: row.sheetMatch.agrees ?? null }
        : null,
      boxes: {
        ballotsIssued: row.ballotsIssued ?? null,
        unusedBallots: row.unusedBallots ?? null,
        spoiled: row.spoiled ?? null,
        usedBallots: row.usedBallots ?? null,
        statedValid: row.statedValid ?? null,
      },
      balances: audit.balances,
      culprit: audit.culprit ?? null,
      findings: audit.findings ?? [],
      flags: flags.map((flag) => ({ severity: flag.severity, says: flag.says, why: flag.why })),
      position: row.position
        ? {
            lat: row.position.lat,
            lon: row.position.lon,
            accuracy: row.position.accuracy ?? null,
            distance: row.position.distance ?? null,
          }
        : null,
      submittedAt: row.submittedAt ?? null,
      verifiedAt: row.verifiedAt ?? null,
      repName: row.repName ?? null,
      contested: row.contested ?? null,
    };
  }

  /* ── THE PERSON STANDING THERE ─────────────────────────────────────────*/
  for (const row of coordinators) {
    const card = reach(row.unitCode);
    if (!card) continue;
    card.agent = {
      name: row.name,
      kind: row.kind,
      lastSeen: row.lastSeen ?? null,
      /* Where the fix came from and how old it is. A card that printed a
         coordinate without saying it was taken at the moment they filed four
         hours ago would be claiming to know where somebody is now. */
      lat: row.lat ?? null,
      lon: row.lon ?? null,
      via: row.via ?? null,
      seenAt: row.seenAt ?? null,
      band: row.band ?? null,
      distance: row.distance ?? null,
      derived: row.derived ?? true,
      filed: row.filed ?? false,
    };
  }

  /* ── WHAT WAS REPORTED FROM IT ─────────────────────────────────────────*/
  for (const item of incidents) {
    const card = reach(item.unitCode);
    if (!card) continue;
    card.incidents.push({
      id: item.id,
      kind: item.kind,
      severity: item.severity,
      detail: item.detail ?? null,
      reporter: item.reporter ?? null,
      status: item.status ?? "OPEN",
      at: item.createdAt ?? null,
      photos: (photos[item.id] ?? []).length,
    });
  }

  /* ── THE BOOTH'S OWN EVENING, IN ORDER ─────────────────────────────────
     Assembled last, out of everything above, so the card has a timeline
     without the screen having to merge three lists in a browser. Oldest
     first: this one is read as a history rather than as a feed. */
  for (const card of cards.values()) {
    card.incidents.sort((a, b) => new Date(b.at ?? 0) - new Date(a.at ?? 0));

    card.timeline = [
      card.agent?.lastSeen && {
        at: card.agent.lastSeen,
        what: "Agent signed in",
        detail: card.agent.name,
      },
      card.agent?.seenAt && {
        at: card.agent.seenAt,
        what: "Position received",
        detail: card.agent.via === "whatsapp" ? "Sent over WhatsApp" : "From the filing",
      },
      ...card.incidents.map((item) => ({
        at: item.at,
        what: item.kind ?? "Report from the field",
        detail: item.severity,
        severity: item.severity,
      })),
      card.result?.submittedAt && {
        at: card.result.submittedAt,
        what: "Return filed",
        detail: card.result.source,
      },
      card.result?.verifiedAt && {
        at: card.result.verifiedAt,
        what: "Verified by a desk",
        detail: null,
      },
    ]
      .filter(Boolean)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }

  return Object.fromEntries(cards);
}
