# Poll360 — the whole project

**From the booth to the broadcast.**

One document covering what this product is, what is in the repository, how a
result travels through it, and where every part of it lives. Written to be read
start to finish by somebody new, and then used as a map.

Current as of the commit that added this file. Where an older document in this
repository disagrees, this one is right — see [§19](#19-the-other-documents).

---

## Contents

1. [What it is](#1-what-it-is)
2. [The two rules everything derives from](#2-the-two-rules-everything-derives-from)
3. [Status: what actually runs](#3-status-what-actually-runs)
4. [Three products, one record](#4-three-products-one-record)
5. [Who uses it](#5-who-uses-it)
6. [Roles and capabilities](#6-roles-and-capabilities)
7. [Addresses: two domains, one deployment](#7-addresses-two-domains-one-deployment)
8. [The journey of a result](#8-the-journey-of-a-result)
9. [Integrity screening](#9-integrity-screening)
10. [Reading the sheet](#10-reading-the-sheet)
11. [The rooms](#11-the-rooms)
12. [The data model](#12-the-data-model)
13. [The library](#13-the-library)
14. [Components](#14-components)
15. [Tests](#15-tests)
16. [Scripts](#16-scripts)
17. [Configuration](#17-configuration)
18. [Running and deploying](#18-running-and-deploying)
19. [The other documents](#19-the-other-documents)
20. [House style](#20-house-style)
21. [Things to watch](#21-things-to-watch)

---

## 1. What it is

Poll360 is a **parallel vote tabulation** system for Nigerian elections. It is
not an electoral commission and it publishes no official result. It runs a
second, independently sourced count of the same ballot boxes INEC counts, so
that when a figure is announced there is something to hold it against other
than trust.

The shape of it in one paragraph: a named person stands in a polling unit. When
counting finishes they read the result off Form EC8A, type the figures into a
phone and photograph the sheet. The system checks the figures against the sheet,
checks the sheet against its own arithmetic, attaches the booth code, and puts
the total in front of a situation room, a newsroom and a video wall in the same
second — always printed beside the share of booths that total is built from.

The ground it is sized against, as INEC publishes it ([lib/site.js](lib/site.js)):

| | |
|---|---|
| States | 37 (36 + the Federal Capital Territory) |
| Geopolitical zones | 6 |
| Local governments | 774 |
| Wards | 8,809 |
| Polling units | 176,623 (56,737 of them created in the 2021 expansion) |

A polling unit code carries its own address — `SS/LL/WW/UUU` is state, local
government, ward, unit — so the hierarchy is read off the code rather than
stored beside it. Storing both would let the two disagree, and on the night they
disagree the code wins, because the code is what is printed on the sheet in the
agent's hand ([lib/units.js](lib/units.js)).

---

## 2. The two rules everything derives from

**Silence is not zero.** A booth nobody has reported from is drawn grey and
labelled "no returns yet" — never in a party's colour, never as a low number. An
absence is an absence, not a result.

**Coverage travels with every total.** A leader on 4% of booths is not a leader.
Every figure the system publishes carries the share of booths behind it: on the
wall, in the studio, and in the CSV export.

These are not slogans in a README. They are why [lib/coverage.js](lib/coverage.js)
exists as testable arithmetic rather than a number computed inside a component,
why [lib/tally.js](lib/tally.js) was pulled out into four lines that import
nothing, and why the board has a `CoverageMeter` next to every standing.

A third rule governs the accusations: **it never says "fraud."** The integrity
screen states the arithmetic and names the unit so it can be read against its
photographed sheet. A system that accused people automatically would be worse
than useless, because the first false accusation would discredit every true one.

---

## 3. Status: what actually runs

626 files. 1,089 tests across 264 suites, all passing (`npm test`).

| Area | Files | State |
|---|---|---|
| `lib/` | 158 | Domain logic, storage, intake, integrity, the AI, the record |
| `components/` | 144 | Every screen |
| `public/` | 127 | Map geometry, icons, party marks, service worker |
| `tests/` | 74 | Node's own test runner, no test dependency |
| `app/` | 61 | Routes, layouts, server actions, API |
| `scripts/` | 31 | Build, import, seed, migrate, replay, index build |
| `prisma/` | 10 | Schema and 8 migrations |

Everything described in this document is built and runs. The application tier,
the field dashboard, the situation room, the broadcast arm, the API, the
WhatsApp intake and the agents' app are all in the repository.

### What was hardened, and where it is written down

The product works the same and carries a great deal more load. Two documents
cover it, and both state their own limits rather than leaving them to be found:

- **[SECURITY.md](SECURITY.md)** — the threat this is built against, what each
  defence is actually for, and what it deliberately does not do. The short
  version: the content security policy is **enforced** with a per-request nonce
  rather than report-only; every rate limit was keyed on a header the caller
  sends and is now keyed on an address that was established; failed sign-ins are
  counted somewhere every instance can see; and every delivery to Data Bank is
  **signed**, because evidence that can be altered in transit is not evidence.

- **[SCALE.md](SCALE.md)** — what this can carry and where the ceiling is. The
  short version: board figures are shared between everybody asking the same
  question, totals are computed in the database instead of by reading every row,
  the ground filter is an index scan rather than a table scan, and the pipeline
  to Data Bank is bounded and drains itself. Reading and writing results both
  scale; the honest ceiling is signed-in request volume, and §5 says what would
  have to change past it.

---

## 4. Three products, one record

Poll360 is one of three products that share a record.

```
   POLL360                AGENT360                 DATA BANK
   what was the result    was somebody             what arrived, from whom,
                          actually standing        when, and what happened
                          there                    to it
       │                       │                        │
       └───────── figures ─────┴──── check-ins ─────────┤
                                                        │
                        sealed and chained for the eighteen months
                        between a polling day and a tribunal
```

**Data Bank** (formerly DumpSite) is the intake, classification and routing hub.
Everything this product receives is also delivered there:
`REGISTRATION`, `RESULT_SHEET`, `RESULT_FIGURES`, `SITUATION_REPORT` and
`MESSAGE`. It all goes through one function in
[lib/databank.js](lib/databank.js), because four call sites each with their own
idea of what a payload looks like means the day one of them is wrong is the day
somebody needs the record.

That door **never blocks and never throws.** Whatever does not land is kept in
`dumpsite_outbox` and can be sent again with `npm run databank:replay`, which is
safe to run twice — the hub dedupes on the external id every row carries.

Data Bank also holds two things Poll360 deliberately does not:

- **The agent list.** Poll360 keeps no list of agents. It asks Data Bank three
  questions: who is waiting (the approval screen), what an administrator decided
  (which issues a code), and whether a code somebody typed belongs to an
  approved agent (every sign-in). See [lib/databank-agents.js](lib/databank-agents.js).
- **The database.** The original Postgres database reached its plan's storage
  ceiling, and a database that cannot grow cannot take a sign-in or a filed
  return on an election night. Every table was copied row for row into Data
  Bank's own database. With `DATABANK_DATABASE_URL` set, that is where Poll360
  reads and saves; `DATABASE_URL` is untouched, and unsetting the new one goes
  back to the original. One module decides: [lib/database-url.js](lib/database-url.js).

**Agent360** holds check-ins, the SOS and presence scores. The two products
share a database, and the rule that keeps that survivable is **one writer per
table** — so the agents' app signs a request and Agent360 does the writing. The
signature covers this body at this second, cannot be moved onto another phone
number, and expires in five minutes ([lib/agent-door.js](lib/agent-door.js),
[lib/agent360.js](lib/agent360.js)). Every call has a short timeout, and filing a
return never waits on any of it.

---

## 5. Who uses it

There are **two separate populations**, held in two separate tables, with two
separate session systems.

### Staff accounts (`User`)

A newsroom's handful. Issued a credential by an administrator, hold a room, sign
in with email-or-phone and a password. Sessions in
[lib/session.js](lib/session.js).

### Polling unit coordinators (`Coordinator`)

Thousands of them. They sign themselves up, are approved by a human who checks a
booth against an appointment list, hold exactly one power — file the returns
from one booth — and are finished the morning after polling day. Sessions in
[lib/coordinator-session.js](lib/coordinator-session.js).

They are deliberately not one table. Sharing one meant a sign-in page addressing
both audiences and serving neither, and one code path where a mistake made for
the four thousand could reach the four. They meet in exactly one place: the
bridge column on `results`, which records that a return was filed by a
coordinator rather than by staff ([lib/coordinators.js](lib/coordinators.js)).

The cost is real and is written down in the code: two sweepers, two cookies, two
sign-out paths, and a change to how sessions work has to be made twice.
Parameterising one module over a table name would have saved forty lines and
made a single mistyped argument into a privilege escalation.

### How a coordinator signs in

With a code and nothing else. It looks like this:

```
    33-0101001-K7M4QX
    ── ─────── ──────
    │     │       └ six random symbols: the credential
    │     └ their booth, so they can check it against their sheet
    └ their state
```

Not the polling unit code itself. That is public — printed at the top of every
result sheet and in INEC's own published list — and it is not unique to a
person. Accepting it as a credential means anybody holding a result sheet can
sign in as the agent for that booth ([lib/agent-code.js](lib/agent-code.js)).

Data Bank confirms the code on every sign-in. When Data Bank cannot be reached
nobody new can sign in and the form says so, rather than calling a good code
wrong; an agent already signed in keeps filing. Poll360 stores no codes —
[lib/agent-code-vault.js](lib/agent-code-vault.js) seals the agent's own code in
a cookie on the agent's own phone, because Data Bank's agent doors will not take
a claim about a polling unit without one.

---

## 6. Roles and capabilities

Six roles, seventeen capabilities, one table
([lib/roles.js](lib/roles.js)). Permissions are a table rather than
`if (role === "SUPER_ADMIN")` scattered through the app: when somebody asks "who
can see the sheets?", the answer has to be readable in one place, and adding a
fifth room must not mean auditing forty components.

| Role | Home | What it is |
|---|---|---|
| `SUPER_ADMIN` | `/admin` | Everything, everywhere, plus issuing accounts |
| `PU_AGENT` | `/field` | One booth, one person. The account that produces the data |
| `BROADCASTER` | `/broadcast` | A newsroom or studio. Reads and renders; never writes a result |
| `SITUATION_ROOM` | `/room` | A party or coalition war room |
| `WHATSAPP_DESK` | `/whatsapp` | Reads and answers every polling unit filing over WhatsApp |
| `VIEWER` | `/console` | Signed in, nothing assigned yet |

| Capability | Held by |
|---|---|
| `accounts:issue` | `SUPER_ADMIN` |
| `results:file` | `PU_AGENT` |
| `results:upload` | `SUPER_ADMIN`, `SITUATION_ROOM` |
| `results:verify` | `SUPER_ADMIN` |
| `sheets:read` | `SUPER_ADMIN`, `SITUATION_ROOM` |
| `incidents:file` | `PU_AGENT` |
| `incidents:read` | `SUPER_ADMIN`, `SITUATION_ROOM`, `BROADCASTER` |
| `broadcast:render` | `SUPER_ADMIN`, `BROADCASTER` |
| `broadcast:draft` | `SUPER_ADMIN`, `BROADCASTER` |
| `broadcast:clear` | `SUPER_ADMIN`, `BROADCASTER` |
| `broadcast:air` | `SUPER_ADMIN`, `BROADCASTER` |
| `results:export` | `SUPER_ADMIN`, `BROADCASTER`, `SITUATION_ROOM` |
| `gap:read` | `SUPER_ADMIN`, `SITUATION_ROOM`, `BROADCASTER` |
| `declared:file` | `SUPER_ADMIN`, `SITUATION_ROOM` |
| `whatsapp:read` | `SUPER_ADMIN`, `SITUATION_ROOM`, `WHATSAPP_DESK` |
| `whatsapp:claim` | `SUPER_ADMIN` |
| `system:read` | `SUPER_ADMIN` |

Four of these splits carry an argument worth knowing:

- **`results:file` vs `results:upload`.** A coordinator files their own booth and
  cannot name another: the unit comes from their appointment and is not a field
  on their form. `results:upload` is the desk's version — a return read down the
  phone from a booth with no signal — and it is a different grant because a form
  that lets somebody type a unit code is a form that can file for a booth nobody
  appointed them to.
- **`gap:read` vs `declared:file`.** The broadcast desk reads the comparison and
  deliberately cannot write one side of it. Whoever types the declared figure
  decides what our count is being held against, and a wrong entry there
  manufactures a divergence that is entirely our own doing.
- **Draft, clear and air are three powers, not one.** A product that grants them
  as one has no editorial control — it has a button. All three sit with the same
  role today, but the separation the desk actually depends on is between
  *people* and is enforced on the item: nobody may clear something they drafted
  themselves ([app/broadcast/actions.js](app/broadcast/actions.js)).
- **`whatsapp:read`** is the most sensitive read in the product, because a
  thread names a booth and a person in the same breath. It is never granted to
  the broadcast desk.

### The guard

Every dashboard page calls [`requireUser`](lib/guard.js) as its first statement.
Not in middleware, not in a layout a client route change can skip, and never in
the browser — so no route renders before "who is this and may they be here?" has
been answered against the database.

A signed-out visitor goes to sign in. A signed-in one who has wandered into
somebody else's room is sent to their own, not shown a 403, which would confirm
the other room exists and is worth attacking. `?next=` is deliberately not echoed
back into the sign-in redirect: an open redirect on a sign-in page is how a
phishing link gets to wear your domain.

---

## 7. Addresses: two domains, one deployment

Agents do not sign in to Poll360. They open **"Agents"** at its own address, with
its own name, icon and manifest, and install it to the home screen as its own
app. Nothing an agent sees says Poll360, and Poll360's staff sign-in does not
point at agents.

It is still one deployment. [proxy.js](proxy.js) — Next.js 16's replacement for
`middleware.js`, same functionality, new file and export names — serves
`app/agent` at the root of `NEXT_PUBLIC_AGENT_URL`, so `/login` there is
`app/agent/login`. Anything that is not an agent page resolves to a missing page
on that address. [lib/agent-address.js](lib/agent-address.js) builds every link,
so a page never knows which arrangement it is running under.

Leave `NEXT_PUBLIC_AGENT_URL` empty and `/agent/...` works exactly as it always
has, which is what local work and preview deployments want. To try it locally,
set `http://agent.localhost:3000` — browsers resolve `*.localhost` to this
machine with no hosts-file edit.

A bad value is ignored rather than thrown, because this module is loaded by the
proxy, which sits in front of every request.

---

## 8. The journey of a result

```
  polling unit
      │  agent reads Form EC8A, types the figures, photographs the sheet
      ▼
  the return         app/agent · app/field · WhatsApp · a bulk upload desk
      │  ① does the return add up on its own?          lib/results.js
      │  ② does the sheet add up against itself?       lib/sheet-vision.js
      │  ③ do the typed figures match the photograph?  lib/sheet-match.js
      │  ④ does the return look possible at all?       lib/anomalies.js
      ▼
  the record         Postgres — one row per booth, per position, per election
      │  sealed: incident text, agent contacts, sheet keys      lib/crypto.js
      │  clear:  vote totals, coverage, timestamps, unit codes
      │  also sent, always:                                     lib/databank.js
      ▼
  the rooms          /room · /broadcast · /admin · /gap · /whatsapp
```

### Check ① — the return adds up

[lib/results.js](lib/results.js) is imported by both the browser and the server,
so there is exactly one definition of a valid return. The copy that runs as the
agent types catches a mistyped figure while the sheet is still in their hand;
the copy that runs in the action is the one that counts. They cannot drift,
because they are the same function. (It cannot live in the action file: a
`"use server"` module may only export async functions, and a validator that runs
on every keystroke is not one.)

### Check ③ — the two halves of one claim

This is the check that was missing for a while, and the gap is instructive. The
sheet reader checked the photograph against *itself*, and the bot then filed
whatever the agent had typed. An agent could photograph a sheet showing 90 and
type 190, and every check passed: the typed figures were sound, the sheet was
sound, and nothing asked whether they were the same figures.

A disagreement now blocks the filing, hard, with no override. That is only
defensible because of what counts as a disagreement
([lib/sheet-match.js](lib/sheet-match.js)). A reading may block only when it has
earned the standing to:

- it read the sheet at all — no reader configured, an image that would not
  download, a photograph of a wall: no comparison, and no comparison is not a
  mismatch. The filing proceeds, marked as having no corroborated sheet.
- it is self-consistent — a reading that contradicts itself has no business
  contradicting anybody else.
- the field in question was actually read. A party the reader could not make out
  is compared to nothing, never compared to zero.

### One night is several counts

A voter is handed more than one ballot paper, and each is counted and declared
separately. So every return carries the position it is a return for, the results
table holds one row per position per booth, and every screen reads one position
at a time. That is what makes "62% counted" mean something: 62% of booths have
reported *this* contest ([lib/races.js](lib/races.js)).

The six positions: Presidential, Governorship, Senate, Representatives, House of
Assembly, Local government.

### Projects, not resets

A room runs the presidential in February and the governorship in March, and the
second must start empty without the first ceasing to exist. Nothing is ever
cleared: every result, incident, ledger entry and discovered unit carries the id
of the election it belongs to, and switching project changes which of them you
are looking at. A new project is empty because nothing has been filed against
it, not because anything was deleted ([lib/elections.js](lib/elections.js)).

### What is encrypted

Not everything. Encrypting a column you have to search, sort or aggregate on
turns it into a column you cannot use, and a product that encrypts vote totals
cannot draw a map ([lib/crypto.js](lib/crypto.js)).

| Sealed | In the clear |
|---|---|
| Incident narratives (they name people and places) | Vote counts |
| Agent contact details | Coverage |
| Result-sheet object keys | Timestamps, unit codes |

AES-256-GCM, not CBC: GCM authenticates as well as encrypts, so a row tampered
with in the database fails to decrypt rather than quietly returning different
plaintext. For election evidence, silent corruption is worse than loud failure.
Format is `v1.<iv>.<tag>.<ciphertext>`, all base64url, so the scheme can change
later without guessing at old rows. Re-key with `scripts/rekey.mjs`.

---

## 9. Integrity screening

[lib/anomalies.js](lib/anomalies.js). This is the product, not a feature.
Anybody can show an election result; what a parallel count is *for* is catching
the returns that cannot be true, in the hour they arrive rather than in a
tribunal eighteen months later when the government has been seated.

Every rule is arithmetic or well-established statistics, never opinion.

| Class | What it means | Example |
|---|---|---|
| **Impossible** | Breaks arithmetic. No innocent explanation | Accredited exceeds the register |
| **Implausible** | Possible on paper, vanishingly rare in reality | 95%+ turnout at a booth |
| **Outlier** | Legal, unusual for where it is | Turnout 3σ from its own state |
| **Pattern** | The shape of the digits is wrong across many returns | Last-digit chi-squared, p < 0.001 |

The last is the sophisticated one: genuine counts distribute their final digit
near-uniformly, and figures that were *composed rather than counted* cluster on
round numbers. It reports across a batch and never accuses a single booth.

---

## 10. Reading the sheet

Almost nothing that matters on an EC8A is printed. The form is printed; the
figures on it are written by hand by a presiding officer at the end of a long
day, and the whole point of photographing the sheet is to capture those figures.

There are two readers, and **nothing downstream knows which one ran**:

| Reader | What it is | How it does |
|---|---|---|
| `claude` | [lib/sheet-claude.js](lib/sheet-claude.js) — a model, asked for figures against a fixed schema | Reads handwriting. This is the entire reason the file exists |
| `google` | Google Vision | Better than the built-in on printed forms, no better on handwriting |
| `local` | Tesseract, in-process. No account, no key, no bill, no photograph leaving the building | Good at printed figures, only fair at handwriting. Against a real INEC form it recovered not one vote figure — the only number it found was the year in the title |
| `off` | — | Puts the WhatsApp bot back to asking its questions |

The model reader returns figures rather than text on purpose. An optical reader
hands back a page, and [lib/sheet-vision.js](lib/sheet-vision.js) then spends two
hundred lines guessing which number on which line belongs to which party — a
layer that breaks on any form laid out differently. Asking for the figures
directly against a schema means a sheet printed in a different order reads the
same.

**Neither of them files anything.** Optical recognition confuses 3 and 8, 1 and
7, 0 and 6 on a creased form photographed under a torch. Nothing reaches the
count until the agent standing in front of the sheet has read the numbers back
and confirmed them, and that rule does not relax because the reader got better.
What the reading is genuinely for is turning eleven chances to mistype into one
chance to disagree — and keeping the photograph, the reading and the confirmed
figures side by side afterwards, so the difference between them is auditable.

The local reader is kept out of the bundle (`serverExternalPackages` in
[next.config.mjs](next.config.mjs)): it is a WebAssembly engine that spawns a
worker and loads its language data from disk at runtime, and bundlers rewrite
both paths, so it fails at the first photograph rather than at build time.

---

## 11. The rooms

### The public site — `app/(site)/`

The home page, the live demonstration board, sign-in, sign-up, the pending
screen and the offline page.

### `/field` — the agent's dashboard (staff `PU_AGENT`)

One screen, one task. No navigation into the middle of a job, no list of booths,
nothing above the fold but the unit they hold and the form. The booth is printed
at the top as a fact, confirmed, never selected, because it comes from their
appointment and not from anything on the page.

### `app/agent` — the agents' app (coordinators)

A home screen and three doors, because an agent at a polling unit does three
different things on three different clocks:

- **Updates** — the day's procedure. Materials here, voting started, voting
  closed, counting begun. Sent a few times from morning to night.
- **Results** — once, late, off a sheet.
- **Situations** — what goes wrong. A threat, a snatched box, a card reader that
  will not read. At any minute, and some of them cannot wait.

Each door says where the agent is with it, so the home screen is also the answer
to "have I done everything?". The two vocabularies live as plain data in
[lib/agent-day.js](lib/agent-day.js), so the form, the action and the test read
one copy and cannot drift. The **SOS is on the home screen as well as on
Situations** — somebody in danger should not have to choose a door first.

### `/room` — the situation room

The largest surface in the product ([components/dash/SituationRoom.jsx](components/dash/SituationRoom.jsx),
3,061 lines). Eleven views: command, results, register, turnout, clusters,
situations, timeline, booth, integrity, analytics, planning.

It gets everything the broadcast desk gets, plus the two things a campaign needs
and a newsroom is not given: the incident feed in full, unsealed, and the gap
between what our agents filed and what has been declared.

> A parallel count is not useful because it is faster. It is useful because it is
> a second, independently sourced number to hold the declared one against.
> Averaging the two destroys the only thing worth having, so they sit in separate
> columns and the difference is computed rather than smoothed.

Because the views are local state rather than routes, a hash is the only thing a
link from elsewhere can carry into one — which makes `HASH_LAYERS` a routing
table maintained by hand, and is why there is a test that keeps it honest
([§15](#15-tests)).

### `/broadcast` — the broadcast arm

Twenty-eight surfaces drawn from a single fetch. A conventional broadcast system
receives results from somewhere else and has no idea whether the number it is
about to key over a picture has been checked against the sheet it was written
on. This one sits on top of the count: the return, the agent who filed it, the
position their phone reported, the photographed sheet and the desk that verified
it are all in the same database as the strap about to go out about them. That is
why the clearance control on the live results screen can be real rather than
ceremonial.

Sub-desks in [components/dash/broadcast/](components/dash/broadcast/): control
room, playout, queue, live results, graphics studio, map studio, ticker desk,
social desk, breaking news, auto-publish, intelligence, governance, production,
command centre, post card.

### `/gap` — our count against the commission's

Entering declared figures and reading the divergence are on one page on purpose:
they are the same job done by the same person minutes apart. A ward is
announced, it is typed in, and "does that match what our agents filed" is asked
immediately. `gap:read` opens the page; `declared:file` is what shows the upload
panel.

### `/whatsapp` — the WhatsApp desk

Where a human reads every conversation, every half-finished return, every
photograph, and every number not yet matched to a real person.

### `/admin` — the super administrator

Four questions in the order they are actually asked on the night: how much is
in, is any of it wrong, who is asking to be let in, and who did what. Everything
else is one click away in the rail: users, organisations, requests, coordinators,
audit, sources, integrations, health, API, settings.

### `/governors` — who governs each state

Worth reading the header of [app/governors/page.jsx](app/governors/page.jsx). The
screen existed twice, and the fix was not to delete one. `/governors` is granted
to every signed-in role because the standing governorship map is public record;
`/room` is granted to almost nobody. So the merge is conditional on holding both
doors: an account that can open the room is sent to the room's tab, an account
that cannot is served the page.

### `/console`

Where an account with no room lands. It should almost never be seen — reaching
it means somebody has an account and has not been given a job — so it says
exactly that rather than showing panels they cannot use.

### The API — `app/api/`

`export/results` (CSV), `graphic` (rendered frames), `lookup`, `me`,
`media/[id]`, `whatsapp/webhook`. The table of what exists and who is allowed
through it is declared in [lib/endpoints.js](lib/endpoints.js) rather than walked
off disk — a serverless build does not ship its source tree, and a filesystem
walk can tell you a route exists but never who may use it. `tests/system.test.js`
walks `app/api` at test time and fails if the two disagree.

---

## 12. The data model

Postgres on Neon, reached over HTTP. Nineteen Prisma models
([prisma/schema.prisma](prisma/schema.prisma)), eight migrations.

| Model | What it holds |
|---|---|
| `Election` | An election project. Everything else carries its id |
| `User` | Staff accounts |
| `Session` | Staff sessions |
| `AccessRequest` | Requests to be let in |
| `Result` | One row per booth, per position, per election |
| `Incident` | What went wrong, narrative sealed |
| `Media` | Photographs; object keys sealed |
| `Audit` | Who did what, with their address |
| `LedgerEntry` | The agent payment ledger |
| `WaContact` · `WaMessage` · `WaSession` · `WaPosition` | The WhatsApp desk |
| `PollingUnit` | The registry, as discovered |
| `SheetRead` | What a reader made of a photograph, with its provenance |
| `Declared` | The commission's own figures, one per place per race |
| `BroadcastItem` | Straps, graphics, posts and running orders |
| `Coordinator` · `CoordinatorSession` | The other population ([§5](#5-who-uses-it)) |

### Why the SQL did not have to change

Nothing outside [lib/db.js](lib/db.js) has ever written SQL. Callers use `users`,
`results`, `whatsapp` and the rest, so moving from SQLite to Postgres was a
rewrite of one file against the same signatures rather than a search through the
application. [lib/sql.js](lib/sql.js) keeps SQLite's `prepare(text).get(...)`
shape and converts the calling convention — `?` placeholders become `$1`, `$2` —
so the WHERE clauses are the ones that were tested against the old engine,
character for character.

The one thing that could not be hidden is that Postgres is asynchronous. Every
accessor returns a promise now, and every caller awaits it. That is the real cost
of the move, and it was paid once.

Why it had to move at all: a file-backed database is right on one machine and
wrong the moment this is deployed anywhere serverless. On Vercel's read-only
filesystem it threw on every page that signs somebody in. Worse than the error —
on a host where the disk *is* writable but temporary, it would have appeared to
work and quietly lost every result filed since the last deploy.

---

## 13. The library

147 files in [lib/](lib/). Grouped by what they are for.

**The count**
`results.js` the arithmetic of a ballot box · `tally.js` adding vote arrays up
safely · `coverage.js` what a plan covers at any depth · `races.js` the positions
on the ballot · `units.js` the polling unit registry · `booth.js` reading a unit
out of a form · `elections.js` projects · `election-scope.js` which project this
browser is looking at · `live-board.js` the board from returns that arrived ·
`scale.js` quantity to a band of colour.

**Integrity and evidence**
`anomalies.js` the four classes · `sheet-vision.js` reading the sheet optically ·
`sheet-claude.js` reading it with a model · `sheet-match.js` typed against
photographed · `certification.js` what a sheet certifies and who certified it ·
`crypto.js` encryption at rest · `image-bytes.js` what a file actually is, read
from the bytes rather than the label · `shrink.js` downscaling on the phone
before sending.

**Storage and wiring**
`db.js` (3,167 lines — every accessor) · `sql.js` the Postgres shim ·
`prisma.js` · `database-url.js` · `session.js` · `coordinator-session.js` ·
`password.js` scrypt from Node's own crypto · `ratelimit.js` · `guard.js` ·
`roles.js` · `endpoints.js` · `system.js` what this deployment knows about
itself · `readiness.js` whether it is fit to run a real election.

**Intake**
`whatsapp-bot.js` (879 lines) · `whatsapp-steps.js` · `intake.js` what comes back
from Data Bank · `databank.js` the door · `databank-agents.js` the agent list ·
`phone.js` one number, one shape.

**The agents' app**
`agent-address.js` · `agents-app.js` · `agent-identity.js` · `agent-code.js` ·
`agent-code-vault.js` · `agent-day.js` · `agent-door.js` · `agent360.js` ·
`agent-election.js` · `coordinators.js` · `watch.js` where the coordinators are ·
`ledger.js` the payment ledger.

**The rooms**
`alarm.js` the room's two alarms · `alerts.js` the warning system · `pulse.js`
the night's vital signs · `timeline.js` the night as one operational clock ·
`operations.js` the result pipeline · `reporting.js` who has not sent their
result · `reporting-board.js` · `unit-card.js` everything known about one unit ·
`drill.js` state down to polling unit · `find.js` universal search that never
comes back with nothing · `last-view.js` where somebody was when the page went
away · `room-views.js` · `viewing.js` · `whiteboard.js` · `voice.js`.

**Poll360 AI**
`assistant.js` the answering half · `commands.js` the driving half. Neither is a
language model. Every answer is computed from the same modules the screens are
drawn from: ask about Kano and it reads the Kano row. If it cannot find the
figure it says so rather than inventing one, and it never returns a number the
screen behind it would contradict. The tradeoff is stated plainly in the file —
it understands a narrower range of phrasings than a model would, which is the
right side of the trade for a room that has to read the answer out on air.

Driving is a separate module because the two fail in opposite directions. An
answer that is not quite what you meant costs a sentence; a drive that is not
quite what you meant throws the screen somewhere else in the middle of a
broadcast. So driving is stricter: it acts only when confident, and hands the
sentence back to be answered when it is not. It returns an intention, never an
effect — a dashboard with no map ignores a map instruction rather than crashing.

**The record and the analysis**
`history.js` (1,690 lines — every presidential election since 1999) ·
`record.js` the whole record to the last election held · `election2023.js` ·
`offcycle.js` the off-cycle governorships · `replay.js` 2023 arriving ·
`declared.js` the commission's figures as given · `divergence.js` holding our
count against the declared one · `gap-report.js` · `behaviour.js` how Nigerians
have actually voted since 1999 · `forecast.js` · `factors.js` · `spread.js` ·
`executive.js` one party's position everywhere in twelve figures · `campaign.js`
· `strongholds.js` · `stronghold-map.js` · `seats.js` · `constituencies.js` ·
`governors.js` · `lga-control.js` · `territory.js` · `principal.js` · `people.js`.

**Geography and parties**
`zones.js` the six · `lga-names.js` turning "07" into "Aba North" · `geo.js` ·
`bbox.js` · `map-tuning.js` · `party-register.js` every party this product can
name · `party-fill.js` · `party-pattern.js` · `members.js` party strength on the
ground, plus 37 `members-XXX-adc.js` register files and an index ·
`data/strongholds-index.js` · `data/units-modelled.js`.

**Presentation**
`content.js` home page copy · `site.js` chrome and product facts · `csv.js` ·
`console-charts.js` · `broadcast.js` the broadcast operation as arithmetic and
as a catalogue · `utils.js`.

---

## 14. Components

143 files in [components/](components/).

| Directory | What is in it |
|---|---|
| `ui/` | One button with six variants, sections, reveals, counters, the brand mark, party patterns |
| `site/` | Masthead and footer, including the standing "not a commission" disclosure |
| `home/` | The home page: hero, the chain, the six levels, the refusals, access |
| `board/` | The instrument surface: live board with playback and scrubbing, nation map, standings, coverage meter, ticker |
| `auth/` | Sign in, join, sign out, auth nav |
| `access/` | The territory picker |
| `agent/` | The agents' app: code sign-in, unit picker, photo field, situation form, SOS panel, and `day/` for check-ins and the day's record |
| `dash/` | Every desk. 83 files plus the broadcast sub-desks, the largest being the situation room (3,061), the planning map (2,102), Poll360 AI (1,819), strongholds (1,768), party ground (1,457), the executive brief (1,305), scope map (1,241) |
| `dash/broadcast/` | The fifteen broadcast sub-desks |
| `pwa/` | The app shell: worker registration, update offer, install prompt, offline |

No CSS-in-JS, no component library, no chart library. The board is SVG and CSS.
The design system is [app/globals.css](app/globals.css): colour ramps in OKLCH
and a semantic token layer that lets a section invert with one class.

`Reveal` is visible by default and animates only as an enhancement, so the page
is whole with JavaScript off. `Counter` keeps the real value in the DOM while it
counts up.

---

## 15. Tests

```bash
npm test          # node --test tests/*.test.js
```

Node's own runner, so there is no test dependency to install, keep current or
audit. That matters more than usual for software that has to build on somebody
else's machine on the morning of an election.

905 tests, 214 suites, 60 files. Most are ordinary unit tests over the
arithmetic. Six are a different kind, and they are the ones worth knowing about,
because each exists because of a specific bug that shipped and made no noise.

**`call-sites.test.js`** — reads the source to check that every method this
product calls on its own stores actually exists. `alerts.reduce is not a
function` took the situations console down; `coordinators.seen(...)` was written
for a function actually named `markSignedIn`, which would have thrown the first
time an agent signed in with their code, on polling morning. Nothing else catches
either: a property that does not exist is a valid expression until the line runs,
`no-undef` sees a defined object with a wrong key, and no test reaches them
because the runner has no DOM and no path aliases.

**`room-hashes.test.js`** — the situation room's hash table, kept honest. It has
failed twice with no visible symptom. `"#overview"` was declared twice in one
object literal, which is not an error in JavaScript — the later wins, silently —
so the sidebar's own Overview link had been landing on the analytics dashboard.
And `"#governs"` pointed at a layer that had been folded into another screen; a
hash naming a missing layer falls through to the map.

**`snapshot-width.test.js`** — pins the vote-array arithmetic. The accumulators
were sized from the board's party list while the loop ran to the event's vote
length, so an event carrying more positions wrote past the end of the array, and
`undefined + n` is NaN. It propagated into every total, share and bar width. It
is worth its own test because of how it presented: a bar width of `NaN%` is
discarded by the browser, the element falls back to `width: auto`, and a block
element fills its track. **The failure did not look like an error. It looked like
every party had won.**

**`databank-contract.test.js`** — the keys this product sends the hub are the
keys the hub reads. A registration went under `name` where Data Bank reads
`fullName`; `unitCode` where it reads `pollingUnitCode`; a role spelled
`POLLING_UNIT_AGENT` where the register knows `POLLING_AGENT`. Nothing failed.
The post returned 200 and the item was sealed, hashed into the evidence chain and
routed — with a null where the person's name should be. An agent signs up, sees
their code, and never appears on any roster.

**`agent-databank-vocabulary.test.js`** — the situation categories and stages,
pinned to Data Bank's. A button added here without a line in those tables reaches
that board as "Other" at no stage: filed, counted, and impossible to dispatch
against.

**`system.test.js`** — fails the build if a capability is added to the grant
table and not to `CAPABILITY_LABEL`, and if `lib/endpoints.js` and `app/api`
disagree. A permission with no sentence appears on the roles screen as a blank
line, which reads as "this role may do nothing" rather than "somebody forgot".

The pattern across all six: a hand-maintained list is only worth having if it
cannot go stale without the build going red.

---

## 16. Scripts

```bash
npm run build:map              # the national map payload
npm run build:constituencies   # 109 senatorial districts, 360 federal constituencies
npm run build:icons            # installed-app icons from the Poll360 mark
npm run build:strongholds      # roll strongholds down to every polling unit
npm run units:import           # INEC's wards and units, one file per state
npm run seed:demo              # coordinator watch and situation stream
npm run seed:election          # a night of the 2023 presidential
npm run seed:adamawa           # one state, four campaigns (dry run without --commit)
npm run account:create         # the first account
npm run databank:replay        # send the hub what a bad night stopped from landing
npm run agents:move            # move agents onto Data Bank's list, issue codes
npm run verify:board           # check every board names the party that actually won
npm run demo:retire            # disable the demonstration accounts
```

Others, run directly with `node`: `copy-to-databank.mjs` (the table copy that
precedes setting `DATABANK_DATABASE_URL`), `migrate-to-postgres.mjs`,
`rekey.mjs`, `build-history.mjs`, `build-latlng.mjs`, `build-member-index.mjs`,
`import-unit-results.mjs`, `model-units.mjs`, `share-members.mjs`,
`seed-evidence.mjs`, `seed-offcycle.mjs`, `seed-rehearsal.mjs`,
`create-2027.mjs`, `retire-demo-accounts.mjs`.

Several refuse to write rather than write something wrong: the constituency
builder refuses unless every local government lands in exactly one senatorial
district; the unit importer refuses if the totals drift from INEC's published
774 / 8,809 / 176,846.

Why one file per state: 176,846 polling units is about 87MB as published and
roughly 6MB cut down to codes and names. Neither belongs in a page's JavaScript.
The form fetches one state at a time, so a phone on a rural network downloads
about a hundred kilobytes rather than a country. The same applies to the map —
`/geo/lga/`, `/geo/units/` and `/geo/strongholds/` are 37 files each.

---

## 17. Configuration

Everything is in [.env.example](.env.example) with the reasoning beside it. The
short version:

**Required**

| | |
|---|---|
| `DATABASE_URL` | The Neon pooled connection string |
| `ENCRYPTION_KEY` | 32 random bytes, base64. Seals phone numbers and message bodies at rest |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, for metadata, sitemap, manifest and JSON-LD |

**Data Bank**

| | |
|---|---|
| `DATABANK_URL` · `DATABANK_API_KEY` | The hub. `DUMPSITE_URL` still works as a fallback |
| `DATABANK_DATABASE_URL` | Data Bank's database. Set it and Poll360 reads and saves there; unset it and it goes back to the original. Copy the tables across **first** — pointed at Data Bank before the copy, Poll360 finds no tables |
| `DATABANK_AGENTS_KEY` | Issued in Data Bank for `POLL360` with scopes `agents:register`, `agents:approve`, `agents:confirm`. Without it no agent can sign in |

**The agents' app**

| | |
|---|---|
| `NEXT_PUBLIC_AGENT_URL` | The agents' own domain. Empty keeps them at `/agent`, which is right for local work and previews. Changing it needs a redeploy |
| `AGENT360_URL` · `AGENT_DOOR_SECRET` | Agent360's address and the shared signing secret. Leave both empty and the app simply has no check-in section |

**WhatsApp** — `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (every delivery is
signature checked against it), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`.

**The sheet reader** — `ANTHROPIC_API_KEY` (recommended: the reader that can
read handwriting, which is what the figures on an EC8A actually are),
`GOOGLE_VISION_API_KEY`, `SHEET_READER` (`claude` | `google` | `local` | `off`),
`SHEET_READER_MODEL` (default `claude-opus-5`), `SHEET_READER_EFFORT` (`low` to
`max`, default `high`), `SHEET_READER_CACHE`.

**Optional** — `NEXT_PUBLIC_GOOGLE_MAPS_KEY` turns on the Google and satellite
grounds under the Voters, Turnout and Clusters layers. It is a browser key, so it
travels to every reader of the room and must be restricted by HTTP referrer in
the Google Cloud console. It is deliberately optional: the room's own map is
drawn from files this repository ships and works on a venue's wifi with the
uplink down.

### Readiness

[lib/readiness.js](lib/readiness.js) checks the deployment against itself rather
than against a document, on the super administrator's dashboard, every time they
open it. A written checklist is exactly the thing that gets read once during
setup and never again, and none of these failures announce themselves: a
demonstration account left enabled looks identical to a real one, a missing site
URL breaks nothing anybody notices until a link is shared, and a demo project
left live looks like a quiet night.

It is not a health endpoint on purpose. A green tick on a monitoring page is read
by a machine and nobody else; the person who can disable an account is the
administrator, and the moment to tell them is when they are already looking at
the dashboard with the button on it.

---

## 18. Running and deploying

```bash
npm install
npm run dev              # http://localhost:3000
npm run dev:secure       # https, for the microphone — see below
npm run build
npm test
npm run lint
```

**Why `dev:secure` exists.** Browsers only hand over a microphone on https or on
localhost. Opening the dev server at its network address, to reach it from a
phone, silently loses Poll360 AI's ability to listen. `dev:secure` serves the
same app over https with a self-signed certificate; the browser warns once and
after that the microphone works from any device on the network.

**Stack.** Next.js 16.3.1 (App Router, Turbopack), React 19.2.8, Tailwind CSS v4,
lucide-react, Prisma 7 with the pg adapter, Neon serverless, Zod, tesseract.js,
the Anthropic SDK.

> **Note on the framework.** This is Next.js 16, which has breaking changes from
> earlier versions — `middleware.js` is deprecated and renamed to `proxy.js`
> being the one this repository depends on. The guide for any given feature is in
> `node_modules/next/dist/docs/`, and [AGENTS.md](AGENTS.md) asks that it be read
> before writing code rather than working from memory.

**Deployment** is Vercel, region `lhr1` ([vercel.json](vercel.json)). Set the
environment variables for Production, Preview and Development.

Two build details worth knowing:

- The server action body limit is raised from the default megabyte to four. A
  photograph downscaled to ~1280px in the browser is a few hundred kilobytes in
  good light and comfortably over a megabyte from a dark phone camera pointed at
  a creased form — which is the condition every one of these pictures is taken
  in. At the default the upload is refused by the framework before any code runs,
  so the agent sees a submission that never completes and nothing in the log says
  why. The actions still check size and leading bytes themselves: a framework
  limit is a backstop, never a validation.
- Each build gets an identity, from the commit on Vercel and from the moment the
  build ran locally. The service worker caches under it. The version string used
  to be written by hand, so it stayed the same across deploys, and a browser
  decides whether to install a new worker by comparing the script byte for byte —
  identical bytes, no install. The old worker kept control and kept its caches,
  and a deploy could not reach a device that had already visited once.

Full deployment notes, including the agent domain setup, are in
[DEPLOY.md](DEPLOY.md).

---

## 19. The other documents

| File | What it is | State |
|---|---|---|
| [README.md](README.md) | The front door | **Stale.** Says the repository contains "the site scaffold, the design system and the home page" and that the application tier is "not yet written." All of it is written |
| [STRUCTURE.md](STRUCTURE.md) | File-by-file shape, with `[built]` / `[next]` markers | **Stale** in the same way — much of what is marked `[next]` is built |
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | The core working background, for a reader who wants the idea | Accurate |
| [PRESENTATION.md](PRESENTATION.md) | The pitch: why this wins, with worked examples | Accurate |
| [DEPLOY.md](DEPLOY.md) | Environment variables and deployment | Current |
| [SECURITY.md](SECURITY.md) | What protects this product, what each defence is for, and what it deliberately does not do | Current |
| [SCALE.md](SCALE.md) | What this deployment can carry, what was changed to get there, and where the ceiling still is | Current |
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | Instructions for agents working in this repository. Written and re-added by `next dev` | Current |

---

## 20. House style

Reading the code teaches this faster than a style guide, but the conventions are
consistent enough to state.

**Comments carry arguments, not descriptions.** A file header does not say what
the module does so much as why it is shaped that way, what was tried before, and
what will be proposed again and should not be. Many of them name the bug that
caused the file to exist. This is the most distinctive thing about the codebase
and it is worth preserving.

**Plain language in what a person reads.** Capability identifiers stay in the
code, where they belong; the roles screen renders sentences. `results:verify` is
a good key and a terrible sentence, and the people reading that screen are
deciding whether to hand a newsroom an account an hour before polls close.

**One definition, shared.** The validator that runs on every keystroke is the
same function as the one that runs in the action. The arithmetic behind a screen
lives in a module a test can reach without rendering anything.

**A hand-kept list must fail the build when it drifts.** See
[§15](#15-tests).

**Failures should be loud.** GCM over CBC, refusing to write rather than writing
something wrong, blocking a filing the photograph contradicts.

**Never claim what is not there.** The status markers in `STRUCTURE.md` were
written under that rule — "nothing is listed as built that is not, which is the
same rule the product applies to its own results." `lib/site.js` carries no
invented customers, uptime figures or case studies, for the stated reason that a
product whose whole pitch is "we do not publish numbers we cannot stand behind"
cannot open with numbers it cannot stand behind.

---

## 21. Things to watch

**Two polling unit totals are in the codebase.** `lib/site.js` and the copy
derived from it say **176,623**; `lib/pulse.js`, `lib/operations.js`,
`lib/strongholds.js`, `scripts/import-units.mjs` and two tests say **176,846**,
which the importer describes as "INEC's published" figure and enforces as a
refusal condition. Both appear in user-facing text. One of them is wrong, and
nothing in the repository reconciles them.

**Session logic is duplicated on purpose.** `lib/session.js` and
`lib/coordinator-session.js` are twins, as are parts of `lib/db.js` and
`lib/coordinators.js`. The files say so and name each other. The hazard is a fix
made on one side and forgotten on the other — which is exactly what had
happened to the cookie flags, so those now live in one place
(`lib/session-cookie.js`). The **tables** are still deliberately apart: sharing
them would turn a mistyped argument into a privilege escalation, which is the
whole reason for the duplication. Only the parts with no table in them are
shared.

**The situation room's views are local state, not routes.** `HASH_LAYERS` in the
component and `VIEWS` in `lib/room-views.js` must name the same set;
`tests/room-hashes.test.js` is what keeps them together. The room also carries
some layers that render and are no longer reachable — leftovers mid-rework — and
the remembered-view cookie deliberately discards anything naming one.

**Revoking a session takes a few seconds, not one click.** `lib/session.js` used
to read the database on every single request, which is what made revocation
immediate and is also the busiest query in the product. The answer is now held
for `SESSION_CACHE_SECONDS` (5 in production, 0 in development). Signing out is
unaffected; disabling an account is delayed by that window.
`lib/session-cache.js` sets out each case. Anybody tightening this should read
[SCALE.md](SCALE.md) §5 first, because the setting also decides what the
deployment can carry.

**The ground filter and its index have to be spelled the same way.** `within()`
in `lib/territory.js` writes `substr(unit_code, 1, 5) IN (…)`, and
`results_by_lga` is an index on that exact expression. `substr(x,1,5)` and
`substring(x from 1 for 5)` mean the same thing to a person and are two
different expressions to the query planner — rewrite one without the other and
every room silently goes back to reading the whole table. There is no error, only
a board that takes a minute.

**`lib/db.js` is 3,167 lines.** It is the single point every query passes
through, which is what made the engine change a one-file rewrite, and it is also
the largest thing in the repository to hold in your head.

**The agent list is not local.** Agents cannot sign in when Data Bank is
unreachable. This is the designed behaviour — the form says so rather than
calling a good code wrong — but it is a hard dependency on polling morning, and
the mitigation is only that an agent already signed in keeps filing.

**Two agent surfaces exist.** `/field` serves the staff `PU_AGENT` role;
`app/agent` serves the `Coordinator` population on its own domain. They are
different populations with different sign-ins, not two doors onto one screen.
