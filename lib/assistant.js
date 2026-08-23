import { states2023, parties, others } from "./election2023.js";
import { ZONES } from "./zones.js";
import { findPerson } from "./people.js";
import { EFFECTS, MEANS } from "./factors.js";
import {
  FACTOR_ROWS,
  battlegrounds,
  byZone,
  opportunities,
  project,
  turnoutSensitivity,
  winCondition,
} from "./forecast.js";

/**
 * Poll360 AI, the answering half.
 *
 * ── WHY THIS IS NOT A LANGUAGE MODEL ───────────────────────────────────────
 * A model asked "what was the turnout in Kano" will answer confidently
 * whether or not it knows, and on a broadcast desk a confident wrong figure
 * is the worst thing the product could produce. So every answer here is
 * computed from the same modules the screens are drawn from: ask about Kano
 * and it reads the Kano row, ask about the projection and it runs the
 * projection. If it cannot find the figure it says so rather than inventing
 * one, and it never returns a number the screen behind it would contradict.
 *
 * The tradeoff is real and worth stating: it understands a narrower range of
 * phrasings than a model would. That is the right side of the trade for a
 * room that has to read the answer out on air.
 *
 * ── WHAT IT KNOWS ──────────────────────────────────────────────────────────
 *   • Every declared 2023 figure, nationally, by state, by party, by zone.
 *   • The live projection, including whatever the room has the sliders set to.
 *   • Every synthetic modelling input, always labelled as generated.
 *   • Every metric, screen and piece of vocabulary in the product, in plain
 *     English, which is the part somebody new to the room actually needs.
 * ───────────────────────────────────────────────────────────────────────────
 */

const ALL = [...parties, others];

/* ── formatting, tuned for being read aloud ───────────────────────────────── */

