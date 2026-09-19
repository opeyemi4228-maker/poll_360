import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { partyById, partyLogo } from "./party-register.js";
import { layoutFor } from "./post-figures.js";
import { site } from "./site.js";

/* The address printed on every card, without the scheme: what somebody
   types after seeing it in a screenshot. */
const HOST = site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/**
 * The Poll360 look: every picture this product sends into the world.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A RESULT CARD SHOULD BE RECOGNISABLE BEFORE IT IS READ
 *
 *  A feed on results night is a wall of screenshots of television graphics,
 *  and they all look the same: a blue bar, a red bar, a percentage. A card that
 *  looks like them is scrolled past as one more of them, or worse, mistaken
 *  for one of them — and ours is a parallel count, which must never be
 *  mistaken for a broadcaster's declaration.
 *
 *  So Poll360 has its own look, built from three things nobody else uses
 *  together:
 *
 *    THE PAPER    cream, not white or black. Warm, printed, a poster rather
 *                 than a screen — it survives a screenshot and a photocopy.
 *    THE DIAL     a 360° ring: how much of the place is counted, drawn as the
 *                 thing the product is named after. Every card carries it.
 *    THE RAYS     a sunburst behind the place name, the civic-poster motif,
 *                 in the brand's accent colours.
 *
 *  Navy and red are the brand; green, orange and blue are its accents, and
 *  they also happen to be the colours of the parties on most ballots — which
 *  is why a party's own colour always wins inside the chart. A party is drawn
 *  in its colour, with its logo where we hold one and its candidate's face
 *  where the desk has added one, and never in a colour that means another
 *  party.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Drawn by Satori (through next/og): flexbox only, inline SVG for shapes,
 * absolutely positioned boxes for anything laid over a map. Fonts, logos and
 * boundaries are read from disk once, so a render needs no network.
 */

/* ────────────────────────────────────────────────────────────── the brand ── */

export const BRAND = {
  navy: "#14213D",
  navyDeep: "#0C1629",
  cream: "#F5EEDC",
  creamDeep: "#EADFC4",
  red: "#E4202E",
  green: "#1E9E5A",
  orange: "#F28A25",
  blue: "#2F6FDE",
  teal: "#4E8A8C",
  ink: "#101A2E",
  muted: "#5B6478",
};

/* Party colours for filled shapes and columns: saturated enough to carry white
   type, and each party's own. APC and ADC are both blue-adjacent in the wild;
   they are kept apart here on purpose. */
const PARTY = {
  APC: "#1F5FBF",
  PDP: "#D7262E",
  LP: "#1E9E5A",
  NNPP: "#6BB445",
  ADC: "#F28A25",
  APGA: "#B8A500",
  SDP: "#0F8B8D",
  ACCORD: "#D9A400",
  APM: "#7A4515",
  NDC: "#7B34B8",
  YPP: "#C2185B",
  PRP: "#8D6E63",
  ZLP: "#00897B",
  AA: "#546E7A",
};
const OTHER = ["#607D8B", "#795548", "#9C27B0", "#00838F", "#AD1457", "#5D4037"];

export function partyColour(id) {
  if (PARTY[id]) return PARTY[id];
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return OTHER[hash % OTHER.length];
}

/* White type on a party colour, unless the colour is too light to carry it. */
function onColour(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 170 ? BRAND.navy : "#FFFFFF";
}

/* ─────────────────────────────────────────────────────────────── assets ── */

const disk = (...parts) => join(process.cwd(), ...parts);
let fontCache = null;
function fonts() {
  if (fontCache) return fontCache;
  const read = (file) => readFileSync(disk("lib", "fonts", file));
  fontCache = [
    { name: "Anton", data: read("anton-400.ttf"), weight: 400, style: "normal" },
    { name: "Inter Tight", data: read("intertight-600.ttf"), weight: 600, style: "normal" },
    { name: "Inter Tight", data: read("intertight-800.ttf"), weight: 800, style: "normal" },
    { name: "Yellowtail", data: read("yellowtail-400.ttf"), weight: 400, style: "normal" },
  ];
  return fontCache;
}

const logoCache = new Map();
/** A party's logo as a data address, or null where we hold none. */
export function logoData(id) {
  if (logoCache.has(id)) return logoCache.get(id);
  let data = null;
  const path = partyLogo(id);
  if (path) {
    try {
      data = `data:image/png;base64,${readFileSync(disk("public", path)).toString("base64")}`;
    } catch {
      data = null;
    }
  }
  logoCache.set(id, data);
  return data;
}

const geoCache = new Map();
function geo(file) {
  if (geoCache.has(file)) return geoCache.get(file);
  let data = null;
  try {
    data = JSON.parse(readFileSync(disk("public", "geo", ...file.split("/")), "utf8"));
  } catch {
    data = null;
  }
  geoCache.set(file, data);
  return data;
}

