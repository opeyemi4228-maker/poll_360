/**
 * Where and when, stamped on everything the desk sends out.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A POST WITH NO PLACE AND NO TIME OUTLIVES THE FIGURE IN IT
 *
 *  A results card is screenshotted, cropped and reposted for a week. By the
 *  Tuesday nobody can say whether "APC 48%" was Kano at nine o'clock with a
 *  fifth of the booths in or the whole country at dawn — and a figure that
 *  cannot be placed and dated is one anybody can use to say anything.
 *
 *  So every update carries three things it can never be separated from:
 *
 *    the place    named, and pinned to a point on the map;
 *    the minute   in Lagos time, the moment the figures were read;
 *    the basis    how many returns it rests on, and that it is our count.
 *
 *  They are frozen into the item when it is written, not when it is sent.
 *  An editor clears the words, the figures and the stamp together; if the
 *  count has moved by the time it goes out, what goes out is still exactly
 *  what was cleared, and it says the minute it was true.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pure: no clock, no I/O, no React. Imported by the server, the browser and
 * the tests alike.
 */

/* ── ONE POINT PER STATE ─────────────────────────────────────────────────────
   The label point of each state's boundary in public/geo/map/states-latlng.json
   (geoBoundaries, CC BY 4.0) — the spot inside the state a map would print its
   name, which unlike a centroid is guaranteed to fall inside it. Keyed by
   INEC's state number, which is what a scope carries. Copied rather than
   read at run time so this file stays importable from anywhere, including
   the edge and the browser. */
export const STATE_POINTS = {
  "01": { code: "ABI", name: "Abia", lat: 5.454, lon: 7.5248 },
  "02": { code: "ADA", name: "Adamawa", lat: 9.3134, lon: 12.4061 },
  "03": { code: "AKW", name: "Akwa Ibom", lat: 4.9057, lon: 7.8564 },
  "04": { code: "ANA", name: "Anambra", lat: 6.2148, lon: 6.9327 },
  "05": { code: "BAU", name: "Bauchi", lat: 10.7781, lon: 9.9998 },
  "06": { code: "BAY", name: "Bayelsa", lat: 4.7728, lon: 6.0695 },
  "07": { code: "BEN", name: "Benue", lat: 7.3359, lon: 8.7377 },
  "08": { code: "BOR", name: "Borno", lat: 11.894, lon: 13.16 },
  "09": { code: "CRO", name: "Cross River", lat: 5.8734, lon: 8.6024 },
  "10": { code: "DEL", name: "Delta", lat: 5.7054, lon: 5.9373 },
  "11": { code: "EBO", name: "Ebonyi", lat: 6.2655, lon: 8.0143 },
  "12": { code: "EDO", name: "Edo", lat: 6.6346, lon: 5.932 },
  "13": { code: "EKI", name: "Ekiti", lat: 7.7189, lon: 5.3108 },
  "14": { code: "ENU", name: "Enugu", lat: 6.5359, lon: 7.4355 },
  "15": { code: "GOM", name: "Gombe", lat: 10.364, lon: 11.1929 },
  "16": { code: "IMO", name: "Imo", lat: 5.5719, lon: 7.0622 },
  "17": { code: "JIG", name: "Jigawa", lat: 12.2295, lon: 9.5612 },
  "18": { code: "KAD", name: "Kaduna", lat: 10.3773, lon: 7.7088 },
  "19": { code: "KAN", name: "Kano", lat: 11.7483, lon: 8.5236 },
  "20": { code: "KAT", name: "Katsina", lat: 12.3886, lon: 7.6381 },
  "21": { code: "KEB", name: "Kebbi", lat: 11.7186, lon: 4.5114 },
  "22": { code: "KOG", name: "Kogi", lat: 7.7364, lon: 6.6854 },
  "23": { code: "KWA", name: "Kwara", lat: 8.9611, lon: 4.3936 },
  "24": { code: "LAG", name: "Lagos", lat: 6.5222, lon: 3.6028 },
  "25": { code: "NAS", name: "Nasarawa", lat: 8.4996, lon: 8.1991 },
  "26": { code: "NIG", name: "Niger", lat: 9.9307, lon: 5.5987 },
  "27": { code: "OGU", name: "Ogun", lat: 6.9971, lon: 3.4675 },
  "28": { code: "OND", name: "Ondo", lat: 6.9105, lon: 5.1467 },
  "29": { code: "OSU", name: "Osun", lat: 7.5627, lon: 4.5176 },
  "30": { code: "OYO", name: "Oyo", lat: 8.1581, lon: 3.614 },
  "31": { code: "PLA", name: "Plateau", lat: 9.2189, lon: 9.517 },
  "32": { code: "RIV", name: "Rivers", lat: 4.8436, lon: 6.9115 },
  "33": { code: "SOK", name: "Sokoto", lat: 13.0569, lon: 5.3184 },
  "34": { code: "TAR", name: "Taraba", lat: 7.9918, lon: 10.7751 },
  "35": { code: "YOB", name: "Yobe", lat: 12.3002, lon: 11.4307 },
  "36": { code: "ZAM", name: "Zamfara", lat: 12.1208, lon: 6.2225 },
  "37": { code: "FCT", name: "Federal Capital Territory", lat: 8.8946, lon: 7.1872 },
};

