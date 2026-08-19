/**
 * Home page copy.
 *
 * Kept out of the components so the whole argument can be read and edited in
 * one place. One rule for everything in this file: write it so somebody who has
 * never built software can read it once and get it. No schema talk, no query
 * talk, no jargon, the reader is a producer, a coordinator or a candidate, not
 * an engineer.
 */

/* ------------------------------------------------ the four rules */

/**
 * The rules the product will not trade away. They lead the page because they
 * are the reason to buy it: anyone can draw a map, and a map drawn without
 * these is worse than no map at all on the one night it matters.
 */
export const disciplines = [
  {
    id: "silence",
    title: "Grey means nobody has reported yet",
    body: "If no result has come in from a booth, we draw it grey and say so. We never colour it in for a party, and never show it as a low score. At 9pm, “nobody is winning here” and “nobody has told us yet” are two completely different things.",
  },
  {
    id: "coverage",
    title: "Every number says how much is counted",
    body: "A party ahead on 4% of booths is not ahead. Every figure we publish sits next to the share of booths it came from, on screen, on air, and in anything you download.",
  },
  {
    id: "evidence",
    title: "There is a photo behind every result",
    body: "A result is filed with a photo of the result sheet, by a named agent, from a phone whose location was recorded at that moment. A number with nothing behind it is a claim, not a result.",
  },
  {
    id: "separate",
    title: "This is a count, not the count",
    body: "Our agents' figures stay in their own column, next to the official ones and never mixed into them. The gap between the two is the most interesting number of the night, and blending them destroys it.",
  },
];

/* ---------------------------------------------------- chain of custody */

/**
 * Booth to broadcast, in the order it actually happens. Seven steps, and the
 * two that matter most are 2 and 6: where the booth comes from, and who is
 * allowed to say a result has been checked.
 */
export const chain = [
  {
    step: "01",
    title: "One booth, one agent",
    body: "All 176,623 polling units are a named position, each filled by one person appointed by the ward above them. Not a sign-up sheet, a chart with a name in every square.",
    detail: "One seat per booth",
  },
  {
    step: "02",
    title: "The app already knows their booth",
    body: "It opens on the agent's own polling unit. There is no list to choose from, because a booth you can choose is a booth somebody can choose wrongly.",
    detail: "No dropdown, ever",
  },
  {
    step: "03",
    title: "Where they are standing is recorded",
    body: "When the form opens, the phone's location is taken and compared with the booth they were appointed to. It backs up the filing. It never decides which booth is being filed for.",
    detail: "Location backs it up",
  },
  {
    step: "04",
    title: "The arithmetic is checked in their hand",
    body: "Accredited cannot be more than registered. Votes plus rejected cannot be more than accredited. An empty form is not a result. Caught on the phone while the sheet is still in front of them, then checked again on our side.",
    detail: "Checked as they type",
  },
  {
    step: "05",
    title: "The sheet is photographed",
    body: "The photo is shrunk on the phone before it is sent, so it goes through on a weak rural signal instead of stalling. We then seal it, so the image you look at next year is provably the one filed tonight.",
    detail: "Shrunk, then sealed",
  },
  {
    step: "06",
    title: "Somebody above them checks it",
    body: "A coordinator for that area compares the figures against the photo. Nobody signs off their own work, not a ward coordinator, not head office. Change a number after it has been checked and it goes straight back to unchecked.",
    detail: "Never your own work",
  },
  {
    step: "07",
    title: "It is on the board seconds later",
    body: "The moment it lands it counts at every level: ward, LGA, state, zone and nation. The situation room, the newsroom and the video wall all see the same number at the same second.",
    detail: "Six levels at once",
  },
];

/* ------------------------------------------------------------- the rooms */