/** The bounding box of an SVG path's points: [minX, minY, maxX, maxY]. */
function boxOf(d) {
  const numbers = String(d).match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const [x, y] = [numbers[index], numbers[index + 1]];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/* ────────────────────────────────────────────────────────────── helpers ── */

const num = (value) => new Intl.NumberFormat("en-NG").format(Math.round(value ?? 0));
const pct = (value, digits = 1) => `${(Math.round((value ?? 0) * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
const LEVEL_LABEL = {
  nation: "National result",
  state: "State result",
  lga: "LGA collated result",
  ward: "Ward result",
  unit: "Polling unit result",
};

/** A type size that fits a line of `text` into `width`, between two bounds. */
function fit(text, width, { max, min, ratio = 0.46 }) {
  const length = Math.max(1, String(text ?? "").length);
  return Math.max(min, Math.min(max, Math.floor(width / (length * ratio))));
}

/** The arc of a ring, as an SVG path, from `from` to `to` in [0, 1]. */
function arc(cx, cy, r, from, to) {
  const a0 = (from * 360 - 90) * (Math.PI / 180);
  const a1 = (Math.min(to, 0.9999) * 360 - 90) * (Math.PI / 180);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
}

/* ─────────────────────────────────────────────────────────── the pieces ── */

/** The mark: a ring in the three accents around a red core. */
function Mark({ size }) {
  const r = size * 0.38;
  const c = size / 2;
  const w = size * 0.14;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={arc(c, c, r, 0.02, 0.31)} stroke={BRAND.green} strokeWidth={w} fill="none" strokeLinecap="round" />
      <path d={arc(c, c, r, 0.35, 0.64)} stroke={BRAND.orange} strokeWidth={w} fill="none" strokeLinecap="round" />
      <path d={arc(c, c, r, 0.68, 0.97)} stroke={BRAND.blue} strokeWidth={w} fill="none" strokeLinecap="round" />
      <circle cx={c} cy={c} r={size * 0.14} fill={BRAND.red} />
    </svg>
  );
}

/** The sunburst, radiating from a point below and left of the box. */
function Rays({ width, height, colour = BRAND.creamDeep, count = 18 }) {
  const cx = width * 0.08;
  const cy = height * 1.25;
  const reach = Math.hypot(width, height) * 1.6;
  const rays = [];
  for (let index = 0; index < count; index += 1) {
    const a0 = (-100 + (index * 100) / count) * (Math.PI / 180);
    const a1 = (-100 + ((index + 0.5) * 100) / count) * (Math.PI / 180);
    rays.push(
      `M ${cx} ${cy} L ${cx + reach * Math.cos(a0)} ${cy + reach * Math.sin(a0)} L ${cx + reach * Math.cos(a1)} ${cy + reach * Math.sin(a1)} Z`
    );
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", top: 0, left: 0 }}>
      {rays.map((d, index) => (
        <path key={index} d={d} fill={colour} />
      ))}
    </svg>
  );
}

/** The 360° dial: how much of the place is counted. */
function Dial({ size, value, label = "counted", dark = true }) {
  const c = size / 2;
  const r = size * 0.4;
  const w = size * 0.11;
  const share = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} stroke={dark ? "rgba(255,255,255,0.16)" : "rgba(20,33,61,0.12)"} strokeWidth={w} fill="none" />
        {share > 0 && <path d={arc(c, c, r, 0, share)} stroke={BRAND.orange} strokeWidth={w} fill="none" strokeLinecap="round" />}
      </svg>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: dark ? "#FFFFFF" : BRAND.navy,
        }}
      >
        <div style={{ fontFamily: "Anton", fontSize: size * 0.27, lineHeight: 1 }}>
          {value == null ? "—" : `${Math.round(value)}%`}
        </div>
        <div style={{ fontFamily: "Inter Tight", fontWeight: 800, fontSize: size * 0.085, letterSpacing: 1, opacity: 0.8 }}>
          {label.toUpperCase()}
        </div>
      </div>
    </div>
  );
}

/** A party's badge: its logo on white, or its code on its colour. */
function Badge({ id, size }) {
  const logo = logoData(id);
  const colour = partyColour(id);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: size,
        background: logo ? "#FFFFFF" : colour,
        border: `${Math.max(2, size * 0.06)}px solid #FFFFFF`,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
        <img src={logo} width={size * 0.8} height={size * 0.8} style={{ objectFit: "contain" }} alt="" />
      ) : (
        <div style={{ fontFamily: "Anton", fontSize: size * (id.length > 3 ? 0.26 : 0.34), color: onColour(colour) }}>{id}</div>
      )}
    </div>
  );
}

/** The navy header band. */
function Header({ S, payload, kicker }) {
  const h = S.u * (S.wide ? 92 : 108);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: h,
        padding: `0 ${S.pad}px`,
        background: BRAND.navy,
        color: "#FFFFFF",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: S.u * 14 }}>
        <Mark size={h * 0.6} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Anton", fontSize: h * 0.36, letterSpacing: 1.5, lineHeight: 1 }}>POLL360</div>
          <div style={{ fontFamily: "Inter Tight", fontWeight: 600, fontSize: h * 0.15, opacity: 0.7, marginTop: 4 }}>
            {payload.contest ?? "Election results"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: S.u * 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: S.u * 8,
            padding: `${S.u * 8}px ${S.u * 16}px`,
            borderRadius: 999,
            background: BRAND.red,
            fontFamily: "Inter Tight",
            fontWeight: 800,
            fontSize: h * 0.17,
            letterSpacing: 2,
          }}
        >
          <div style={{ width: S.u * 10, height: S.u * 10, borderRadius: 99, background: "#FFFFFF" }} />
          {kicker.toUpperCase()}
        </div>
      </div>
    </div>
  );
}

