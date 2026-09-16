/**
 * What an agent can tell the room from their polling unit, in their words.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE THINGS AN AGENT DOES, AND THIS FILE NAMES TWO OF THEM
 *
 *  Updates are the day's procedure — materials here, voting started, voting
 *  closed, counting begun. Situations are what goes wrong — a threat, a
 *  snatched box, a card reader that will not read. Results are the third and
 *  live in lib/races.js.
 *
 *  Both lists are plain data with no database and no React, so the form that
 *  offers them, the action that checks them and the test that pins them read
 *  one copy and cannot drift.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * The polling day, in the order it happens.
 *
 * `needsLocation` is set where the moment only means something if the agent
 * is standing at the unit: arriving, the result being posted, leaving. The
 * procedural steps in between can be sent from wherever the signal is.
 */
export const UPDATE_STEPS = [
  { type: "arrival", label: "I have arrived at the unit", hint: "Send this first, standing at the unit.", needsLocation: true },
  { type: "materials_arrived", label: "Election materials have arrived", hint: "Ballot papers, result sheets and the card reader." },
  { type: "accreditation_open", label: "Accreditation has started" },
  { type: "polls_open", label: "Voting has started" },
  { type: "polls_close", label: "Voting has closed" },
  { type: "counting_start", label: "Counting has started" },
  { type: "result_posted", label: "The result is posted at the unit", needsLocation: true },
  { type: "departure", label: "I am leaving the unit", needsLocation: true },
];

/**
 * The steps Agent360 scores. It refuses a type it does not know, so a step
 * this product records for itself — materials arriving — is kept here and not
 * sent there.
 */
export const AGENT360_STEPS = new Set([
  "arrival",
  "accreditation_open",
  "polls_open",
  "polls_close",
  "counting_start",
  "result_posted",
  "departure",
  "distress",
]);

export function updateStep(type) {
  return UPDATE_STEPS.find((step) => step.type === type) ?? null;
}

/**
 * How far through the day an agent is, from what they have sent, newest first.
 * `next` is the first step in the day's order not yet sent, which is not
 * always the one after the latest: a step skipped is still owed.
 */
export function updateProgress(updates = []) {
  const sent = new Set(updates.map((update) => update.step));
  const latest = updates.find((update) => updateStep(update.step)) ?? null;

  return {
    done: UPDATE_STEPS.filter((step) => sent.has(step.type)).length,
    total: UPDATE_STEPS.length,
    latest: latest ? { label: updateStep(latest.step).label, at: latest.at } : null,
    next: UPDATE_STEPS.find((step) => !sent.has(step.type)) ?? null,
  };
}

/**
 * How urgent a situation is. The words are the staff incident form's, so a
 * room reading both feeds reads one vocabulary; the ids are what incidents
 * already store.
 */
export const URGENCY = [
  { id: "CRITICAL", label: "Needs it now", hint: "Someone is in danger, or votes are being stolen or destroyed." },
  { id: "SERIOUS", label: "Needs attention", hint: "Voting is held up or not being done properly." },
  { id: "INFO", label: "For the record", hint: "Worth writing down. Nothing is at risk right now." },
];

export function urgency(id) {
  return URGENCY.find((level) => level.id === id) ?? null;
}

/**
 * What can go wrong at a polling unit, grouped the way an agent thinks of it.
 *
 * The label is what is stored as the incident's kind, and where the staff form
 * already had a name for the same thing, that name is used, so the room does
 * not see "Card reader failure" from a desk and "BVAS not working" from a
 * booth and count two problems. Each carries the urgency it usually deserves;
 * the agent can change it.
 */