/** Large numbers spoken as people say them. "8.8 million", not eight million eight hundred and six thousand. */
export function say(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)} million`;
  return n.toLocaleString("en-NG");
}

const pct = (value) => `${(Number(value) || 0).toFixed(1)}%`;

export const normalise = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9%+. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ── who and where the question is about ──────────────────────────────────── */

const STATE_ALIAS = {
  abuja: "FCT",
  fct: "FCT",
  "federal capital territory": "FCT",
  "cross rivers": "Cross River",
  "akwa ibom state": "Akwa Ibom",
  nassarawa: "Nasarawa",
};

export function findState(text) {
  const q = normalise(text);

  for (const [alias, target] of Object.entries(STATE_ALIAS)) {
    if (q.includes(alias)) {
      return states2023.find((s) => s.code === target || s.name === target) ?? null;
    }
  }

  /* Longest name first, so "Cross River" is never swallowed by a shorter
     match sitting inside it. */
  const ranked = [...states2023].sort((a, b) => b.name.length - a.name.length);
  return ranked.find((state) => q.includes(normalise(state.name))) ?? null;
}

export function findParty(text) {
  const q = normalise(text);
  const surname = { tinubu: "APC", atiku: "PDP", abubakar: "PDP", obi: "LP", kwankwaso: "NNPP" };

  for (const [name, id] of Object.entries(surname)) {
    if (q.includes(name)) return ALL.find((p) => p.id === id);
  }
  for (const party of parties) {
    if (new RegExp(`\\b${party.id.toLowerCase()}\\b`).test(q)) return party;
    if (q.includes(normalise(party.name))) return party;
  }
  if (/\blabour\b/.test(q)) return ALL.find((p) => p.id === "LP");
  return null;
}

function findZone(text) {
  const q = normalise(text);
  return Object.keys(ZONES).find((zone) => q.includes(normalise(zone))) ?? null;
}

/* ── the declared result, read straight off the real table ────────────────── */

function nationalTotals() {
  const votes = ALL.map((_, index) =>
    states2023.reduce((sum, state) => sum + state.votes[index], 0)
  );
  const total = votes.reduce((sum, value) => sum + value, 0);
  const registered = states2023.reduce((sum, state) => sum + state.registered, 0);
  const booths = states2023.reduce((sum, state) => sum + state.booths, 0);
  return { votes, total, registered, booths, turnout: (total / registered) * 100 };
}

function orderOf(votes, total) {
  return ALL.map((party, index) => ({
    party,
    votes: votes[index],
    share: (votes[index] / (total || 1)) * 100,
  })).sort((a, b) => b.votes - a.votes);
}

function stateSentence(state) {
  const order = orderOf(state.votes, state.total);
  const [first, second] = order;
  const margin = first.votes - second.votes;

  return [
    `${state.name} was won by ${first.party.id} with ${say(first.votes)} votes, ${pct(first.share)} of the ${say(state.total)} cast.`,
    `${second.party.id} came second on ${say(second.votes)}, so the margin was ${say(margin)} votes.`,
    `Turnout was ${pct(state.turnout)} of a register of ${say(state.registered)}, across ${say(state.booths)} polling units.`,
  ].join(" ");
}

/* ── the vocabulary of the whole product ──────────────────────────────────── */

/**
 * Everything the product puts on a screen, explained the way you would explain
 * it to somebody who walked into the room this morning.
 *
 * `real` says whether the underlying figure was measured or generated, because
 * that is the question a careful person asks second and it should never take
 * a second question to get it.
 */
export const GLOSSARY = [
  {
    term: "register",
    aka: ["registered voters", "voter register", "pvc"],
    real: true,
    text: "The register is everybody entitled to vote at a polling unit. Nationally it is 93.5 million people. It is the denominator for turnout, so a big register with a small vote is a low turnout, not a small state.",
  },
  {
    term: "accredited",
    aka: ["accreditation", "checked in"],
    real: true,
    text: "Accredited voters are the people who turned up and were verified before voting. It is the ceiling on how many ballots a unit can legitimately produce, which is why a result reporting more votes than accredited voters is rejected outright.",
  },
  {
    term: "rejected ballots",
    aka: ["rejected", "void", "spoilt"],
    real: true,
    text: "Ballots that were cast but could not be counted for anybody, usually because the mark was unclear or fell across two boxes. They come out of the total before shares are worked out.",
  },
  {
    term: "turnout",
    aka: ["how many voted"],
    real: true,
    text: "Votes cast as a share of the register. Nationally in 2023 it was 26.7%, the lowest since 1999. Turnout is the figure most worth watching live, because it moves long before the result does.",
  },
  {
    term: "polling unit",
    aka: ["booth", "pu", "polling units", "booths"],
    real: true,
    text: "The smallest place a vote is counted, a single booth with its own agent. There are 176,623 of them. Everything in this product rolls up from a polling unit, and every figure can be walked back down to one.",
  },
  {
    term: "ward",
    aka: ["wards", "registration area"],
    real: true,
    text: "The level between a polling unit and a local government. A ward groups a few dozen units. Nigeria has 8,809 of them.",
  },
  {
    term: "lga",
    aka: ["local government", "local government area"],
    real: true,
    text: "Local government area, the level between a ward and a state. There are 774. On the map you can drill nation, state, local government, ward, then polling unit, and the numbers add up exactly at every step.",
  },
  {
    term: "density",
    aka: ["voters per booth", "register per unit"],
    real: true,
    text: "The register divided by the number of polling units, so it is how many voters share one booth. Lagos runs above 2,000 and much of the north east under 1,100. High density means longer queues and a slower count, which is an operational warning, not a political one.",
  },
  {
    term: "margin",
    aka: ["lead", "gap"],
    real: true,
    text: "The winner's votes minus the runner up's votes in that place. A small margin is what makes a state worth arguing about, and the analytics screen ranks states by it.",
  },
  {
    term: "quarter state",
    aka: ["25%", "25 percent", "spread", "spread test", "section 134", "two thirds"],
    real: true,
    text: "To be elected president of Nigeria you need two things, not one. The most votes nationally, and at least a quarter of the votes in at least 24 of the 36 states. The second one is the spread test. It exists so a president cannot be elected by one region alone, and it is the thing this product checks that a simple vote total will never show you.",
  },
  {
    term: "run off",
    aka: ["runoff", "second round"],
    real: true,
    text: "If the leading candidate takes the most votes but misses the quarter in 24 states, nobody has won. The law sends it to a second round between the leader and the strongest of the rest. The analytics screen warns the moment a scenario lands there, because it is easy to build one by accident.",
  },
  {
    term: "swing",
    aka: ["uniform national swing", "uns", "shift"],
    real: true,
    text: "A swing moves a party's share by the same number of points in every state, then lets each state's own arithmetic decide what that does. It is deliberately simple. It will not predict a state that behaves unlike itself, and it is honest about that, but it answers the question a room actually asks, which is how much movement it would take.",
  },
  {
    term: "projection",
    aka: ["forecast", "model", "prediction"],
    real: true,
    text: "The projection takes the real 2023 result and applies whatever assumptions are set on screen. It answers what happens if, never what will happen. Every lever set back to nothing returns the real declared result exactly, so there is always a known true anchor one click away.",
  },
  {
    term: "battleground",
    aka: ["close states", "closest", "marginal"],
    real: true,
    text: "A state where the gap between first and second is small enough that ordinary movement could change who wins it. The screen ranks them by how few votes it would actually take.",
  },
  {
    term: "headroom",
    aka: ["did not vote", "non voters", "stayed home"],
    real: true,
    text: "The part of the register that did not vote at all. It is almost always far larger than the pool of voters anybody hopes to persuade, which is why the targeting table ranks it alongside the margin. In 2023 headroom nationally was over 68 million people.",
  },
  {
    term: "votes to flip",
    aka: ["how many votes", "flip"],
    real: true,
    text: "How many votes would have to change hands for a state to change winner. Half the margin plus one, because every vote moved counts twice, once off one side and once onto the other.",
  },
  {
    term: "yield",
    aka: ["votes per booth"],
    real: true,
    text: "Votes to flip divided by the polling units you would have to work. It turns a political target into an operational one, and it is what separates a state that is close from a state that is reachable.",
  },
  {
    term: "zone",
    aka: ["geopolitical zone", "north west", "south east", "region"],
    real: true,
    text: "Nigeria's six geopolitical zones. They are not administrative, but they are how results are read and argued about, so every table here can be collapsed to them.",
  },
  {
    term: "cluster",
    aka: ["clusters", "voter cluster", "hotspot"],
    real: true,
    text: "A concentration of registered voters tight enough to matter operationally. Clusters is where the people are, not how they voted, and the layer keeps those two things apart on purpose.",
  },
  {
    term: "rain risk",
    aka: ["rain", "weather", "climate"],
    real: false,
    text: "The chance of rain during polling hours, and rainfall is the annual total in millimetres. Both are synthetic, generated from each state's real latitude. Rain matters because it suppresses rural turnout hardest, where the walk to the booth is longest.",
  },
  {
    term: "security pressure",
    aka: ["security", "insecurity", "violence"],
    real: false,
    text: "A zero to one hundred reading of how much pressure a state's polling is under, higher being worse. The baseline is synthetic, shaped so the north east and north west carry the load they are known to, and the live incident feed sits on top of it. It is the strongest single depressant on turnout in the model.",
  },
  {
    term: "hardship",
    aka: ["economy", "economic", "cost of living"],
    real: false,
    text: "A zero to one hundred reading of economic pressure, higher being worse. Synthetic, tilted by urbanisation because the cash economy and the informal one behave differently under strain. It cuts both ways in real life, anger mobilises and the cost of getting there suppresses, so the model nets it to a mild depressant and says so.",
  },
  {
    term: "urbanisation",
    aka: ["urban", "city"],
    real: true,
    text: "The share of a state that is urban, worked out from real voter density against the national mean. Urban states turn out slightly better, because journeys are shorter, booths are denser and there are more observers per square kilometre.",
  },
  {
    term: "under 30",
    aka: ["young", "youth", "age"],
    real: false,
    text: "The share of the population under thirty. Synthetic, built along the real north to south axis because the north genuinely is younger. Young populations register heavily and historically attend less, so the model treats it as a small net positive at 2023 levels.",
  },
  {
    term: "religion",
    aka: ["muslim", "christian", "faith"],
    real: false,
    text: "A coarse Muslim and Christian split per state. This one is synthetic and it is the figure most likely to be misread as fact, so it is rounded hard to whole percent and labelled everywhere it appears. It is not a census and it must never be quoted as one.",
  },
  {
    term: "population",
    aka: ["how many people", "census"],
    real: false,
    text: "Synthetic, generated from the real register and latitude. Nigeria has not completed a census since 2006, so nobody has this figure, including us. It is here so the model has a population lever, and it is labelled generated wherever it appears.",
  },
  {
    term: "synthetic",
    aka: ["generated", "mock", "fake", "is this real", "data real", "real data", "made up", "invented"],
    real: true,
    text: "Synthetic means the figure was generated for demonstration rather than measured. Population, religion, climate, security and hardship are synthetic here. Every other figure, the register, the booths, the turnout, the votes, is the real declared 2023 result. The two are never blended into one confident number, and every synthetic figure carries the word on screen, because a room that cannot tell which is which cannot tell how much to believe.",
  },
  {
    term: "ledger",
    aka: ["blockchain", "hash chain", "payments", "wallet"],
    real: true,
    text: "Every payment to an agent is written into a chain where each entry carries the fingerprint of the entry before it. Change one figure anywhere in the history and every fingerprint after it stops matching, and a single pass finds exactly which row was touched. Nobody, including whoever runs the database, can quietly alter what an agent was paid. That is the useful half of what people mean by blockchain, and it needs no coin and no network.",
  },
  {
    term: "withdrawal",
    aka: ["withdraw", "cash out", "stipend"],
    real: true,
    text: "An agent can request a withdrawal, which is recorded as spoken for and does not move the balance until somebody settles it. Payments are pseudonymous on screen, a stable reference rather than a name, so a ledger can be shown in a room without exposing who is being paid, while the mapping stays inside the system and fully auditable.",
  },
  {
    term: "integrity screening",
    aka: ["anomaly", "anomalies", "fraud", "checks"],
    real: true,
    text: "Every return is screened the moment it lands, in four classes. Impossible, where the arithmetic cannot be true, such as more votes than accredited voters. Implausible, where it could be true but almost never is, such as a hundred percent turnout. Outlier, where a unit is far from its neighbours. And pattern, where the digits themselves look authored rather than counted. Nothing is ever deleted. A disputed return is flagged and kept, because deleting it would be the most suspicious thing the system could do.",
  },
  {
    term: "outlier",
    aka: ["z score", "standard deviation"],
    real: true,
    text: "A unit whose figure sits far away from what its neighbours reported. We measure the distance in standard deviations, so the threshold means the same thing in a dense Lagos ward and a thin Yobe one, rather than being a fixed number that is too tight in one and too loose in the other.",
  },
  {
    term: "last digit test",
    aka: ["digit", "chi squared", "pattern test"],
    real: true,
    text: "In a genuine count, the last digit of a vote total is essentially random, so all ten digits should appear about equally often. Invented figures are not random, people favour some digits and round to others. We test the spread of last digits across a batch and flag it only when the odds against it being chance are more than a thousand to one, because at that threshold it is a question worth asking rather than an accusation.",
  },
  {
    term: "audit trail",
    aka: ["audit", "who did what"],
    real: true,
    text: "Every action that changes anything is written down with who did it, when, and from where. Results are never edited in place, a correction is a new version and the original stays readable. If somebody asks in six months why a figure changed, the answer is on the record rather than in somebody's memory.",
  },
  {
    term: "gps matching",
    aka: ["location", "gps", "geolocation"],
    real: true,
    text: "When an agent opens the app it reads their position and matches it against the polling unit they are assigned to. If they are not where the unit is, the return is marked before anybody has to notice it by hand. It is a check, not a lock, because a phone can be wrong and an agent standing thirty metres outside a school gate is still the right agent.",
  },
  {
    term: "roles",
    aka: ["permissions", "who can see", "capability"],
    real: true,
    text: "There are four kinds of account. The super administrator runs the system. Coordinators file returns from polling units. Broadcast desks read cleared figures for air. Situation rooms watch everything live. What each can do is a fixed list checked on the server for every single page, so a link pasted into the wrong hands opens nothing.",
  },
  {
    term: "encryption",
    aka: ["security", "hacking", "password", "session"],
    real: true,
    text: "Passwords are never stored, only a slow one way fingerprint of them, so a stolen copy of the database gives an attacker nothing to sign in with. Session tokens are stored the same way. The cookie itself carries nothing at all, no name, no role, which means disabling an account takes effect on the very next click rather than whenever a token happens to expire.",
  },
  {
    term: "alarm",
    aka: ["alert", "sound", "bell"],
    real: true,
    text: "The situation room can arm an audible alarm, so a desk that is not being watched still gets attention when something serious lands. It rehearses on a short cycle while armed, so the room knows it works before it matters.",
  },
  {
    term: "offline",
    aka: ["pwa", "install", "no network"],
    real: true,
    text: "Poll360 installs to a phone or a desktop like an app, and it keeps working when the network does not. Pages are served from the network when there is one and from the device when there is not, which is the ordinary condition at a polling unit rather than the exception.",
  },
  {
    term: "divergence",
    aka: ["gap", "declared", "our count against", "mismatch", "parallel count"],
    real: true,
    text: "Divergence is the difference between what we counted and what was declared for the same place. Two people wrote down the same sheet and wrote different things: which figure moved, by how much, and did the movement change who won. It is a different question from whether a return can be true on its own terms, and it is the whole reason a parallel count exists.",
  },
  {
    term: "coverage trap",
    aka: ["coverage", "how much is in", "partial"],
    real: true,
    text: "Comparing our total against a declared total only means something if we counted the same booths. Early in the night we hold a fraction of them, so the gap is mostly missing coverage rather than disagreement. Every comparison here is scoped to the units both sides actually have, and the coverage is printed beside it, because a difference quoted without it is not evidence of anything.",
  },
  {
    term: "whatsapp",
    aka: ["bot", "chat", "filing over whatsapp"],
    real: true,
    text: "Agents file from the phone they already own, over the app they already use, on the data plan they already have. Ask somebody to install an app, make an account and learn a form and a proportion of them simply will not file. Ask them to send a message and they already know how. The bot walks them through a return, accepts a photograph of the sheet, and takes their location.",
  },
  {
    term: "sheet reader",
    aka: ["photograph", "ocr", "reads the sheet", "vision"],
    real: true,
    text: "An agent photographs the result sheet and it is read automatically: registered, accredited, rejected, every party, and the presiding officer's name. Nothing is filed from it. Every figure is read back and only counted once the agent confirms, because a reader confuses 3 and 8 on a creased form under a torch. What the machine proposed is kept beside what the human accepted, so the difference is on the record.",
  },
  {
    term: "registry",
    aka: ["polling unit registry", "unit tree", "hierarchy"],
    real: true,
    text: "A polling unit registers itself the moment its first return arrives, so the registry records what has actually reported rather than a preloaded list of everywhere that might. The hierarchy comes free: the code carries its own address, so 08/03/07/012 is state, local government, ward, unit. Every level agrees with the one below it because nothing is stored twice.",
  },
  {
    term: "election project",
    aka: ["projects", "switch election", "another election", "reset"],
    real: true,
    text: "Everything is scoped to an election project. A room that can hold only one election has to be wiped to run a second, and a governorship the week after a presidential race is the ordinary case. Nothing is ever cleared: a new project is empty because nothing has been filed against it, and every result from the last one is still there, one switch away.",
  },
  {
    term: "coordinator location",
    aka: ["where are the agents", "trail", "position"],
    real: true,
    text: "A coordinator shares their location in WhatsApp and it lands on the map within seconds. It is kept as a trail rather than one current position: a single fix answers whether they are there, the trail answers whether they arrived, when, and whether they have moved since, which is the question at two in the morning.",
  },
  {
    term: "colour",
    aka: ["colours", "colour blind", "colourblind", "accessibility"],
    real: true,
    text: "Party colours were checked against red green colour blindness, and two of them are genuinely hard to tell apart under it. Rather than pretend otherwise, every place colour carries meaning also carries a pattern and a label, and every chart has a table behind it that needs no colour at all.",
  },
];

const GLOSSARY_INDEX = GLOSSARY.map((entry) => ({
  entry,
  keys: [entry.term, ...(entry.aka ?? [])].map(normalise),
}));

function lookUp(text) {
  const q = normalise(text);
  let best = null;

  for (const { entry, keys } of GLOSSARY_INDEX) {
    for (const key of keys) {
      if (q.includes(key) && (!best || key.length > best.length)) best = { entry, length: key.length, key };
    }
  }

  return best?.entry ?? null;
}

/**
 * The screens, so somebody can ask what they are looking at.
 *
 * Keyed by the word a person would say. The tab values the shell uses are not
 * always that word, "register" is the Voters tab and "density" is Clusters, so
 * they are mapped rather than assumed to line up.
 */
const TAB_WORD = {
  register: "voters",
  density: "clusters",
  watch: "coordinators",
  stream: "reports",
};

const SCREENS = {
  admin: "The administrator's overview answers four questions in the order they are actually asked on the night: how much is in, is any of it wrong, who is asking to be let in, and who did what. Every return is screened as it lands, and the payment ledger is proved from its first entry on every single load.",
  broadcast: "The broadcast desk is the only screen built to be read out loud. Every figure carries the share of booths it rests on, because a total without its coverage is a number that can be quoted against you later. Nothing on it is a projection.",
  field: "The coordinator screen is one booth, one return. The figures are checked as you type and again when they arrive, the polling unit is printed rather than chosen from a list, and the account statement is derived from the ledger on every read rather than stored.",
  gap: "The divergence room holds our count against the commission's declared figures. That is what a parallel vote tabulation is actually for: not speed, but a second independently sourced number for the same booths, so when a figure is announced there is something to hold it against other than trust.",
  results: "The results layer is the declared count, drilled from the nation down to a single polling unit. Click anywhere and you get every party's figure for that place, not just whoever is leading, because the leader alone hides whether it was fifty one to forty nine or eighty to twenty.",
  voters: "The voters layer is the register, where the people entitled to vote actually are. It has nothing to do with how anybody voted, and it deliberately does not borrow the results colours, so the two can never be confused at a glance.",
  turnout: "The turnout layer is the share of the register that has voted so far, updating live as returns land. It is the earliest honest signal of the night, and it moves hours before the result does.",
  clusters: "The clusters layer finds concentrations of registered voters tight enough to matter operationally, so a room can see where the queues, the pressure and the risk are going to be before they are.",
  coordinators: "The coordinator watch is every agent on a map at their real coordinates, showing who is on station, who has filed, and who has gone quiet. Somebody going quiet is the signal, and the map is how you notice it in time.",
  reports: "The situation feed is what is happening right now at polling units, with photographs and video attached, running newest first. It is the difference between knowing a figure looks wrong and knowing why.",
  analytics: "Analytics is the projection. Set the assumptions at the top, watch the win condition, the closest states, the zones and the targeting table respond. Every lever back to nothing returns the real 2023 result exactly.",
  planning: "The planning map starts blank on purpose. Select states, local governments and wards to build a deployment, and it totals the polling units, the agents and the share of the register you would be covering as you go, then exports it.",
};

/* ── the skills, tried in order ───────────────────────────────────────────── */

const SKILLS = [
  {
    id: "identity",
    test: (q) => /\b(who|what) are you\b|your name|hi poll360|hello|hey there/.test(q),
    answer: () => ({
      text: "I am Poll360 AI. I answer from the same data the screens are drawn from, the declared 2023 result, the live projection, and every metric in the product. If I do not have a figure I will tell you, rather than guess at it. Ask me about a state, a party, a number on screen, or any word you have seen and do not recognise.",
    }),
  },
  {
    id: "help",
    test: (q) => /what can you (do|answer)|help me|how do i use you|what do you know/.test(q),
    answer: () => ({
      text: "Four things. Results, ask who won anywhere from the nation down to a polling unit. Analysis, ask what the projection says, what the closest states are, or what would happen if a party gained points. Data, ask what any figure on screen means and whether it is real or generated. And the product itself, ask how the integrity checks work, how the payment ledger works, or what any screen is for.",
      follow: ["Who won Kano", "What does the projection say", "What is a quarter state", "How do you catch fraud"],
    }),
  },
  {
    id: "national",
    test: (q) =>
      /\b(who won|national result|overall result|final result|the election)\b/.test(q) && !findState(q),
    answer: () => {
      const totals = nationalTotals();
      const order = orderOf(totals.votes, totals.total);
      const outcome = winCondition(project({}));
      const leader = outcome[0];

      return {
        text: [
          `${order[0].party.id} won the 2023 presidential election. ${order[0].party.candidate ?? ""} took ${say(order[0].votes)} votes, ${pct(order[0].share)}.`,
          `${order[1].party.id} had ${say(order[1].votes)} and ${order[2].party.id} had ${say(order[2].votes)}.`,
          `On the spread test the winner cleared a quarter of the vote in ${leader.quarterStates} states, and 24 were needed, so the result stood without a run off.`,
          `Turnout was ${pct(totals.turnout)}, the lowest since 1999.`,
        ].join(" "),
        follow: ["What is a quarter state", "Which states were closest", "How did LP do"],
      };
    },
  },
  {
    id: "state",
    test: (q, ents) => Boolean(ents.state),
    answer: (q, ents) => {
      const state = ents.state;
      const factor = FACTOR_ROWS.find((row) => row.code === state.code);

      /* A question that named a state and a factor wants the factor, not the
         result, and getting that the wrong way round is the most annoying
         thing an assistant can do. */
      const term = lookUp(q);
      if (term && !term.real && factor) {
        const value = {
          "rain risk": `${factor.rainRisk}% chance of rain during polling, with ${say(factor.rainfall)} millimetres of rain a year`,
          "security pressure": `security pressure of ${factor.security} out of 100`,
          hardship: `hardship of ${factor.hardship} out of 100`,
          "under 30": `${factor.under30}% of the population under thirty`,
          religion: `roughly ${factor.religion.muslim}% Muslim and ${factor.religion.christian}% Christian`,
          population: `a modelled population of ${say(factor.population)}`,
        }[term.term];

        if (value) {
          return {
            text: `${state.name} has ${value}. That figure is synthetic, generated for demonstration from the real register, zone and latitude. It is not a measurement and should not be quoted as one. ${state.name}'s real numbers are a register of ${say(state.registered)} across ${say(state.booths)} polling units.`,
            synthetic: true,
          };
        }
      }

      if (/turnout/.test(q)) {
        return {
          text: `Turnout in ${state.name} was ${pct(state.turnout)}. That is ${say(state.total)} votes cast from a register of ${say(state.registered)}, which leaves ${say(state.registered - state.total)} people who did not vote.`,
        };
      }

      if (/register|how many voters|electorate/.test(q)) {
        return {
          text: `${state.name} has a register of ${say(state.registered)} voters across ${say(state.booths)} polling units, which is about ${say(Math.round(state.registered / state.booths))} voters to a booth.`,
        };
      }

      if (ents.party) {
        const index = ALL.findIndex((p) => p.id === ents.party.id);
        const votes = state.votes[index] ?? 0;
        const order = orderOf(state.votes, state.total);
        const place = order.findIndex((row) => row.party.id === ents.party.id) + 1;
        const ordinal = ["", "first", "second", "third", "fourth", "fifth"][place] ?? `${place}th`;
        return {
          text: `${ents.party.id} took ${say(votes)} votes in ${state.name}, ${pct((votes / (state.total || 1)) * 100)}, finishing ${ordinal}. The state was won by ${order[0].party.id}.`,
        };
      }

      return { text: stateSentence(state), follow: [`Turnout in ${state.name}`, `Security in ${state.name}`] };
    },
  },
  {
    id: "zone",
    test: (q, ents) => Boolean(ents.zone),
    answer: (q, ents, ctx) => {
      const row = byZone(ctx.projection ?? project({})).find((z) => z.zone === ents.zone);
      if (!row) return null;
      return {
        text: `The ${row.zone} covers ${row.states} states with a register of ${say(row.registered)}. ${say(row.votesCast)} votes were cast there, a turnout of ${pct(row.turnout)}. ${row.leader} led the zone by ${pct(row.margin)}.`,
      };
    },
  },
  {
    id: "what-if",
    /* "where could APC gain" and "what if APC gained six points" share a verb
       and want completely different answers. A question opening with "where"
       is asking for places, so it is left to the targeting skill below. */
    test: (q) =>
      !/^where\b|\bwhere (could|should|can|would)\b/.test(q) &&
      /what if|suppose|scenario|\b(gain|gains|gained|lose|loses|lost|drop|drops|dropped)\b/.test(q),
    answer: (q, ents) => {
      const points = Number((q.match(/(\d+(?:\.\d+)?)\s*(?:point|percent|%)/) ?? [])[1] ?? 5);
      const party = ents.party ?? ALL.find((p) => p.id === "LP");
      const direction = /\b(lose|loses|lost|drop|drops|dropped|down|fell|falls)\b/.test(q) ? -1 : 1;

      /* The points have to come from somewhere, so they are taken evenly off
         the other three. A swing that only adds is not a swing. */
      const swing = {};
      for (const other of parties) swing[other.id] = 0;
      swing[party.id] = direction * points;
      for (const other of parties) {
        if (other.id !== party.id) swing[other.id] = (-direction * points) / (parties.length - 1);
      }

      const outcome = winCondition(project({ swing }));
      const leader = outcome[0];
      const target = outcome.find((p) => p.id === party.id);

      return {
        text: [
          `If ${party.id} ${direction > 0 ? "gained" : "lost"} ${points} points evenly across the country, taken ${direction > 0 ? "off" : "onto"} the other three,`,
          `${party.id} would be on ${pct(target.share)} and win ${target.states} states, clearing the quarter in ${target.quarterStates}.`,
          `${leader.id} would lead nationally.`,
          leader.spreadPlain
            ? "That still clears the spread test."
            : `Nobody would clear the spread test, so it would go to a run off. That is the point worth making: leading the vote is not the same as winning.`,
        ].join(" "),
      };
    },
  },
  {
    id: "targeting",
    test: (q) => /where (could|should|can|would)|target|worth working|flip|opportunit/.test(q),
    answer: (q, ents, ctx) => {
      const party = ents.party ?? parties[0];
      const rows = opportunities(ctx.projection ?? project({}), party.id).slice(0, 4);
      return {
        text:
          `For ${party.id}, the best places to work are ${rows.map((row) => `${row.name}, ${say(row.votesToFlip)} votes across ${say(row.booths)} units`).join("; ")}. ` +
          `${rows[0].name} is first because it needs about ${rows[0].yield} votes per polling unit, and there are still ${say(rows[0].headroom)} people on the register there who did not vote at all.`,
      };
    },
  },
  {
    id: "person",
    /**
     * ── A PERSON IS NOT A SHORTHAND FOR THEIR PARTY ──────────────────────
     * Asking about Atiku Abubakar used to return the PDP's national vote
     * total. That is a true sentence answering a question nobody asked: a
     * person has a name, a role and a history, none of which is a column in
     * a results table.
     *
     * So the person is answered as a person first, and their party's figures
     * follow because that is what this product can actually tell you about
     * them. What it cannot tell you — who they are, what they look like —
     * comes from outside and arrives on the board beside this, labelled as
     * having come from somewhere else.
     */
    test: (q) => Boolean(findPerson(q)),
    answer: (q) => {
      const person = findPerson(q);
      const party = person.party ? ALL.find((entry) => entry.id === person.party) : null;

      if (!party) {
        return {
          text: `${person.name}. ${person.role}. That is what this product holds on them; anything more is on the board from an outside source.`,
          follow: ["Who won the election", "What is a quarter state"],
        };
      }

      const index = ALL.findIndex((entry) => entry.id === party.id);
      const totals = nationalTotals();
      const votes = totals.votes[index];
      const share = (votes / (totals.total || 1)) * 100;
      const won = states2023.filter(
        (state) => orderOf(state.votes, state.total)[0].party.id === party.id
      );

      return {
        text: [
          `${person.name}, ${person.role}.`,
          /* No pronoun. Every candidate in this table happens to be a man,
             which is exactly the kind of thing that gets hard-coded and then
             quietly breaks the first time it is not true. The sentence reads
             the same without one. */
          `Stood for ${party.id}, and took ${say(votes)} votes nationally, ${pct(share)}.`,
          won.length
            ? `Led in ${won.length} state${won.length === 1 ? "" : "s"}: ${won.slice(0, 6).map((state) => state.name).join(", ")}${won.length > 6 ? " and others" : ""}.`
            : `Did not lead in any state.`,
        ].join(" "),
        follow: [`Where could ${party.id} gain`, "Which states were closest", "Who won the election"],
      };
    },
  },
  {
    id: "party",
    test: (q, ents) => Boolean(ents.party),
    answer: (q, ents) => {
      const party = ents.party;
      const index = ALL.findIndex((p) => p.id === party.id);
      const totals = nationalTotals();
      const votes = totals.votes[index];
      const won = states2023.filter(
        (state) => orderOf(state.votes, state.total)[0].party.id === party.id
      );
      const outcome = winCondition(project({})).find((p) => p.id === party.id);

      return {
        text: [
          `${party.name}, ${party.id}, took ${say(votes)} votes nationally in 2023, ${pct((votes / totals.total) * 100)}.`,
          party.candidate ? `Their candidate was ${party.candidate}.` : "",
          `They won ${won.length} ${won.length === 1 ? "state" : "states"}${won.length && won.length <= 6 ? `, ${won.map((s) => s.name).join(", ")}` : ""}.`,
          outcome ? `They cleared a quarter of the vote in ${outcome.quarterStates} states, against the 24 the constitution asks for.` : "",
        ].filter(Boolean).join(" "),
        follow: [`Where could ${party.id} gain`, "What is a quarter state"],
      };
    },
  },
  {
    id: "win-condition",
    test: (q) => /win condition|25|quarter|spread|run.?off|section 134|two thirds/.test(q),
    answer: (q, ents, ctx) => {
      const outcome = winCondition(ctx.projection ?? project({}));
      const leader = outcome[0];
      const passes = outcome.some((party) => party.spreadPlain);

      return {
        text: [
          "To win outright you need the most votes nationally and at least a quarter of the vote in at least 24 of the 36 states. The second test is the one people forget.",
          `On what is on screen now, ${leader.id} leads with ${pct(leader.share)} and clears the quarter in ${leader.quarterStates} states.`,
          passes
            ? "That clears the spread test, so it stands."
            : `That is ${leader.shortBy} short, so nobody has won and it goes to a run off between the top two.`,
        ].join(" "),
      };
    },
  },
  {
    id: "closest",
    test: (q) => /closest|battleground|marginal|tight|narrow|close states/.test(q),
    answer: (q, ents, ctx) => {
      const rows = battlegrounds(ctx.projection ?? project({}), 8).slice(0, 5);
      if (!rows.length) return { text: "Nothing is inside eight points on the current assumptions, so there are no battlegrounds to report." };
      return {
        text:
          `The closest states are ${rows.map((row) => `${row.name}, ${row.winner} over ${row.runnerUp} by ${pct(row.margin)}`).join("; ")}. ` +
          `${rows[0].name} is the tightest, and it would take about ${say(Math.round((rows[0].votesCast * rows[0].margin) / 200))} votes changing hands to turn it.`,
      };
    },
  },
  {
    id: "sensitivity",
    test: (q) => /sensitiv|if turnout|turnout (were|was|goes|rises|falls)/.test(q),
    answer: () => {
      const rows = turnoutSensitivity({});
      return {
        text: `Across turnout from ${rows[0].label} to ${rows[rows.length - 1].label} of the 2023 level, the winner does not change, and the national share barely moves. That is worth knowing: on these numbers the outcome is not a turnout story, it is a preference story. Turnout changes how many votes it takes to move a state, not who is ahead.`,
      };
    },
  },
  {
    id: "levers",
    test: (q) => /lever|condition|what moves turnout|affects turnout/.test(q),
    answer: () => ({
      text:
        "Five conditions move turnout in the model. " +
        Object.values(EFFECTS)
          .map((effect) => `${effect.label}, ${effect.turnout > 0 ? "up" : "down"} ${Math.abs(effect.turnout)} points per twenty above the national mean`)
          .join(". ") +
        ". Those coefficients are assumptions, not findings, and they are printed on screen precisely so the room can argue with them rather than guess what the model believes.",
      synthetic: true,
    }),
  },
  {
    id: "screen",
    test: (q) =>
      /what is (the )?(this )?(tab|screen|layer|panel|map)|what am i looking at|what does this( \w+)? show|explain this (tab|screen|layer|page)|what does this (tab|screen|layer|page) do/.test(q),
    answer: (q, ents, ctx) => {
      const named = Object.keys(SCREENS).find((key) => q.includes(key));
      const key = named ?? TAB_WORD[ctx.tab] ?? ctx.tab ?? "results";
      return { text: SCREENS[key] ?? SCREENS.results };
    },
  },
  {
    id: "glossary",
    test: (q) => Boolean(lookUp(q)),
    answer: (q) => {
      const entry = lookUp(q);
      return {
        text: entry.real
          ? entry.text
          : `${entry.text} To be clear, that one is synthetic, generated for demonstration rather than measured.`,
        synthetic: !entry.real,
      };
    },
  },
];