/** The place, huge, over the rays. */
/**
 * The sentence the card is about, in the leader's colour: "APC LEADS BY 0.9
 * POINTS". It is the line people repeat when they share a result, so the card
 * says it rather than leaving a reader to subtract two percentages.
 */
function verdictOf(figures) {
  const [first, second] = figures?.parties ?? [];
  if (!first || !first.votes) return null;
  if (!second || !second.votes) return { id: first.id, text: `${first.id} ALONE ON THE BOARD` };
  const margin = first.share - second.share;
  if (margin < 0.05) return { id: first.id, text: `${first.id} AND ${second.id} LEVEL` };
  return { id: first.id, text: `${first.id} LEADS BY ${margin.toFixed(1)} PTS` };
}

function Verdict({ S, figures }) {
  const verdict = verdictOf(figures);
  if (!verdict) return null;
  const colour = partyColour(verdict.id);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: S.u * 10,
        padding: `${S.u * 10}px ${S.u * 18}px`,
        borderRadius: 999,
        background: colour,
        color: onColour(colour),
        fontFamily: "Anton",
        fontSize: S.u * (S.wide ? 26 : 30),
        letterSpacing: 1,
        flexShrink: 0,
        border: `${S.u * 4}px solid ${BRAND.cream}`,
      }}
    >
      {logoData(verdict.id) && (
        // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori
        <img src={logoData(verdict.id)} width={S.u * 34} height={S.u * 34} alt="" style={{ borderRadius: 99, background: "#FFFFFF" }} />
      )}
      {verdict.text}
    </div>
  );
}

function Title({ S, payload, script = null, tall = null, verdict = false }) {
  /* Posts written before places were named carry only the figures' name. */
  const place = payload.place ?? { short: payload.figures?.name ?? "Nigeria" };
  const name = (place.short ?? place.name ?? "Nigeria").toUpperCase();
  const h = tall ?? S.u * (S.wide ? 104 : S.story ? 260 : 190);
  const chip = verdict ? verdictOf(payload.figures) : null;
  /* Room for the chip beside the name, except on a story, where it sits
     underneath and the name has the full width. */
  const beside = chip && !S.story;
  const nameWidth = S.W - S.pad * 2 - (beside ? S.u * (S.wide ? 360 : 400) : 0);
  return (
    <div style={{ display: "flex", position: "relative", height: h, flexShrink: 0, overflow: "hidden" }}>
      <Rays width={S.W} height={h} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: S.u * 20,
          padding: `0 ${S.pad}px`,
          width: "100%",
          height: "100%",
        }}
      >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
        {script && (
          <div style={{ fontFamily: "Yellowtail", fontSize: S.u * (S.story ? 64 : 48), color: BRAND.red, lineHeight: 1 }}>
            {script}
          </div>
        )}
        <div
          style={{
            fontFamily: "Anton",
            fontSize: fit(name, nameWidth, { max: S.u * (S.story ? 150 : S.wide ? 72 : 118), min: S.u * (S.wide ? 40 : 54), ratio: 0.5 }),
            color: BRAND.navy,
            lineHeight: 1,
            letterSpacing: 1,
          }}
        >
          {name}
        </div>
        {place.parent && (
          <div style={{ fontFamily: "Inter Tight", fontWeight: 600, fontSize: S.u * (S.wide ? 18 : 24), color: BRAND.muted, marginTop: S.u * (S.wide ? 2 : 8) }}>
            {place.parent}
          </div>
        )}
        {chip && S.story && (
          <div style={{ display: "flex", marginTop: S.u * 16 }}>
            <Verdict S={S} figures={payload.figures} />
          </div>
        )}
      </div>
      {beside && <Verdict S={S} figures={payload.figures} />}
      </div>
    </div>
  );
}

