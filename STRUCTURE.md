# Poll360, file structure

The shape of the whole product, and what is in the repository today.

Status is marked throughout: **[built]** is in this repository and runs,
**[next]** is designed and not yet written. Nothing is listed as built that is
not, which is the same rule the product applies to its own results.

---

## 1. What is in the repository today

The site scaffold, the design system, and the home page, complete, with a
working demonstration board on it.

```
Poll360/
├── app/
│   ├── globals.css              [built]  the whole design system
│   ├── layout.js                [built]  fonts, metadata, JSON-LD, chrome
│   ├── page.jsx                 [built]  THE HOME PAGE
│   ├── login/page.jsx           [built]  the way in
│   ├── login/actions.js         [built]  signIn / signOut server actions
│   ├── console/page.jsx         [built]  where signing in lands
│   ├── actions/access.js        [built]  the request-access action
│   ├── manifest.js              [built]  the installed app
│   ├── offline/page.jsx         [built]  shown when there is no connection
│   ├── not-found.jsx            [built]
│   ├── robots.js · sitemap.js   [built]
│   └── icon.svg                 [built]  the coverage-dial mark
│
├── components/
│   ├── site/
│   │   ├── Masthead.jsx         [built]  sticky, red rule, mobile drawer
│   │   └── Footer.jsx           [built]  standing "not a commission" disclosure
│   ├── auth/
│   │   └── LoginForm.jsx        [built]  email-or-phone + password, server action
│   ├── pwa/
│   │   └── AppShell.jsx         [built]  worker, update offer, install, offline
│   ├── ui/
│   │   ├── Button.jsx           [built]  one button, six variants
│   │   ├── Section.jsx          [built]  rhythm + numbered ruled headings
│   │   ├── Reveal.jsx           [built]  visible by default; animates only as
│   │   │                                 an enhancement, so the page is whole
│   │   │                                 with JavaScript off
│   │   ├── Counter.jsx          [built]  rAF count-up, real value in the DOM
│   │   ├── BrandMark.jsx        [built]  the dial
│   │   └── Wordmark.jsx         [built]  mark + wordmark
│   ├── board/                            the instrument surface
│   │   ├── LiveBoard.jsx        [built]  playback, pausing, scrubbing
│   │   ├── NationMap.jsx        [built]  choropleth + tooltip
│   │   ├── Standings.jsx        [built]  party bars + margin
│   │   ├── CoverageMeter.jsx    [built]  filed vs verified vs register
│   │   ├── Ticker.jsx           [built]  latest returns
│   │   └── StateTable.jsx       [built]  the same data, no colour in it
│   └── home/
│       ├── Hero.jsx             [built]
│       ├── ReturnCard.jsx       [built]  one filed return, as the field app files it
│       ├── Disciplines.jsx      [built]
│       ├── Chain.jsx            [built]
│       ├── Rooms.jsx            [built]
│       ├── Broadcast.jsx        [built]
│       ├── Levels.jsx           [built]
│       ├── Statement.jsx        [built]
│       ├── Refusals.jsx         [built]
│       ├── StatusBoard.jsx      [built]
│       └── Access.jsx           [built]
│
├── prisma/
│   ├── schema.prisma            [built]  users, sessions, access requests
│   └── seed.mjs                 [built]  makes the first account
│
├── lib/
│   ├── db.js                    [built]  one Prisma client per process
│   ├── password.js              [built]  scrypt, from node:crypto, no deps
│   ├── session.js               [built]  opaque cookie, hashed token, DB truth
│   ├── ratelimit.js             [built]  fixed window, per process
│   ├── utils.js                 [built]  cn(), number and share formatting
│   ├── site.js                  [built]  product facts, nav, the register
│   ├── content.js               [built]  the page's argument, in one file
│   ├── election2023.js          [built]  declared 2023 results + party colours
│   └── replay.js                [built]  turns them into an arriving evening
│
├── public/
│   ├── geo/map/states.json      [built]  source: projected ADM1, 1dp
│   ├── geo/map/nation.json      [built]  built artefact: rounded, simplified
│   ├── icons/*.png              [built]  installed-app icons, incl. maskable
│   └── sw.js                    [built]  hand-written service worker
│
├── scripts/
│   ├── build-map.mjs            [built]  states.json -> nation.json
│   └── build-icons.mjs          [built]  the mark -> installed-app icons
│
└── STRUCTURE.md · README.md · configs
```