export const rooms = [
  {
    id: "field",
    label: "In the field",
    title: "The agent's phone",
    lead: "Held one-handed, standing up, at night, on a signal that may not hold.",
    points: [
      "Opens on their own booth, nothing to search for or pick",
      "Location checked against the booth they were appointed to",
      "Big number pads, a running total, and the maths checked as they type",
      "The result sheet photographed and shrunk on the phone",
      "Saved as they go, so a dropped signal costs a retry, not the figures",
    ],
  },
  {
    id: "situation",
    label: "Situation room",
    title: "The checking floor",
    lead: "What is in, what is missing, and what needs a second look, with each coordinator seeing only their own area.",
    points: [
      "Live coverage by state, LGA and ward: what has arrived and what has not",
      "A checking queue with the photo right beside the figures",
      "Anything odd flagged: more votes than voters, a booth reporting twice, one ward out of step",
      "A disputed result needs a written reason, and stops counting without being deleted",
      "The gap between our count and the official figures, biggest first",
      "Every action signed and timestamped",
    ],
  },
  {
    id: "broadcast",
    label: "On air",
    title: "Ready for the studio",
    lead: "Built to be put on air directly, not screen-grabbed by a producer at 2am.",
    points: [
      "Full-screen boards sized for a video wall and readable across a studio",
      "A web address your gallery software can point straight at",
      "Lower thirds and state cards that update themselves as results land",
      "How much is counted and the time are part of every frame",
      "A careful call: too early, too close, leaning, decided",
      "Download everything in your area as a spreadsheet",
    ],
  },
];

/* ------------------------------------------------------------ the levels */

export const levels = [
  { rank: 1, tier: "National", scope: "The whole country", units: 1, seat: "n/a" },
  { rank: 2, tier: "Zone", scope: "Geopolitical zone", units: 6, seat: "n/a" },
  { rank: 3, tier: "State", scope: "State or the FCT", units: 37, seat: "n/a" },
  { rank: 4, tier: "LGA", scope: "Local Government Area", units: 774, seat: "n/a" },
  { rank: 5, tier: "Ward", scope: "Registration area", units: 8809, seat: "Coordinator checks it" },
  {
    rank: 6,
    tier: "Polling unit",
    scope: "The booth itself",
    units: 176623,
    seat: "Agent files the result",
    emphasis: true,
  },
];

/* ---------------------------------------------------------- the refusals */

/**
 * What the product will not do. This is the section a serious buyer reads
 * first, and the one a competitor cannot copy without rebuilding their product.
 */
export const refusals = [
  {
    title: "A booth cannot report twice",
    body: "One booth, one result. A correction updates that result, it never adds a second one. Two results from one booth is exactly the confusion this rule exists to prevent.",
  },
  {
    title: "The booth is not something you type in",
    body: "It comes from the agent's appointment, checked on our side every single time they file. A box where you type the booth name is a box somebody could change.",
  },
  {
    title: "A disputed result is never deleted",
    body: "It stays where it is, keeps its photo, and stops counting. Deleting it would be the most suspicious thing this system could possibly do.",
  },
  {
    title: "Nobody signs off their own work",
    body: "Built in and checked twice, so even the account with every permission in the system cannot approve a result it filed itself.",
  },
  {
    title: "Colour is never the only clue",
    body: "Every state carries its leading party's initials across it, every tooltip names the party in words, and the table under the map is the same information with no colour in it at all.",
  },
  {
    title: "The photos are not public",
    body: "Totals are public. The photographed sheet is not, it can show handwriting, a bystander, and exactly where somebody stood at a known hour. Only the agent who filed it and their coordinators can see it.",
  },
];

/* ------------------------------------------------------------ where it is */

/**
 * Built, partial, next, stated plainly.
 *
 * An unusual thing to put on a home page, and the most persuasive block on it.
 * Anyone evaluating election infrastructure has been shown a demo that was
 * entirely a demo; a roadmap that admits its own gaps is the cheapest possible
 * proof that the rest of the page is load-bearing.
 */
export const status = [
  {
    state: "built",
    label: "Booth to board",
    note: "Filing, checking, photos, disputes, and totals at all six levels",
  },
  {
    state: "built",
    label: "Public results pages",
    note: "National map, state pages, LGA and ward grids, and a live feed of arrivals",
  },
  {
    state: "built",
    label: "The checking queue",
    note: "Each coordinator sees their own area, with the photo beside the figures",
  },
  {
    state: "built",
    label: "The map itself",
    note: "State and LGA boundaries prepared in advance, so nothing has to be fetched on the night",
  },
  {
    state: "partial",
    label: "Constituency results",
    note: "Senate and House races still add up by geography rather than by constituency",
  },
  {
    state: "partial",
    label: "The gap with official figures",
    note: "Worked out and shown as a panel; it wants a page of its own",
  },
  {
    state: "next",
    label: "Filing with no signal",
    note: "Save on the phone, including the photo, and send it when the signal comes back",
  },
  {
    state: "next",
    label: "Downloads",
    note: "A spreadsheet of every counted result inside your area",
  },
];

export const STATUS_LABEL = {
  built: "Built",
  partial: "Partly built",
  next: "Next",
};