/** The navy footing: the dial, the basis, the stamp. Never cropped. */
function Footer({ S, payload }) {
  const f = payload.figures ?? {};
  const stamp = payload.stamp ?? {};
  const h = S.u * (S.wide ? 118 : 150);
  const levelUnit = payload.level === "unit" ? "polling unit" : "polling units";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: S.u * 22,
        height: h,
        padding: `0 ${S.pad}px`,
        background: BRAND.navy,
        color: "#FFFFFF",
        flexShrink: 0,
      }}
    >
      <Dial size={h * 0.8} value={f.reporting} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: S.u * 6 }}>
        <div style={{ display: "flex", fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 25 }}>
          {num(f.filed)}
          {f.expected ? ` of ${num(f.expected)}` : ""} {levelUnit} in
          {f.verified != null ? ` · ${num(f.verified)} verified` : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S.u * 10, fontFamily: "Inter Tight", fontWeight: 600, fontSize: S.u * 19, opacity: 0.85 }}>
          <div style={{ width: S.u * 12, height: S.u * 12, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: BRAND.red }} />
          <div style={{ display: "flex" }}>
            {stamp.coords ?? ""}
            {stamp.place?.gps ? " (GPS)" : ""}
            {stamp.time ? `  ·  ${stamp.time}` : ""}
          </div>
        </div>
        <div style={{ fontFamily: "Inter Tight", fontWeight: 600, fontSize: S.u * 16, opacity: 0.6 }}>
          Poll360 parallel count from our own agents. Not an official declaration.
        </div>
      </div>
      {/* Where a screenshot leads back to. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
        <div style={{ fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 13, letterSpacing: 2, opacity: 0.6 }}>FULL UPDATE</div>
        <div style={{ fontFamily: "Anton", fontSize: S.u * 24, letterSpacing: 1, color: BRAND.orange }}>{HOST}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── the layouts ── */

/**
 * The wall of candidates: a column per party in its own colour, the face on
 * top, the number huge. The leader first, and marked.
 */
function Faces({ S, payload, contestants }) {
  const parties = payload.figures?.parties ?? [];
  const take = S.wide ? 5 : 4;
  const shown = parties.slice(0, take);
  const rest = parties.slice(take);
  const grid = S.story;
  const leaderVotes = shown[0]?.votes ?? 0;

  if (!shown.length) return <Nothing S={S} />;

  const column = (party, index) => {
    const colour = partyColour(party.id);
    const text = onColour(colour);
    const person = contestants[party.id];
    const lead = index === 0;
    const behind = leaderVotes - party.votes;
    return (
      <div
        key={party.id}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          borderRadius: S.u * 22,
          overflow: "hidden",
          background: colour,
          color: text,
          border: lead ? `${S.u * 5}px solid ${BRAND.navy}` : `${S.u * 5}px solid transparent`,
        }}
      >
        {/* The face, or the party's mark where the desk has not added one. */}
        <div
          style={{
            display: "flex",
            position: "relative",
            ...(S.wide ? { height: S.u * 150, flexShrink: 0 } : { flex: 1, minHeight: 0 }),
            alignItems: "flex-end",
            justifyContent: "center",
            background: "rgba(0,0,0,0.12)",
          }}
        >
          {person?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori
            <img src={person.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          ) : (
            <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
              <Badge id={party.id} size={S.u * (grid ? 190 : S.wide ? 110 : 150)} />
            </div>
          )}
          {person?.photo && (
            <div style={{ position: "absolute", left: S.u * 12, top: S.u * 12, display: "flex" }}>
              <Badge id={party.id} size={S.u * (S.wide ? 58 : 70)} />
            </div>
          )}
          {lead && (
            <div
              style={{
                position: "absolute",
                right: S.u * 10,
                top: S.u * 12,
                display: "flex",
                padding: `${S.u * 6}px ${S.u * 12}px`,
                borderRadius: 999,
                background: BRAND.cream,
                color: BRAND.navy,
                fontFamily: "Inter Tight",
                fontWeight: 800,
                fontSize: S.u * 17,
                letterSpacing: 1.5,
              }}
            >
              LEADS
            </div>
          )}
        </div>
        {/* The name band. */}
        <div style={{ display: "flex", flexDirection: "column", padding: `${S.u * 12}px ${S.u * 14}px ${S.u * 4}px` }}>
          <div style={{ fontFamily: "Anton", fontSize: S.u * (S.wide ? 30 : 36), lineHeight: 1, letterSpacing: 1 }}>{party.id}</div>
          <div style={{ fontFamily: "Inter Tight", fontWeight: 600, fontSize: S.u * 17, opacity: 0.9, marginTop: S.u * 4, height: S.u * 22, overflow: "hidden" }}>
            {person?.name ?? partyById(party.id)?.name ?? ""}
          </div>
        </div>
        {/* The figure, on the paper, like a card held up. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            margin: `${S.u * 8}px ${S.u * 10}px ${S.u * 10}px`,
            padding: `${S.u * 10}px ${S.u * 6}px`,
            borderRadius: S.u * 14,
            background: BRAND.cream,
            color: BRAND.navy,
          }}
        >
          <div style={{ fontFamily: "Anton", fontSize: fit(num(party.votes), S.u * (S.wide ? 190 : 210), { max: S.u * 58, min: S.u * 30, ratio: 0.52 }), lineHeight: 1.05 }}>
            {num(party.votes)}
          </div>
          <div style={{ display: "flex", width: "100%", height: S.u * 3, background: "rgba(20,33,61,0.2)", margin: `${S.u * 6}px 0` }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: S.u * 6 }}>
            <div style={{ fontFamily: "Anton", fontSize: S.u * 32, color: colour === BRAND.cream ? BRAND.navy : colour }}>{pct(party.share)}</div>
            {!lead && behind > 0 && (
              <div style={{ display: "flex", fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 15, color: BRAND.muted }}>{`▼ ${num(behind)}`}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${S.u * 8}px ${S.pad}px ${S.u * 20}px`, gap: S.u * 14, minHeight: 0 }}>
      {grid ? (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: S.u * 16, minHeight: 0 }}>
          <div style={{ display: "flex", flex: 1, gap: S.u * 16, minHeight: 0 }}>{shown.slice(0, 2).map(column)}</div>
          {shown.length > 2 && (
            <div style={{ display: "flex", flex: 1, gap: S.u * 16, minHeight: 0 }}>{shown.slice(2, 4).map((party, index) => column(party, index + 2))}</div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, gap: S.u * 14, minHeight: 0 }}>{shown.map(column)}</div>
      )}
      {rest.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 20, color: BRAND.muted }}>
          <div style={{ display: "flex" }}>
            {`Also: ${rest.slice(0, 6).map((party) => `${party.id} ${pct(party.share)}`).join("   ·   ")}`}
          </div>
          {rest.length > 6 && <div style={{ display: "flex" }}>{`${rest.length - 6} more · ${pct(rest.slice(6).reduce((sum, party) => sum + party.share, 0))}`}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Horizontal bars: the right chart for one ward or one booth, where the
 * question is "who won here, by how much" and there is no map to draw.
 */
function Bars({ S, payload, contestants }) {
  const f = payload.figures ?? {};
  const parties = (f.parties ?? []).slice(0, S.story ? 8 : S.wide ? 5 : 6);
  const top = parties[0]?.votes || 1;
  if (!parties.length) return <Nothing S={S} />;

  const stats =
    payload.level === "unit"
      ? [
          ["Registered", f.registered],
          ["Accredited", f.accredited],
          ["Valid votes", f.cast],
          ["Rejected", f.rejected],
        ]
      : [
          ["Votes cast", f.cast],
          ["Turnout", f.turnout == null ? null : pct(f.turnout)],
          ["Units in", `${num(f.filed)}${f.expected ? `/${num(f.expected)}` : ""}`],
        ];

  /* Rows share the room left after the title, the stats and the footing, so
     six parties on a square fit as surely as three do. */
  const header = S.u * (S.wide ? 92 : 108);
  const title = S.u * (S.wide ? 104 : S.story ? 260 : 190);
  const footer = S.u * (S.wide ? 118 : 150);
  const stats_ = S.u * 118;
  const room = S.H - header - title - footer - stats_ - S.u * 60;
  const gap = S.u * 12;
  const rowH = Math.min(S.u * (S.story ? 104 : 86), (room - gap * (parties.length - 1)) / parties.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${S.u * 4}px ${S.pad}px ${S.u * 20}px`, gap: S.u * 14, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap, flex: 1, justifyContent: "center" }}>
        {parties.map((party, index) => {
          const colour = partyColour(party.id);
          const person = contestants[party.id];
          const width = Math.max(4, (party.votes / top) * 100);
          return (
            <div key={party.id} style={{ display: "flex", alignItems: "center", gap: S.u * 14, height: rowH }}>
              {person?.photo ? (
                <div style={{ display: "flex", width: rowH, height: rowH, borderRadius: rowH, overflow: "hidden", border: `${S.u * 4}px solid ${colour}`, flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori */}
                  <img src={person.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
                </div>
              ) : (
                <Badge id={party.id} size={rowH} />
              )}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: S.u * 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: S.u * 10 }}>
                    <div style={{ fontFamily: "Anton", fontSize: S.u * 32, color: BRAND.navy }}>{party.id}</div>
                    {person?.name && (
                      <div style={{ fontFamily: "Inter Tight", fontWeight: 600, fontSize: S.u * 18, color: BRAND.muted }}>{person.name}</div>
                    )}
                  </div>
                  <div style={{ fontFamily: "Anton", fontSize: S.u * 32, color: index === 0 ? colour : BRAND.navy }}>{pct(party.share)}</div>
                </div>
                <div style={{ display: "flex", height: S.u * (S.wide ? 26 : 34), borderRadius: 999, background: BRAND.creamDeep, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      width: `${width}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: colour,
                      paddingRight: S.u * 12,
                    }}
                  >
                    {width > 22 && (
                      <div style={{ fontFamily: "Anton", fontSize: S.u * (S.wide ? 18 : 22), color: onColour(colour) }}>{num(party.votes)}</div>
                    )}
                  </div>
                  {width <= 22 && (
                    <div style={{ display: "flex", alignItems: "center", fontFamily: "Anton", fontSize: S.u * (S.wide ? 18 : 22), color: BRAND.navy, paddingLeft: S.u * 10 }}>
                      {num(party.votes)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: S.u * 12 }}>
        {stats.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: `${S.u * 12}px ${S.u * 16}px`,
              borderRadius: S.u * 14,
              background: "#FFFFFF",
              border: `${S.u * 2}px solid ${BRAND.creamDeep}`,
            }}
          >
            <div style={{ fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 15, letterSpacing: 1.5, color: BRAND.muted }}>{label.toUpperCase()}</div>
            <div style={{ fontFamily: "Anton", fontSize: S.u * 34, color: BRAND.navy }}>{value == null ? "—" : typeof value === "number" ? num(value) : value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The map: each place one level down in its leader's colour, with the
 * leader's share printed on it. A local government's card draws its state
 * and lights it.
 */
function MapCard({ S, payload, contestants }) {
  const map = payload.map;
  const f = payload.figures ?? {};
  const focus = map?.focus ?? "NATION";

  /* Which shapes. The country is drawn from its states; a state from its
     local governments, whose order in the file is their number. */
  let shapes = null;
  let keyOf = null;
  if (map?.level === "nation") {
    const data = geo("map/states.json");
    shapes = data ? { width: data.width, height: data.height, list: data.states.map((row) => ({ key: row.code, d: row.d, name: row.name })) } : null;
    keyOf = (cell) => STATE_CODE_BY_NUMBER[cell.scope.split(":")[1]] ?? null;
  } else if (map?.level === "state") {
    const number = String(focus).split(":")[1].split("/")[0];
    const code = STATE_CODE_BY_NUMBER[number];
    const data = code ? geo(`lga/${code}.json`) : null;
    if (data) {
      const ordered = [...data.lgas].sort((a, b) => a.name.localeCompare(b.name));
      const index = new Map(ordered.map((row, position) => [row.name, `${number}/${String(position + 1).padStart(2, "0")}`]));
      shapes = { width: data.width, height: data.height, list: data.lgas.map((row) => ({ key: index.get(row.name), d: row.d, name: row.name })) };
      keyOf = (cell) => cell.scope.split(":")[1];
    }
  }
  if (!shapes) return <Faces S={S} payload={payload} contestants={contestants} />;

  const cells = new Map((map.cells ?? []).map((cell) => [keyOf(cell), cell]));
  const lit = payload.level === "lga" ? String(focus).split(":")[1] : null;

  /* Frame the whole state — or, for one local government, zoom in on it with
     its neighbours around it. */
  let [vx, vy, vw, vh] = [0, 0, shapes.width, shapes.height];
  if (lit) {
    const shape = shapes.list.find((row) => row.key === lit);
    if (shape) {
      const [x0, y0, x1, y1] = boxOf(shape.d);
      const size = Math.max(x1 - x0, y1 - y0) * 1.9;
      vx = (x0 + x1) / 2 - size / 2;
      vy = (y0 + y1) / 2 - size / 2;
      vw = size;
      vh = size;
    }
  } else {
    const boxes = shapes.list.map((row) => boxOf(row.d));
    const x0 = Math.min(...boxes.map((b) => b[0]));
    const y0 = Math.min(...boxes.map((b) => b[1]));
    const x1 = Math.max(...boxes.map((b) => b[2]));
    const y1 = Math.max(...boxes.map((b) => b[3]));
    const padX = (x1 - x0) * 0.03;
    const padY = (y1 - y0) * 0.03;
    [vx, vy, vw, vh] = [x0 - padX, y0 - padY, x1 - x0 + padX * 2, y1 - y0 + padY * 2];
  }

  /* The map's box on the card, at the viewBox's own aspect so labels can be
     placed by arithmetic. */
  const side = S.story ? null : S.wide ? S.W * 0.42 : S.W * 0.58;
  const maxW = S.story ? S.W - S.pad * 2 : side;
  const maxH = S.story ? S.H * 0.42 : S.H - S.u * (S.wide ? 92 + 118 + 104 + 30 : 108 + 150 + 190 + 40);
  const scale = Math.min(maxW / vw, maxH / vh);
  const mw = vw * scale;
  const mh = vh * scale;
  const at = (x, y) => [(x - vx) * scale, (y - vy) * scale];

  const colourOf = (cell) => {
    if (!cell?.leader) return BRAND.cream;
    return partyColour(cell.leader);
  };

  const labels = shapes.list
    .map((row) => {
      const cell = cells.get(row.key);
      if (!cell?.leader) return null;
      const [x0, y0, x1, y1] = boxOf(row.d);
      const size = Math.min(x1 - x0, y1 - y0) * scale;
      if (size < S.u * 44 && row.key !== lit) return null;
      const [x, y] = at((x0 + x1) / 2, (y0 + y1) / 2);
      if (x < S.u * 30 || y < S.u * 16 || x > mw - S.u * 30 || y > mh - S.u * 16) return null;
      /* Neighbours are drawn faint, so their figures go in navy rather than
         white — white on a washed-out fill is unreadable. */
      const faint = lit && row.key !== lit;
      return { key: row.key, x, y, text: pct(cell.share, 0), colour: faint ? BRAND.navy : onColour(colourOf(cell)), big: row.key === lit };
    })
    .filter(Boolean);

  const legend = [...new Set([...(map.cells ?? [])].map((cell) => cell.leader).filter(Boolean))];
  const reportingCells = shapes.list.filter((row) => cells.get(row.key)?.leader).length;
  const wards = payload.breakdown ?? [];
  const won = (id) => (map.cells ?? []).filter((cell) => cell.leader === id).length;
  const standings = (f.parties ?? []).slice(0, S.story ? 5 : 4);

  const mapBox = (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: mw,
        height: mh,
        flexShrink: 0,
        overflow: "hidden",
        borderRadius: lit ? S.u * 24 : 0,
        background: lit ? BRAND.creamDeep : "transparent",
      }}
    >
      <svg width={mw} height={mh} viewBox={`${vx} ${vy} ${vw} ${vh}`}>
        {shapes.list.map((row) => {
          const cell = cells.get(row.key);
          const dim = lit && row.key !== lit;
          return (
            <path
              key={row.key ?? row.name}
              d={row.d}
              fill={colourOf(cell)}
              fillOpacity={dim ? 0.28 : 1}
              stroke={row.key === lit ? BRAND.navy : "#FFFFFF"}
              strokeWidth={(row.key === lit ? 3.5 : 1.2) / Math.max(scale, 0.0001) * (S.u * 1)}
            />
          );
        })}
      </svg>
      {labels.map((label) => (
        <div
          key={label.key}
          style={{
            position: "absolute",
            left: label.x - S.u * 40,
            top: label.y - S.u * (label.big ? 30 : 14),
            width: S.u * 80,
            display: "flex",
            justifyContent: "center",
            fontFamily: "Anton",
            fontSize: S.u * (label.big ? 48 : 20),
            color: label.colour,
          }}
        >
          {label.text}
        </div>
      ))}
    </div>
  );

  const side_ = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: S.u * 12, justifyContent: "center", minWidth: 0, ...(S.story ? { width: "100%" } : {}) }}>
      {standings.map((party, index) => {
        const colour = partyColour(party.id);
        const person = contestants[party.id];
        return (
          <div key={party.id} style={{ display: "flex", alignItems: "center", gap: S.u * 12 }}>
            {person?.photo ? (
              <div style={{ display: "flex", width: S.u * 64, height: S.u * 64, borderRadius: 99, overflow: "hidden", border: `${S.u * 4}px solid ${colour}`, flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori */}
                <img src={person.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
              </div>
            ) : (
              <Badge id={party.id} size={S.u * 64} />
            )}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontFamily: "Anton", fontSize: S.u * 28, color: BRAND.navy }}>{party.id}</div>
                <div style={{ fontFamily: "Anton", fontSize: S.u * (index === 0 ? 38 : 30), color: index === 0 ? colour : BRAND.navy }}>{pct(party.share)}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Inter Tight", fontWeight: 600, fontSize: S.u * 16, color: BRAND.muted }}>
                <div style={{ display: "flex" }}>{`${num(party.votes)} votes`}</div>
                {map.cells?.length && payload.level !== "lga" ? (
                  <div style={{ display: "flex" }}>{`${won(party.id)} ${map.level === "nation" ? "states" : "LGAs"} led`}</div>
                ) : null}
              </div>
              <div style={{ display: "flex", height: S.u * 8, borderRadius: 99, background: BRAND.creamDeep, marginTop: S.u * 4 }}>
                <div style={{ width: `${Math.max(2, party.share)}%`, height: "100%", borderRadius: 99, background: colour }} />
              </div>
            </div>
          </div>
        );
      })}
      {/* A local government's own card lists its wards; a state's or the
          country's card has the map for that. */}
      {payload.level === "lga" && wards.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: S.u * 6, marginTop: S.u * 4 }}>
          <div style={{ fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 14, letterSpacing: 1.5, color: BRAND.muted }}>
            {`WARDS · ${wards.length} REPORTING`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: S.u * 6 }}>
            {wards.slice(0, S.story ? 12 : 8).map((ward) => (
              <div
                key={ward.scope}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: S.u * 6,
                  padding: `${S.u * 4}px ${S.u * 10}px`,
                  borderRadius: 999,
                  background: "#FFFFFF",
                  border: `${S.u * 2}px solid ${BRAND.creamDeep}`,
                  fontFamily: "Inter Tight",
                  fontWeight: 600,
                  fontSize: S.u * 14,
                  color: BRAND.navy,
                }}
              >
                <div style={{ width: S.u * 10, height: S.u * 10, borderRadius: 99, background: partyColour(ward.leader) }} />
                {`${ward.name.replace(/ Ward$/, "")} · ${ward.leader} ${pct(ward.share, 0)}`}
              </div>
            ))}
          </div>
        </div>
      )}
      {legend.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: S.u * 12, marginTop: S.u * 6, fontFamily: "Inter Tight", fontWeight: 600, fontSize: S.u * 14, color: BRAND.muted }}>
          {legend.map((id) => (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: S.u * 5 }}>
              <div style={{ width: S.u * 14, height: S.u * 14, borderRadius: S.u * 3, background: partyColour(id) }} />
              {`${id} leads`}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: S.u * 5 }}>
            <div style={{ width: S.u * 14, height: S.u * 14, borderRadius: S.u * 3, background: BRAND.cream, border: `${S.u * 2}px solid ${BRAND.creamDeep}` }} />
            No results yet
          </div>
          <div style={{ display: "flex" }}>{`· ${reportingCells} of ${shapes.list.length} ${map.level === "nation" ? "states" : "LGAs"} reporting · figure is the leader's share`}</div>
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: S.story ? "column" : "row",
        alignItems: "center",
        flex: 1,
        gap: S.u * 26,
        padding: `${S.u * 4}px ${S.pad}px ${S.u * 20}px`,
        minHeight: 0,
      }}
    >
      {mapBox}
      {side_}
    </div>
  );
}

