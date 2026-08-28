/**
 * Reading a polling unit out of a form.
 *
 * ── WHY THIS IS NOT IN THE SERVER ACTION ───────────────────────────────────
 * It was, and it was the one piece of that file worth testing on its own. A
 * "use server" module cannot be imported by the test runner — it reaches for
 * request headers the moment it loads — so the logic that decides which booth
 * an application is for could only ever be exercised by signing somebody up.
 *
 * That is the wrong thing to leave untested. Everything else on the sign-up
 * form can be corrected later; the polling unit is what every figure that
 * account ever files will be attached to, and getting it wrong does not fail
 * loudly. It files a real return against a booth in the wrong ward.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { isUnitCode, parseUnitCode, unitCodeFromParts } from "./units.js";
import { lgaCountForState } from "./lga-names.js";

/**
 * The booth, out of whichever way the form offered to say it.
 *
 * ── FOUR FIELDS AND AN ESCAPE HATCH ────────────────────────────────────────
 * The sign-up form asks for the polling unit as a state, a local government, a
 * ward number and a unit number, and keeps a box for somebody who would rather
 * type the whole code off the sheet. Both arrive here. Both have to be checked
 * here, because a server action is a public endpoint and "the form only sends
 * one of them" is a description of the form, not a rule about the request.
 *
 * ── WHY THE TWO ARE NEVER MERGED ───────────────────────────────────────────
 * If both are filled in and they disagree, this refuses rather than picks. A
 * preference between them would be a coin toss deciding which booth every
 * return that account ever files is attached to — and the losing half would be
 * on screen, in front of the agent, looking like it had been accepted.
 *
 * ── AND WHY THE LOCAL GOVERNMENT CARRIES ITS STATE ─────────────────────────
 * The form's value for a local government is "SS/LL", so the choice names the
 * state it belongs to. The separate state field is read only to notice when
 * the two disagree, which on an untampered form they cannot.
 * ───────────────────────────────────────────────────────────────────────────
 */
export function boothFromForm(formData) {
  const typed = String(formData.get("unitCode") ?? "").trim();

  const lgaField = String(formData.get("lga") ?? "").trim();
  const [lgaState = "", lgaNumber = ""] = lgaField.split("/");
  const state = String(formData.get("state") ?? "").trim() || lgaState;
  const ward = String(formData.get("ward") ?? "").replace(/\D/g, "").slice(0, 2);
  const unit = String(formData.get("unit") ?? "").replace(/\D/g, "").slice(0, 3);

  const chosen = { state, lga: lgaField, ward, unit };
  const picked = Boolean(lgaField || ward || unit);

  const fromParts = unitCodeFromParts({ state: lgaState || state, lga: lgaNumber, ward, unit });
  const fromTyped = typed && isUnitCode(typed) ? parseUnitCode(typed).code : null;

  if (typed && !fromTyped) {
    return {
      ...chosen,
      code: null,
      errors: {
        unitCode:
          "That is not a polling unit code. It is nine digits in four parts, like 01/01/04/006.",
      },
    };
  }

  if (fromTyped && picked && fromParts && fromParts !== fromTyped) {
    return {
      ...chosen,
      code: null,
      errors: {
        unitCode:
          `The code you typed is ${fromTyped}, and the boxes above say ${fromParts}. ` +
          "Clear whichever one is wrong so there is only one answer.",
      },
    };
  }

  /* A typed code that nothing above objected to is the escape hatch working as
     intended, and it is the whole answer. */
  if (fromTyped) return { ...chosen, code: fromTyped, errors: {} };

  const errors = {};
  if (!state) errors.state = "Choose the state you were appointed in.";
  else if (lgaState && state !== lgaState) {
    /* Only reachable by a request that did not come from the form. */
    errors.lga = "The state and the local government do not agree. Choose them again.";
  }
  if (!lgaNumber) errors.lga = errors.lga ?? "Choose your local government.";
  if (!ward || Number(ward) === 0) errors.ward = "The ward number, as printed on your sheet.";
  if (!unit || Number(unit) === 0) errors.unit = "The unit number, as printed on your sheet.";

  /* ── THE ONE CHECK THAT CATCHES A MISTYPED LOCAL GOVERNMENT ────────────
     We know how many local governments each state has, so 25/27/… can be
     refused outright: Nasarawa has thirteen, and there is no twenty-seventh
     for anybody to have been appointed to. Every other part of the code is
     nine digits that we have no list to check against. */
  if (!errors.lga && lgaNumber) {
    const held = lgaCountForState(state);
    if (held && Number(lgaNumber) > held) {
      errors.lga = `That state has ${held} local governments, so there is no number ${Number(lgaNumber)}. Choose it from the list.`;
    }
  }

  if (!Object.keys(errors).length && !fromParts) {
    /* Every part present and the whole still does not parse — a state number
       outside 01–37 is the only way in. Said against the state field, because
       that is the one that is wrong. */
    errors.state = "That is not a state we can place. Choose it from the list.";
  }

  return { ...chosen, code: Object.keys(errors).length ? null : fromParts, errors };
}