/* Where "everywhere" is pinned: the geographic middle of the country, which
   is what a reader expects a national figure to point at. */
const NATION_POINT = { lat: 9.082, lon: 8.6753 };

/**
 * The place a scope names, with a point to pin it on.
 *
 * "NATION" is the country; "STATE:20" is Katsina; "LGA:20/03" is a local
 * government, pinned to its state's point because that is the finest point
 * this file holds — and it says so, rather than pretending to a precision it
 * does not have.
 */
export function placeOf(scope, { nationName = "Nigeria" } = {}) {
  if (!scope || scope === "NATION") {
    return { scope: "NATION", level: "nation", name: nationName, ...NATION_POINT, exact: true };
  }
  const [level, rest = ""] = String(scope).split(":");
  const number = String(rest).split("/")[0].padStart(2, "0");
  const state = STATE_POINTS[number];
  if (!state) return { scope, level: "unknown", name: nationName, ...NATION_POINT, exact: false };

  const stateName = state.name === "Federal Capital Territory" ? "FCT, Abuja" : `${state.name} State`;
  if (level === "LGA") {
    return { scope, level: "lga", name: stateName, state: state.name, code: state.code, lat: state.lat, lon: state.lon, exact: false };
  }
  return { scope, level: "state", name: stateName, state: state.name, code: state.code, lat: state.lat, lon: state.lon, exact: true };
}

/* Lagos time, always. The desk, the audience and INEC all read the night in
   West Africa Time, and a stamp in the server's own zone is a stamp an hour
   wrong on half the hosting platforms this could run on. */
const WAT_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/* The month is spelt from a table rather than by the runtime: ICU has
   started writing "Sept" for September in en-GB, and a stamp that reads
   differently on the server and in the browser is two stamps. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WAT_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});
const WAT_DAY = {
  format(date) {
    const part = Object.fromEntries(WAT_PARTS.formatToParts(date).map((row) => [row.type, row.value]));
    return `${Number(part.day)} ${MONTHS[Number(part.month) - 1]} ${part.year}`;
  },
};

/** "21:14 WAT" */
export const clockWAT = (at) => `${WAT_CLOCK.format(new Date(at))} WAT`;

/**
 * The clock, read outside a render.
 *
 * A component may not read the clock while it is describing a picture — the
 * value would change on every re-render — so a page that needs the minute
 * awaits it here instead, where reading it is an effect like any other.
 */
export async function nowWAT() {
  return clockWAT(Date.now());
}

/** "21:14 WAT, 19 Sep 2026" */
export const stampTime = (at) => `${clockWAT(at)}, ${WAT_DAY.format(new Date(at))}`;

/**
 * The stamp itself: where, when, and the point on the map.
 *
 * @param scope  the item's scope
 * @param at     the moment the figures were read — passed in, never read here
 */