/** A poster: breaking news, a situation, an incident, a quote. */
function Poster({ S, payload, item }) {
  const words = String(item?.body || payload.headline || item?.title || "").trim();
  const format = payload.format;
  const script = { "breaking-card": "Breaking", incident: "Alert", situation: "Update", quote: "They said" }[format] ?? "Update";
  const ring = format === "breaking-card" || format === "incident" ? BRAND.red : BRAND.navy;
  const size = Math.min(S.W - S.pad * 2, S.wide ? S.H * 0.6 : S.story ? S.W * 0.86 : S.W * 0.68);
  /* The largest size at which the words, wrapped, fill the circle's middle
     without spilling: Anton runs about 0.46 of its size per character. */
  const inner = size * 0.72;
  let fontSize = S.u * 96;
  while (fontSize > S.u * 28) {
    const perLine = Math.max(1, Math.floor(inner / (fontSize * 0.46)));
    const lines = Math.ceil(words.length / perLine) + 0.4;
    if (lines * fontSize * 1.1 <= size * 0.5) break;
    fontSize -= S.u * 2;
  }
  const where = payload.stamp?.place?.name ?? payload.place?.name ?? null;
  return (
    <div style={{ display: "flex", position: "relative", flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 0 }}>
      <Rays width={S.W} height={S.H} colour={BRAND.creamDeep} count={22} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: size,
          background: ring,
          color: "#FFFFFF",
          padding: size * 0.13,
          textAlign: "center",
          border: `${S.u * 10}px solid ${BRAND.cream}`,
        }}
      >
        <div style={{ fontFamily: "Yellowtail", fontSize: size * 0.14, lineHeight: 1, color: ring === BRAND.red ? BRAND.cream : BRAND.orange }}>{script}</div>
        <div style={{ fontFamily: "Anton", fontSize, lineHeight: 1.1, marginTop: size * 0.03, textTransform: "uppercase" }}>{words || "Update"}</div>
      </div>
      {where && (
        <div
          style={{
            position: "absolute",
            bottom: S.u * 22,
            left: S.pad,
            right: S.pad,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: S.u * 10,
              padding: `${S.u * 10}px ${S.u * 20}px`,
              borderRadius: 999,
              background: BRAND.navy,
              color: "#FFFFFF",
              fontFamily: "Inter Tight",
              fontWeight: 800,
              fontSize: S.u * 22,
            }}
          >
            <div style={{ width: S.u * 14, height: S.u * 14, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: BRAND.red }} />
            {where}
          </div>
        </div>
      )}
    </div>
  );
}

