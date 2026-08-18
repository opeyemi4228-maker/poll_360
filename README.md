# Poll360

**From the booth to the broadcast.**

Parallel vote tabulation infrastructure for Nigerian elections: a named agent in
every polling unit, a photographed result sheet behind every figure, and the
share of booths counted printed beside every total — on the situation room wall,
in the studio, and in the export, at the same second.

This repository currently contains the **site scaffold, the design system and
the home page**, including a working demonstration board. The application tier —
field dashboard, situation room, broadcast output, API — is specified in
[STRUCTURE.md](STRUCTURE.md) and not yet written.

---

## Running it

```bash
npm install
npm run dev              # http://localhost:3000
npm run build            # production build
```

Rebuilding the map is only necessary if the boundary source is revised:

```bash
node scripts/build-map.mjs
```

## Stack

Next.js 16 (App Router, React 19) · Tailwind CSS v4 · lucide-react. No CSS-in-JS,
no component library, no chart library — the board is SVG and CSS.

## The three things to read first

1. **[`app/globals.css`](app/globals.css)** — the design system. Colour ramps in
   OKLCH, the semantic token layer that lets a section invert with one class,
   and the reasoning behind both.
2. **[`lib/election2023.js`](lib/election2023.js)** — the declared results of
   the 2023 presidential election, the parties' real colours, and a full
   measurement of the one colour-blindness pair that palette cannot separate.
   **[`lib/replay.js`](lib/replay.js)** turns it into an arriving evening.
3. **[`STRUCTURE.md`](STRUCTURE.md)** — the whole product's shape, including the
   field dashboard's location flow.

## Two rules that shape everything here

**Silence is not zero.** A booth nobody has reported from is drawn grey and
labelled "no returns yet" — never in a party's colour, never as a low number.

**Coverage travels with every total.** A leader on 4% of booths is not a leader.
Every figure this system publishes is shown beside the share of booths behind it.

## On the board

The home page replays the **2023 Nigerian presidential election** with its real
declared results: APC 12 states, PDP 12, LP 12, NNPP 1, and every vote figure
checkable against the record.

What is not real is the order and timing of arrival — INEC publishes no
per-booth arrival log — so the replay distributes each state's declared total
across batches that sum to it exactly. The board says this on its face, above
the numbers rather than under them, because a screenshot of an election board
travels further than the page around it.

Two source discrepancies are reproduced rather than reconciled: Wikipedia's
Kwara and Yobe rows do not sum to their own stated totals, so the 37 rows come
to 24,026,730 valid votes against INEC's declared 24,025,940. Both figures are
printed under the board.

## Attribution

Boundaries: [geoBoundaries](https://www.geoboundaries.org) (gbOpen), CC BY 4.0 —
attribution is printed under the map. Register: INEC — 37 states, 774 LGAs,
8,809 registration areas, 176,623 polling units.

Poll360 is not an electoral commission and publishes no official result.