export function stampFor({ scope, at, nationName, name = null, point = null } = {}) {
  const base = placeOf(scope, { nationName });
  /* A finer name ("Nassarawa LGA, Kano State") and, for a single booth, the
     position its agent filed from — exact where the field gave us one. */
  const place = {
    ...base,
    ...(name ? { name } : {}),
    ...(point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      ? { lat: Math.round(point.lat * 1e4) / 1e4, lon: Math.round(point.lon * 1e4) / 1e4, exact: true, gps: true }
      : {}),
  };
  const when = at ? new Date(at) : null;
  return {
    place,
    at: when ? when.toISOString() : null,
    time: when ? stampTime(when) : null,
    /* Six decimals is a tenth of a metre and a lie; four is eleven metres,
       which is already finer than a state's label point deserves. */
    coords: `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`,
    mapLink: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=${place.level === "nation" ? 6 : 8}/${place.lat}/${place.lon}`,
  };
}

/**
 * The figures, frozen.
 *
 * Only what a card and a caption draw, so the item's payload stays small and
 * a later change to how places are rolled up cannot rewrite what was cleared.
 */
export function freezeFigures(figures) {
  if (!figures) return null;
  const parties = (figures.parties ?? []).slice(0, 8).map((party) => ({
    id: party.id,
    votes: party.votes ?? party.count ?? 0,
    share: Number.isFinite(party.share) ? Math.round(party.share * 10) / 10 : 0,
  }));
  return {
    name: figures.name ?? null,
    scope: figures.scope ?? "NATION",
    filed: figures.filed ?? 0,
    expected: figures.expected ?? 0,
    verified: figures.verified ?? null,
    reporting: figures.reporting == null ? null : Math.round(figures.reporting * 10) / 10,
    turnout: figures.turnout == null ? null : Math.round(figures.turnout * 10) / 10,
    cast: figures.cast ?? parties.reduce((sum, party) => sum + party.votes, 0),
    registered: figures.registered ?? null,
    accredited: figures.accredited ?? null,
    rejected: figures.rejected ?? null,
    parties,
    others: Math.max(0, (figures.parties?.length ?? 0) - parties.length),
  };
}

/* ── WHAT EACH PLATFORM WILL TAKE ─────────────────────────────────────────
   The caption limits, in characters. X counts a link as 23 whatever its
   length and an emoji as two, which `measure` below accounts for; the rest
   count plainly. Telegram's is the limit on a photo's caption, not on a
   message, and it is the one that bites. */
export const CAPTION_LIMITS = {
  x: 280,
  threads: 500,
  telegram: 1024,
  instagram: 2200,
  facebook: 5000,
  relay: 5000,
  whatsapp: 1000,
};

const LINK = /https?:\/\/\S+/g;

/** Length as the platform counts it. */
export function measure(text, platform) {
  const plain = String(text ?? "");
  if (platform !== "x") return [...plain].length;
  const links = plain.match(LINK) ?? [];
  const rest = plain.replace(LINK, "");
  let length = links.length * 23;
  for (const char of rest) length += char.codePointAt(0) > 0xffff ? 2 : 1;
  return length;
}

const share = (value) => `${(Math.round(value * 10) / 10).toFixed(1)}%`;
const count = (value) => new Intl.NumberFormat("en-NG").format(value ?? 0);

/** The one line that says what a figure rests on. Never dropped. */
export function basisLine(figures) {
  if (!figures) return "Poll360 parallel count. Not an official declaration.";
  const reporting = figures.reporting == null ? "" : `, ${share(figures.reporting)} of polling units`;
  return `${count(figures.filed)} results in${reporting}. Poll360 parallel count, not an official declaration.`;
}

/** The standings, in one line, for platforms that carry no image. */
export function standingsLine(figures, take = 3) {
  const top = (figures?.parties ?? []).slice(0, take);
  if (!top.length) return "";
  return top.map((party) => `${party.id} ${share(party.share)}`).join(" · ");
}

/**
 * The caption a platform is sent.
 *
 * ── WHAT IS CUT, AND WHAT NEVER IS ──────────────────────────────────────
 * The desk's own words are shortened to fit. The place, the time, the basis
 * and the link are not: they are the part that makes the post safe to have
 * published, and a caption that fits by dropping them is a caption that
 * should not have been sent.
 */
export function captionFor({ platform, body, figures, stamp, link = null, tags = [] }) {
  const limit = CAPTION_LIMITS[platform] ?? 2000;
  const where = stamp?.place?.name ? `📍 ${stamp.place.name}` : null;
  const when = stamp?.time ? `🕒 ${stamp.time}` : null;
  const footer = [
    [where, when].filter(Boolean).join("  "),
    basisLine(figures),
    /* Instagram does not make links in a caption clickable; printing one
       there is noise, so it is left to the profile. */
    platform === "instagram" ? null : link,
    tags.length ? tags.map((tag) => `#${tag}`).join(" ") : null,
  ]
    .filter(Boolean)
    .join("\n");

  const words = String(body ?? "").trim();
  const room = limit - measure(footer, platform) - 2;
  if (room <= 0) return footer;
  if (measure(words, platform) <= room) return words ? `${words}\n\n${footer}` : footer;

  /* Cut at a word, and say it was cut. */
  let cut = words;
  while (cut && measure(`${cut}…`, platform) > room) cut = cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length - 1);
  return `${cut.trimEnd()}…\n\n${footer}`;
}