/** Turnout: the dial, huge. */
function Turnout({ S, payload }) {
  const f = payload.figures ?? {};
  const size = Math.min(S.H * 0.45, S.W * 0.62);
  return (
    <div style={{ display: "flex", flexDirection: S.wide ? "row" : "column", flex: 1, alignItems: "center", justifyContent: "center", gap: S.u * 30, minHeight: 0 }}>
      <Dial size={size} value={f.turnout} label="turnout" dark={false} />
      <div style={{ display: "flex", flexDirection: "column", gap: S.u * 12 }}>
        {[
          ["Registered", f.registered],
          ["Accredited", f.accredited],
          ["Votes cast", f.cast],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 16, letterSpacing: 1.5, color: BRAND.muted }}>{label.toUpperCase()}</div>
            <div style={{ fontFamily: "Anton", fontSize: S.u * 48, color: BRAND.navy }}>{value == null ? "—" : num(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Nothing({ S }) {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontFamily: "Inter Tight", fontWeight: 800, fontSize: S.u * 34, color: BRAND.muted }}>
      No results filed here yet
    </div>
  );
}

const STATE_CODE_BY_NUMBER = {
  "01": "ABI", "02": "ADA", "03": "AKW", "04": "ANA", "05": "BAU", "06": "BAY", "07": "BEN", "08": "BOR",
  "09": "CRO", "10": "DEL", "11": "EBO", "12": "EDO", "13": "EKI", "14": "ENU", "15": "GOM", "16": "IMO",
  "17": "JIG", "18": "KAD", "19": "KAN", "20": "KAT", "21": "KEB", "22": "KOG", "23": "KWA", "24": "LAG",
  "25": "NAS", "26": "NIG", "27": "OGU", "28": "OND", "29": "OSU", "30": "OYO", "31": "PLA", "32": "RIV",
  "33": "SOK", "34": "TAR", "35": "YOB", "36": "ZAM", "37": "FCT",
};

/* ───────────────────────────────────────────────────────────── the entry ── */

export const SIZES = {
  square: { W: 1080, H: 1080 },
  story: { W: 1080, H: 1920 },
  wide: { W: 1200, H: 675 },
};

/**
 * Draw one post.
 *
 * @param item         the desk item; its payload holds the frozen figures
 * @param shape        square | story | wide
 * @param contestants  { [party]: { name, photo } } for this contest
 */
export function renderCard({ item, shape = null, contestants = {} }) {
  const payload = item?.payload ?? {};
  const chosen = SIZES[shape ?? payload.shape] ? shape ?? payload.shape : "square";
  const { W, H } = SIZES[chosen];
  const S = {
    W,
    H,
    /* One unit of size, from whichever side binds: a wide card is short,
       and sizing it by its width is how the columns came out crushed. */
    u: Math.min(W / 1080, (H / 1080) * 1.25),
    pad: Math.round(Math.min(W / 1080, (H / 1080) * 1.25) * (chosen === "wide" ? 52 : 52)),
    story: chosen === "story",
    wide: chosen === "wide",
  };
  const layout = layoutFor(payload);
  const kicker =
    layout === "poster"
      ? { "breaking-card": "Breaking", incident: "Incident report", situation: "Situation update", quote: "Quote" }[payload.format] ?? "Update"
      : LEVEL_LABEL[payload.level ?? "nation"] ?? "Live result";

  const body =
    layout === "poster" ? (
      <Poster S={S} payload={payload} item={item} />
    ) : layout === "turnout" ? (
      <Turnout S={S} payload={payload} />
    ) : layout === "bars" ? (
      <Bars S={S} payload={payload} contestants={contestants} />
    ) : layout === "map" ? (
      <MapCard S={S} payload={payload} contestants={contestants} />
    ) : (
      <Faces S={S} payload={payload} contestants={contestants} />
    );

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: BRAND.cream, fontFamily: "Inter Tight" }}>
        <Header S={S} payload={payload} kicker={kicker} />
        {layout !== "poster" && (
          <Title
            S={S}
            verdict={layout !== "turnout"}
            payload={{ ...payload, place: payload.headline ? { ...payload.place, short: payload.headline } : payload.place }}
          />
        )}
        {body}
        <Footer S={S} payload={payload} />
      </div>
    ),
    { width: W, height: H, fonts: fonts() }
  );
}