### Why the content lives in `lib/content.js`

Every claim the home page makes is in one file rather than scattered through
twelve components. A page whose argument can only be read by opening twelve
files is a page nobody re-reads, and this one has to stay true as the product
moves.

### Why `nation.json` is a build artefact and is committed

`scripts/build-map.mjs` rounds the projected boundaries to whole SVG units
(~1.1km at national scale), drops points the rounding duplicated, and drops the
middle of any collinear run. 226KB becomes 90KB, ~31KB over the wire, and it
renders identically at the size it is drawn.

It is committed so the site builds with no network access and the map cannot
change under us between deploys.

---

## 2. The application tier

Everything below is designed and specified; none of it is in this repository
yet. It is listed here because the home page describes it, and a structure
document that only lists what is finished is not a plan.

```
app/
├── (site)/                      [next]  the public marketing surfaces
│   ├── page.jsx                          -> already at app/page.jsx
│   ├── product/…                         field / situation room / broadcast
│   ├── method/…                          the six levels, integrity, method
│   └── legal/{privacy,terms}/
│
├── results/                     [next]  the public count
│   ├── page.jsx                          national map, standings, ticker
│   └── [state]/page.jsx                  ?lga= and ?ward= drill-down
│
├── field/                       [next]  THE AGENT'S DASHBOARD
│   ├── layout.jsx                        no site chrome; one task per screen
│   ├── page.jsx                          the booth, printed, and the open elections
│   └── [electionId]/page.jsx             the return form
│
├── console/                     [next]  THE SITUATION ROOM
│   ├── layout.jsx
│   ├── page.jsx                          coverage, exceptions, the queue
│   ├── returns/page.jsx                  scoped review queue
│   ├── returns/[id]/page.jsx             one return beside its photographed sheet
│   ├── coverage/page.jsx                 what is missing, by state / LGA / ward
│   └── gap/page.jsx                      declared figure vs what agents filed, ranked
│
├── board/                       [next]  BROADCAST OUTPUT (framing allowed here)
│   ├── wall/[scope]/page.jsx             16:9 board for a video wall
│   ├── lower-third/[scope]/page.jsx      transparent-background browser source
│   └── card/[state]/page.jsx             full-frame state card
│
└── api/
    ├── results/route.js         [next]  POST, file or amend a return
    ├── results/[id]/route.js    [next]  PATCH, verify / dispute
    ├── results/[id]/sheet/route.js [next]  GET, the photograph, scoped
    ├── units/nearest/route.js   [next]  POST, position -> the agent's unit
    └── export/[dataset]/route.js [next]  GET, CSV / JSON within scope
```

```
lib/                             [next]
├── db.js                                 Prisma client
├── auth.js, session.js, permissions.js   who is asking, and what they may see
├── appointments.js                       agentPost(memberId) -> the booth
├── results.js                            validateReturn(), fileReturn()
├── elections.js                          tally, breakdown, reporting, latestReturns
├── geolocation.js                        distance, accuracy, corroboration
└── photos.js                             decode, orient, resize, re-encode, hash
```

---

## 3. The field dashboard, in detail

The screen the whole product depends on. An agent files from a phone, held one
handed, standing up, at night, on a connection that may not hold.

### How the booth is decided

**The booth is never read from the request.** It is resolved on the server from
the agent's active appointment, on every single submission:

```
session cookie -> member -> agentPost(memberId) -> the polling unit
                                                -> its ward, LGA, state
```

No appointment, no booth, 403. A form field naming the booth would be a form
field somebody could change, so there is no such field, and no dropdown, which
is the same hole with a nicer interface.

### How location is used

Position is **corroboration, not authorisation**. On opening the form the
dashboard reads the device's position and matches it against the coordinates of
the unit on the appointment:

