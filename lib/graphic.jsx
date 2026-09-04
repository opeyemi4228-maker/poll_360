import { ImageResponse } from "next/og";

import { raceLabel } from "@/lib/races";
import { register } from "@/lib/site";

/**
 * The count, drawn as a picture a desk can post.
 *
 * ── WHY THIS IS NOT INSIDE THE ROUTE ───────────────────────────────────────
 * The route's job is who may ask and what the figures are; this file's job is
 * what the picture looks like. Keeping them apart is what lets the layout be
 * rendered from a harness with known figures — an ImageResponse fails at run
 * time, not at build time, and the only honest way to know a graphic still
 * draws is to draw one.
 *
 * ── WHAT EVERY SHAPE CARRIES, ALWAYS ───────────────────────────────────────
 *   · the share of booths behind the total, printed beside it;
 *   · the minute it was true, in Lagos time;
 *   · the sentence saying this is a parallel count and not a declaration.
 *
 * Those are not decoration. A total without its coverage is the most dangerous
 * figure this product can put into the world, and it is exactly the figure a
 * photograph of a screen crops out.
 */

export const SHAPES = {
  wide: { width: 1200, height: 675 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

/* The board's own colours, as literals: this renders outside the browser, so
   there is no stylesheet and no custom properties to resolve. They are the
   same hues globals.css holds, which is asserted nowhere and is why this list
   is short and named. */
const INK = "#0B0D11";
const PANEL = "#14171E";
const LINE = "#252A34";
const MUTED = "#8A909B";
const RED = "#E8112D";

const PARTY_COLOUR = {
  APC: "#6BAEE0",
  PDP: "#12A150",
  LP: "#E5484D",
  NNPP: "#37A65A",
  APGA: "#F5A524",
  ADC: "#8B5CF6",
  SDP: "#2DD4BF",
  APM: "#F97316",
  NDC: "#A78BFA",
  ACCORD: "#EAB308",
};

const colourFor = (id) => PARTY_COLOUR[id] ?? "#6B7280";

export function countGraphic({ project, race, tally, standings, shape }) {
  const counted = standings.reduce((sum, party) => sum + party.votes, 0);
  const leader = standings[0] ?? null;
  const second = standings[1] ?? null;
  const coverage = (tally.units / register.pollingUnits) * 100;
  const scale = Math.max(leader?.votes ?? 1, 1);

  const stamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  const big = shape.height >= 1080;
  const pad = big ? 72 : 56;

  /* ── EVERY PARTY THAT POLLED IS NAMED SOMEWHERE ON THE CARD ─────────────
     A wide crop fits four rows and a tall one six, which is a fact about the
     picture and must not become a fact about the count: the parties past the
     cut were disappearing from a graphic that then went out as the summary of
     the night. The ones with rows get rows; the rest get named on one line
     with their votes, because "ADC 31,204" in small type is a figure and
     silence is not. */
  const rowLimit = big ? 6 : 4;
  const listed = standings.slice(0, rowLimit);
  const rest = standings.slice(rowLimit);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: INK,
          color: "#ffffff",
          padding: pad,
          fontFamily: "sans-serif",
        }}
      >
        {/* ---------------------------------------------------------- head */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: RED,
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            P
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Poll360</div>
            <div style={{ fontSize: 15, color: MUTED }}>Parallel vote tabulation</div>
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${LINE}`,
              fontSize: 15,
              color: MUTED,
            }}
          >
            {stamp} WAT
          </div>
        </div>

        {/* --------------------------------------------------------- title */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: big ? 48 : 28 }}>
          <div style={{ fontSize: big ? 22 : 18, color: MUTED, letterSpacing: 2 }}>
            {(project?.title ?? "No election open").toUpperCase()}
          </div>
          <div style={{ fontSize: big ? 58 : 44, fontWeight: 800, letterSpacing: -1.5 }}>
            {raceLabel(race)}
          </div>
        </div>

        {/* ----------------------------------------------------- standings */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: big ? 22 : 14,
            marginTop: big ? 44 : 26,
          }}
        >
          {standings.length === 0 && (
            <div style={{ fontSize: big ? 30 : 24, color: MUTED, lineHeight: 1.4 }}>
              No returns have been filed for this contest yet. Nothing here is a projection.
            </div>
          )}

          {listed.map((party) => (
            <div key={party.id} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  display: "flex",
                  width: big ? 132 : 104,
                  fontSize: big ? 34 : 28,
                  fontWeight: 800,
                  color: colourFor(party.id),
                }}
              >
                {party.id}
              </div>
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  height: big ? 26 : 20,
                  background: PANEL,
                  borderRadius: 999,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: `${Math.max(2, (party.votes / scale) * 100)}%`,
                    background: colourFor(party.id),
                    borderRadius: 999,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  width: big ? 230 : 190,
                  justifyContent: "flex-end",
                  fontSize: big ? 34 : 28,
                  fontWeight: 700,
                }}
              >
                {new Intl.NumberFormat("en-NG").format(party.votes)}
              </div>
              <div
                style={{
                  display: "flex",
                  width: big ? 120 : 96,
                  justifyContent: "flex-end",
                  fontSize: big ? 26 : 21,
                  color: MUTED,
                }}
              >
                {counted ? `${((party.votes / counted) * 100).toFixed(1)}%` : "—"}
              </div>
            </div>
          ))}
        </div>

        {rest.length > 0 && (
          <div
            style={{
              display: "flex",
              marginTop: big ? 20 : 12,
              fontSize: big ? 22 : 18,
              color: MUTED,
            }}
          >
            Also standing:{" "}
            {rest
              .map((party) => `${party.id} ${new Intl.NumberFormat("en-NG").format(party.votes)}`)
              .join("  ·  ")}
          </div>
        )}

        {/* ── THE FIGURE THAT QUALIFIES EVERY OTHER FIGURE ──────────────────
            Booths in, and the lead, on the same row as the totals above. This
            is the row a photograph of a screen always loses. */}
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: "auto",
            paddingTop: big ? 40 : 24,
          }}
        >
          {[
            ["Booths in", `${coverage < 0.1 && coverage > 0 ? "<0.1" : coverage.toFixed(1)}%`],
            ["Returns", new Intl.NumberFormat("en-NG").format(tally.units)],
            [
              "Lead",
              leader && second
                ? new Intl.NumberFormat("en-NG").format(leader.votes - second.votes)
                : "—",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: big ? "22px 26px" : "16px 20px",
                background: PANEL,
                border: `1px solid ${LINE}`,
                borderRadius: 16,
              }}
            >
              <div style={{ fontSize: big ? 19 : 16, color: MUTED, letterSpacing: 1.5 }}>
                {label.toUpperCase()}
              </div>
              <div style={{ fontSize: big ? 44 : 34, fontWeight: 800, marginTop: 6 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ---------------------------------------------------------- foot */}
        <div
          style={{
            display: "flex",
            marginTop: big ? 32 : 20,
            paddingTop: big ? 24 : 16,
            borderTop: `1px solid ${LINE}`,
            fontSize: big ? 21 : 17,
            color: MUTED,
            lineHeight: 1.4,
          }}
        >
          Our agents&rsquo; own count, filed from {new Intl.NumberFormat("en-NG").format(tally.units)}{" "}
          polling units. It is not a declaration and it is not a projection — only INEC declares a
          result.
        </div>
      </div>
    ),
    {
      ...shape,
      headers: {
        /* A count changes by the minute; a cached graphic is a wrong graphic
           posted with a right-looking timestamp. */
        "cache-control": "no-store",
      },
    }
  );
}
