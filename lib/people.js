/**
 * The people and institutions this room talks about.
 *
 * ── WHY A LIST AND NOT JUST WHATEVER IS SAID ───────────────────────────────
 * Two different jobs need this, and both were being done badly without it.
 *
 * The first is hearing. A recogniser ranks its guesses on how English they
 * sound, and "Atiku Abubakar" sounds like nothing in English at all — it
 * comes back as "at ikea book a car" and worse. Knowing the names in advance
 * lets the right guess be picked out of the five on offer.
 *
 * The second is knowing what a question is about. The product used to treat
 * every candidate as a shorthand for their party, so asking about Atiku
 * Abubakar returned the PDP's national vote total. That is a true answer to a
 * question nobody asked. A person is a person: they have a face, a history
 * and a role, none of which is a column in a results table.
 *
 * ── WHAT `look` IS FOR ─────────────────────────────────────────────────────
 * The phrase to search the web with, which is deliberately not the phrase
 * somebody says. People say "Atiku" and "INEC"; encyclopaedias file those
 * under "Atiku Abubakar" and "Independent National Electoral Commission".
 * Bridging that is the difference between a lookup that works for how people
 * actually speak and one that only works for how things are catalogued.
 */

export const PEOPLE = [
  {
    name: "Bola Tinubu",
    party: "APC",
    role: "President of Nigeria, elected 2023",
    look: "Bola Tinubu",
    said: ["bola ahmed tinubu", "bola tinubu", "asiwaju tinubu", "asiwaju", "tinubu"],
  },
  {
    name: "Atiku Abubakar",
    party: "PDP",
    role: "PDP candidate, 2023 presidential election",
    look: "Atiku Abubakar",
    said: ["atiku abubakar", "atiku", "waziri adamawa", "abubakar atiku"],
  },
  {
    name: "Peter Obi",
    party: "LP",
    role: "Labour Party candidate, 2023 presidential election",
    look: "Peter Obi",
    said: ["peter gregory obi", "peter obi", "mr obi"],
  },
  {
    name: "Rabiu Kwankwaso",
    party: "NNPP",
    role: "NNPP candidate, 2023 presidential election",
    look: "Rabiu Kwankwaso",
    said: ["rabiu musa kwankwaso", "rabiu kwankwaso", "kwankwaso"],
  },
];

export const BODIES = [
  {
    name: "INEC",
    role: "The body that runs Nigerian elections and declares the result",
    look: "Independent National Electoral Commission",
    said: ["independent national electoral commission", "inec", "the electoral commission", "the commission"],
  },
  {
    name: "BVAS",
    role: "The device that accredits a voter at the polling unit",
    look: "Bimodal Voter Accreditation System",
    said: ["bimodal voter accreditation system", "bvas", "the accreditation machine"],
  },
  {
    name: "IReV",
    role: "Where polling unit result sheets are published",
    look: "INEC Result Viewing Portal",
    said: ["result viewing portal", "irev", "i rev"],
  },
];

/* Everything above, in one list, longest phrase first so "Atiku Abubakar"
   is never swallowed by the "atiku" sitting inside it. */
const ALL = [...PEOPLE, ...BODIES].flatMap((entry) =>
  entry.said.map((phrase) => ({ entry, phrase }))
).sort((a, b) => b.phrase.length - a.phrase.length);

/** Who or what a sentence names, or null. */
export function findPerson(normalised) {
  const hit = ALL.find(({ phrase }) => normalised.includes(phrase));
  return hit?.entry ?? null;
}

/** Everyone a sentence names, in the order they appear. */
export function findEveryone(normalised) {
  const found = [];
  for (const { entry } of ALL) {
    if (found.includes(entry)) continue;
    if (ALL.some(({ entry: e, phrase }) => e === entry && normalised.includes(phrase))) {
      found.push(entry);
    }
  }
  return found;
}
