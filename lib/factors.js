import { states2023 } from "./election2023.js";
import { ZONES } from "./zones.js";

/**
 * Modelling factors, per state.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY FIGURE IN THIS FILE IS SYNTHETIC. IT IS NOT A CENSUS.
 *
 *  Population, religious composition, rainfall, security pressure and
 *  economic conditions here are MODEL INPUTS generated for demonstration.
 *  They are not measurements of Nigeria and must never be quoted, exported,
 *  broadcast or cited as though they were. Every surface that renders them
 *  is required to carry the word "synthetic".
 *
 *  They were requested so the projection has a full set of levers to move.
 *  They are built to be *coherent* rather than *true*: derived from things
 *  that are real (the register, the geopolitical zone, the declared result,
 *  latitude) so the pattern they form is plausible and internally consistent,
 *  and so a scenario built on them behaves the way a real one would. That is
 *  the honest most a generated dataset can be.
 *
 *  Replace this file with a licensed source and nothing downstream changes:
 *  the shape of each row is the contract.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const SYNTHETIC = true;

/** Deterministic, so a state's profile never changes between two readings. */
function seeded(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

const ZONE_OF = {};
for (const [zone, codes] of Object.entries(ZONES)) for (const code of codes) ZONE_OF[code] = zone;

/* Each state's approximate latitude, in degrees north.
   Recovered once from the projected boundary file and written out here so this
   module needs no map at runtime: it is real geography, it never changes, and
   embedding it keeps a JSON import out of a file that both Next and plain node
   have to be able to load. */
const LATITUDE = {
  ABI: 5.39,
  ADA: 9.36,
  AKW: 5.05,
  ANA: 6.15,
  BAU: 10.99,
  BAY: 4.88,
  BEN: 7.08,
  BOR: 11.9,
  CRO: 5.78,
  DEL: 5.68,
  EBO: 6.23,
  EDO: 6.58,
  EKI: 7.71,
  ENU: 6.53,
  FCT: 8.8,
  GOM: 10.23,
  IMO: 5.57,
  JIG: 11.9,
  KAD: 10.53,
  KAN: 11.53,
  KAT: 11.97,
  KEB: 11.35,
  KOG: 7.66,
  KWA: 8.81,
  LAG: 6.5,
  NAS: 8.47,
  NIG: 10.23,
  OGU: 6.95,
  OND: 6.83,
  OSU: 7.55,
  OYO: 7.75,
  PLA: 9.22,
  RIV: 4.8,
  SOK: 12.43,
  TAR: 8.1,
  YOB: 11.95,
  ZAM: 11.8,
};

/**
 * Northern-ness, 0 to 1, from the state's real position.
 *
 * Used as the spine of the synthetic profile because it is the one axis along
 * which Nigerian rainfall, age structure and religious composition genuinely
 * do vary, and building along it keeps the generated data from contradicting
 * anything a Nigerian reader already knows.
 */
function northness(code) {
  const lat = LATITUDE[code];
  if (lat == null) return 0.5;
  return Math.min(1, Math.max(0, (lat - 4.2) / (13.9 - 4.2)));
}

export function buildFactors() {
  return states2023.map((state) => {
    const north = northness(state.code);
    const jitter = seeded(state.code);
    const zone = ZONE_OF[state.code] ?? "Unzoned";

    /* Population: the register is the only real anchor available. Nigeria's
       register covers roughly half the population, and the ratio is higher in
       the south where registration drives are older, so the multiplier tilts
       with latitude rather than being flat. */
    const perRegistered = 1.9 + north * 0.5 + jitter * 0.15;
    const population = Math.round(state.registered * perRegistered);

    /* Age: the north is markedly younger. Share of the population under 30. */
    const under30 = 0.52 + north * 0.13 + jitter * 0.03;

    /* Religion: the one figure most likely to be misread as fact, so it is
       generated as a coarse three-way split along the same real axis and
       rounded hard to whole percent, which signals estimate rather than
       measurement. */
    const muslim = Math.round((0.08 + north * 0.82 + (jitter - 0.5) * 0.08) * 100);
    const christian = Math.round((0.88 - north * 0.8 + (jitter - 0.5) * 0.08) * 100);
    const other = Math.max(0, 100 - muslim - christian);

    /* Climate: annual rainfall falls sharply northward. Polling-day rain risk
       is what actually matters, and February is dry season in the north and
       the tail of it in the south. */
    const rainfall = Math.round(2600 - north * 2100 + (jitter - 0.5) * 200);
    const rainRisk = Math.round(Math.max(2, (1 - north) * 34 + (jitter - 0.5) * 8));

    /* Urbanisation, from voter density against the national mean. Real input,
       real arithmetic, no invention. */
    const density = state.registered / Math.max(state.booths, 1);
    const urban = Math.min(0.95, Math.max(0.12, (density - 250) / 700));

    /* Security pressure, 0 to 100. Generated, but shaped so the north east
       and north west carry the load they are known to, because a synthetic
       series that put the pressure in Ekiti would be worse than none. */
    const zoneRisk = {
      "North East": 74,
      "North West": 66,
      "North Central": 44,
      "South South": 38,
      "South East": 34,
      "South West": 22,
    }[zone] ?? 30;
    const security = Math.round(Math.min(95, Math.max(8, zoneRisk + (jitter - 0.5) * 22)));

    /* Economic pressure. Higher is worse. Tilted by urbanisation, because the
       cash economy and the informal one behave differently under strain. */
    const hardship = Math.round(
      Math.min(95, Math.max(10, 62 + north * 14 - urban * 26 + (jitter - 0.5) * 14))
    );

    return {
      code: state.code,
      name: state.name,
      zone,
      synthetic: true,
      population,
      under30: Math.round(under30 * 100),
      religion: { muslim, christian, other },
      rainfall,
      rainRisk,
      urban: Math.round(urban * 100),
      security,
      hardship,
      /* Kept alongside so a panel never has to join two sources by hand. */
      registered: state.registered,
      booths: state.booths,
      density: Math.round(density),
      turnout: state.turnout,
    };
  });
}

/**
 * How each factor pushes turnout and party share.
 *
 * ── THESE ARE ASSUMPTIONS, NOT FINDINGS ────────────────────────────────────
 * Each coefficient says "if this factor is one standard step above the
 * national mean, move turnout by this much". They are stated here, in one
 * table, so the room can argue with them directly instead of guessing what
 * the model believes. They are not regression outputs and are not presented
 * as any.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const EFFECTS = {
  rainRisk: {
    turnout: -1.1,
    label: "Rain on polling day",
    note: "Suppresses rural turnout hardest, where the walk to the booth is longest.",
  },
  security: {
    turnout: -1.7,
    /* ── THE WORD ON SCREEN IS "INSECURITY" ──────────────────────────────
       "Security pressure" reads as though more of it were the good direction,
       which is the opposite of what the slider does: it depresses turnout.
       Insecurity is what Nigerians call the thing, it is unambiguous about
       which way the number points, and it matches how every report a room
       will have read that morning describes it. The data key stays `security`
       — renaming that would touch the generator, the glossary and every
       stored profile to change a caption. */
    label: "Insecurity",
    note: "The strongest single depressant on turnout, and the one with the clearest record behind it.",
  },
  hardship: {
    turnout: -0.6,
    label: "Economic hardship",
    note: "Cuts both ways: anger mobilises, the cost of getting there suppresses. Netted to a mild depressant.",
  },
  urban: {
    turnout: 0.9,
    label: "Urbanisation",
    note: "Shorter journeys, denser booths, more observers per square kilometre.",
  },
  under30: {
    turnout: 0.45,
    label: "Young population",
    note: "Registers heavily, historically attends less. A small net positive at 2023 levels.",
  },
};

/** The reference point each factor is measured against, in its own units. */
export const MEANS = { rainRisk: 18, security: 45, hardship: 62, urban: 45, under30: 58 };

/** Apply the factor set to a baseline turnout, returning the adjusted figure. */
export function adjustedTurnout(factor, weights = {}) {
  let delta = 0;
  const parts = [];

  for (const [key, effect] of Object.entries(EFFECTS)) {
    const enabled = weights[key] ?? 1;
    if (!enabled) continue;
    /* One step is 20 points of the factor's own scale. A state sitting on the
       national mean contributes nothing, which is what keeps the whole model
       collapsing back to the declared 2023 turnout when every lever is off. */
    const step = (factor[key] - MEANS[key]) / 20;
    const move = step * effect.turnout * enabled;
    delta += move;
    parts.push({ key, label: effect.label, step, move });
  }

  /* Sorted by size so a panel can show the two or three that actually decided
     the number, rather than five rows the reader has to rank themselves. */
  parts.sort((a, b) => Math.abs(b.move) - Math.abs(a.move));

  return { base: factor.turnout, delta, parts, adjusted: Math.max(3, factor.turnout + delta) };
}