/**
 * Whether a sentence is about this product's world at all.
 *
 * ── WHY THIS DECIDES WHETHER TO GO OUTSIDE ─────────────────────────────────
 * "I do not have that one" covers two completely different situations that
 * were being treated as one, with an embarrassing result: ask something about
 * the count that this module simply failed to parse, and it would give up and
 * read out an encyclopaedia article instead. A room asking about a Nigerian
 * state got a Wikipedia summary of that state, in place of the declared
 * figures sitting in memory a function call away.
 *
 * The two are easy to tell apart, and this is the test: does the sentence
 * mention anything this product knows about — a state, a party, a candidate,
 * a zone, or any term in its own vocabulary? If it does, an unknown answer
 * means the phrasing was not understood, and the honest reply is to say so
 * and let the person rephrase. Only a sentence with nothing of ours in it at
 * all is a sentence worth going outside for.
 */
export function knowsAbout(text) {
  const raw = String(text ?? "");
  return Boolean(findState(raw) || findParty(raw) || findZone(raw) || lookUp(raw));
}

/**
 * Answer a question.
 *
 * @param question what was asked, typed or spoken
 * @param context  what the room is looking at: the live projection and the
 *                 open tab, so "what does this show" and "is that a run off"
 *                 answer about the screen in front of them rather than a
 *                 default
 */
export function ask(question, context = {}) {
  const raw = String(question ?? "").trim();
  if (!raw) return { text: "I did not catch that. Ask again, or type it.", kind: "empty" };

  const q = normalise(raw);
  const entities = { state: findState(raw), party: findParty(raw), zone: findZone(raw) };

  for (const skill of SKILLS) {
    if (!skill.test(q, entities)) continue;
    const answer = skill.answer(q, entities, context);
    if (answer) return { kind: skill.id, follow: [], ...answer };
  }

  return {
    kind: "unknown",
    text: "I do not have that one, and I would rather say so than guess. I can answer on any state or party, the projection and the win condition, the closest states, where a party could gain, and what any figure on screen means.",
    follow: ["Who won the election", "Which states were closest", "What is a quarter state", "Is this data real"],
  };
}

/** Openers offered before anybody has asked anything. */
export const STARTERS = [
  "Who won the election",
  "What does the projection say",
  "Which states were closest",
  "What is a quarter state",
  "Is this data real",
  "How do you catch fraud",
];