export const SITUATION_GROUPS = [
  {
    id: "security",
    label: "Security",
    kinds: [
      { id: "violence", label: "Violence or intimidation", urgency: "CRITICAL" },
      { id: "armed", label: "Thugs or armed people at the unit", urgency: "CRITICAL" },
      { id: "ballot_box", label: "Ballot box snatched or destroyed", urgency: "CRITICAL" },
      { id: "vote_buying", label: "Vote buying near the unit", urgency: "SERIOUS" },
      { id: "agent_obstructed", label: "Agent obstructed", urgency: "SERIOUS" },
    ],
  },
  {
    id: "voting",
    label: "Voting",
    kinds: [
      { id: "late_start", label: "Voting did not start on time", urgency: "SERIOUS" },
      { id: "card_reader", label: "Card reader failure", urgency: "SERIOUS" },
      { id: "overvoting", label: "Overvoting suspected", urgency: "CRITICAL" },
      { id: "turned_away", label: "Voters turned away", urgency: "SERIOUS" },
      { id: "queue_at_close", label: "Queue still long at close", urgency: "SERIOUS" },
    ],
  },
  {
    id: "materials",
    label: "Materials and results",
    kinds: [
      { id: "materials_late", label: "Materials arrived late", urgency: "SERIOUS" },
      { id: "materials_missing", label: "Materials missing or not enough", urgency: "SERIOUS" },
      { id: "result_disputed", label: "Result sheet disputed", urgency: "SERIOUS" },
    ],
  },
  {
    id: "other",
    label: "Anything else",
    kinds: [{ id: "other", label: "Something else", urgency: "INFO" }],
  },
];

export function situationKind(id) {
  for (const group of SITUATION_GROUPS) {
    const found = group.kinds.find((kind) => kind.id === id);
    if (found) return found;
  }
  return null;
}

/** What an SOS is filed as. Always "Needs it now". */
export const SOS_KIND = "Agent in danger (SOS)";

/* ══════════════════════════════════════════════════════════════════════════
   THE SAME DAY, IN DATA BANK'S WORDS

   Data Bank's Situation dashboard keeps its own vocabulary: twelve stages of a
   polling day and eleven incident categories, each with a sentence saying what
   it asserts and a severity floor it cannot be filed below. This product asks
   an agent plainer questions — "voting has started", "ballot box snatched" —
   and these tables are where the two meet.

   Written out rather than derived from the strings, because a mapping that
   guessed would quietly file a ballot-box snatching as "other" the day
   somebody reworded a button.
   ══════════════════════════════════════════════════════════════════════════ */

/** Our update steps, as Data Bank's stages. A step with no stage is not relayed. */
export const DATABANK_STAGE = {
  arrival: "ARRIVED",
  materials_arrived: "SETUP",
  accreditation_open: "ACCREDITATION",
  polls_open: "VOTING",
  polls_close: "POLLS_CLOSED",
  counting_start: "SORTING",
  /* The sheet is posted at the unit once it is completed and signed. */
  result_posted: "SHEET_SIGNED",
  departure: "STOOD_DOWN",
};

/** Our situation kinds, as Data Bank's incident categories. */
export const DATABANK_CATEGORY = {
  violence: "VIOLENCE",
  armed: "VIOLENCE",
  ballot_box: "BALLOT_SNATCHING",
  vote_buying: "VOTE_BUYING",
  agent_obstructed: "OBSTRUCTION",
  turned_away: "OBSTRUCTION",
  late_start: "LATE_START",
  card_reader: "BVAS_FAILURE",
  overvoting: "OVERVOTING",
  queue_at_close: "LOGISTICS",
  materials_late: "MATERIALS",
  materials_missing: "MATERIALS",
  result_disputed: "COLLATION",
  other: "OTHER",
};

/* An SOS is a person in danger, which is what Data Bank's violence category
   is for. The severity it carries raises it to critical on arrival. */
export const SOS_CATEGORY = "VIOLENCE";

/** Our three urgencies, as Data Bank's severities. It may raise, never lower. */
export const DATABANK_SEVERITY = { CRITICAL: "CRITICAL", SERIOUS: "HIGH", INFO: "LOW" };