```
1. navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true })
2. POST /api/units/nearest  { lat, lon, accuracy }
3. server: haversine( fix, unit-on-appointment )
              -> { distance, accuracy, band }
4. the form shows the agent the result in words:
     matched     within 250m               "Position matched to your unit"
     near        250m, 2km                "You appear to be near your unit"
     far         beyond 2km                "You are some way from your unit"
     unavailable permission denied / no fix "Position unavailable"
5. distance, accuracy, band and timestamp are stored on the return
```

Four consequences, each deliberate:

- **A `far` reading never blocks a filing.** Rural fixes drift, buildings block
  sky, and a returning officer moving a booth fifty metres is not fraud. It is
  recorded, it is visible to the coordinator reviewing the return, and it is
  sortable in the queue.
- **A `matched` reading never authorises one.** Standing at the right booth is
  not the same as holding the seat at it. The appointment decides; the fix
  corroborates.
- **The agent is told what was recorded, in words, before they submit.** No
  silent telemetry.
- **Position is stored against the return, not tracked.** One fix, at one
  moment, for one filing. There is no background location and no history.

### What else the screen does

- The booth is **printed, not chosen**, confirmed, never selected.
- Numeric keypads on every field; a running total as figures are typed.
- Arithmetic checked in the browser first (`accredited ≤ registered`,
  `cast + rejected ≤ accredited`, `cast > 0`, nothing negative), then again on
  the server, which is the one that counts.
- The result sheet is photographed and downscaled to ~1600px **before** upload,
  then re-encoded and content-hashed server-side.
- The draft is held locally as they type, keyed by `(election, unit)`, so a
  dropped connection costs a retry and not the figures.
- Both affirmations, position confirmed, terms accepted, are stored.

---

## 4. Data model

```
Election ──< Candidate >── Party
   │                         │
   └──< PollingUnitResult >──┴── ResultVote      one row per party that scored
              │
              ├── ResultSheet                    the photograph, in its own table
              ├── ResultPosition                 the fix, as evidence
              └── PollingUnit ── Ward ── Lga ── State ── Zone
```

**`PollingUnitResult`** is unique on `(electionId, pollingUnitId)`. A booth
reports once; a correction amends that row. It carries `wardId`, `lgaId` and
`stateId` denormalised, written by the server from the polling unit, never
accepted from the client, which is what makes a state total one grouped scan
of an indexed column instead of a four-table join across 176,623 rows.

INEC's declared figures live in their own columns (`inecAccredited`,
`inecTotalVotes`) and are never merged with the agent's count. The gap between
them is the point.

**`ResultVote`** is a row per party rather than a column per party, so the
ballot changes between elections without a migration.

**`ResultSheet`** holds the bytes apart from the result row, because a result
row has to stay small enough to aggregate 176,623 of them. Its `version` is a
content hash: the `?v=` in the URL, the ETag on the response, and the proof that
the image served next year is the image filed tonight.

**`ResultPosition`** holds one fix per return: latitude, longitude, accuracy,
distance from the appointed unit, band, and time.

---

## 5. Conventions

| Rule | Why |
|---|---|
| Server components by default; `"use client"` only for state, hover or playback | The map is 90KB of geometry, it belongs in the RSC payload, not the bundle |
| Components read semantic tokens (`--content`, `--hairline`), never ramp steps | A band sets `.on-dark` once and everything inside it inverts |
| Square corners everywhere; structure from rules, never shadows | The Labour/Ford grammar, and it survives projection onto a wall |
| Every figure in the mono face | A ticking total must not reflow the words beside it |
| Brand red stops at the edge of the board | LP's red is a fill; two reds meaning two things in one frame teaches distrust |
| Parties keep their own hues, re-stepped only in lightness | A chart that invents a party's colour is one nobody reads at a glance |
| The one CVD-failing pair carries a hatch | PDP green vs LP red is ΔE 3.5, unfixable by any hex |
| Colour is never the only encoding | Codes in type, names in tooltips, and a colourless table |
| Coverage printed beside every total | The rule the whole product exists to enforce |

### Commands

```bash
npm run dev                # develop
npm run build              # production build
node scripts/build-map.mjs # rebuild nation.json (only if boundaries are revised)
```
