/**
 * Where a conversation has got to.
 *
 * ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 * The desk is a client component and needs these labels; the bot is server
 * only and imports the database. Importing the labels from the bot pulled
 * `node:sqlite` into the browser bundle and took the build down with it. The
 * vocabulary both sides share therefore lives here, on its own, importing
 * nothing. Anything that can reach the database must never be reachable from
 * a component.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const STEPS = {
  IDLE: "IDLE",
  UNIT: "UNIT",
  ACCREDITED: "ACCREDITED",
  REJECTED: "REJECTED",
  VOTES: "VOTES",
  PHOTO: "PHOTO",
  CONFIRM: "CONFIRM",
  DONE: "DONE",
};

/** What the desk shows beside a half-finished conversation. */
export const STEP_LABEL = {
  IDLE: "Waiting",
  UNIT: "Giving the polling unit",
  ACCREDITED: "Giving accredited voters",
  REJECTED: "Giving rejected ballots",
  VOTES: "Giving the party figures",
  PHOTO: "Sending the result sheet",
  CONFIRM: "Confirming",
  DONE: "Filed",
};
