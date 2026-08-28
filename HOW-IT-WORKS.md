# Poll360 — the core working background

**From the booth to the broadcast.**

Poll360 is a **parallel vote tabulation (PVT) system** for Nigerian elections. It
is not an electoral commission and publishes no official result. It runs a
second, independently sourced count of the same ballot boxes INEC counts, so
that when a figure is announced there is something to hold it against other
than trust.

---

## 1. The idea in one paragraph

A named person stands in a polling unit. When counting finishes they read the
result off Form EC8A, type the figures into a phone, and photograph the sheet.
Poll360 checks the figures against the sheet, checks the sheet against its own
arithmetic, attaches the booth code, and publishes the total to a map, a
situation room and a broadcast board in the same second — always printed beside
the share of booths that total is actually built from.

---

## 2. The two rules everything else is derived from

**Silence is not zero.** A booth nobody has reported from is drawn grey and
labelled "no returns yet" — never in a party's colour, never as a low number.
An absence is an absence, not a result.

**Coverage travels with every total.** A leader on 4% of booths is not a
leader. Every figure the system publishes carries the share of booths behind
it, on the wall, in the studio, and in the CSV export.

---

## 3. The chain of custody, step by step

```
  polling unit
      │  agent reads Form EC8A, types 11 numbers, photographs the sheet
      ▼
  the return            app/field  ·  or WhatsApp  ·  or a bulk upload desk
      │  ① does the return add up on its own?          lib/results.js
      │  ② does the sheet add up against itself?       lib/sheet-vision.js
      │  ③ do the typed figures match the photograph?  lib/sheet-match.js
      │  ④ does the return look possible at all?       lib/anomalies.js
      ▼
  the record            Postgres — one row per booth, per position, per election
      │  sealed: incident text, agent contacts, sheet keys      lib/crypto.js
      │  clear:  vote totals, coverage, timestamps, unit codes
      ▼
  the board             the same structure, live or replayed     lib/live-board.js
      ├── situation room  /room  · coverage, exceptions, review queue
      ├── divergence      /gap   · our count vs. the declared one lib/divergence.js
      ├── broadcast desk  /broadcast · wall boards, lower thirds, CSV export
      └── administration  /admin · accounts, approvals, keys
```

---

## 4. The four checks, and why each exists

| Check | Module | What it refuses |
|---|---|---|
| **Arithmetic of the return** | `lib/results.js` | Negative figures, more accredited than registered, more votes cast than accredited, a return of nothing. Runs identically in the browser (as the agent types) and on the server (where it counts) — the *same function*, so the two cannot drift apart. |
| **The sheet against itself** | `lib/sheet-vision.js` | An EC8A is a closed system: ballots issued, used, unused, spoiled and the party rows all have to reconcile. A reading that fails its own arithmetic is discarded rather than proposed. |
| **The typed figures against the photograph** | `lib/sheet-match.js` | The picture and the numbers are two halves of one claim. If they disagree, the claim is not filed — and no override files a return the photograph contradicts. A reader that could not read the sheet produces *no comparison*, which is not a mismatch. |
| **Integrity screening** | `lib/anomalies.js` | Four classes — IMPOSSIBLE (breaks arithmetic), IMPLAUSIBLE, OUTLIER, PATTERN (digit-shape across many returns). None of them says "fraud". They say "this cannot be right, and here is exactly why", and a human decides. |

**The reading never files anything.** OCR confuses 3 and 8, 1 and 7, 0 and 6 on
a creased form photographed under a torch. What it is for is turning *eleven
chances to mistype* into *one chance to disagree* — the agent still confirms.

Three readers, chosen by which key is set: Anthropic (the only one that reads
handwriting well, and EC8A figures are handwritten), Google Vision, or a
built-in Tesseract reader that needs no key. Without any of them, nothing
breaks — the figures are typed as they always were.

---

## 5. Three ways a return gets in

1. **The field dashboard** (`/field`) — one screen, one task. The booth is
   *printed* at the top as a fact from the agent's appointment, never selected
   from a list.
2. **WhatsApp** (`lib/whatsapp-bot.js`, desk at `/whatsapp`) — a stepped
   conversation: unit → accredited → rejected → party figures → photo →
   confirm. Meta Cloud API, signature-checked. Without credentials the channel
   still runs end to end; replies are recorded as QUEUED and simply never leave
   the building.
3. **A bulk upload desk** — for an account that holds no single booth.

---

## 6. Who is who

Roles live in one table (`lib/roles.js`) rather than as `if (role === …)`
scattered through the app, and every dashboard page calls `requireUser()` as its
first statement — on the server, on every request.

- **Super administrator** → `/admin` — every unit, every room, every key.
- **Polling unit coordinator** → `/field` — one booth, one person, files returns and incidents.
- **Broadcast desk** → `/broadcast` — reads and renders; never writes a result.
- **Situation room** → `/room` — a party or coalition war room.
- **WhatsApp desk** → `/whatsapp`.

Coordinators are held in a **separate population** from staff accounts
(`lib/coordinators.js`): thousands of them, recruited in the fortnight before
polling day, self-signed-up and human-approved against an appointment list.
They meet staff in exactly one place — the column on `results` recording that a
return was filed by a coordinator.

A signed-in user in the wrong room is redirected to their own, never shown a
403 — a 403 confirms the other room exists and is worth attacking.

---

## 7. The comparison that is the actual product

`lib/divergence.js` holds our count against the **declared** one. Declared
figures live in their own table, never merged into ours — two independently
sourced numbers for the same booths is the whole point, and averaging them
destroys it.

The trap it is built around: if we have agents in nine of a ward's twenty
booths, our total is *supposed* to be lower. So comparison runs in one of two
stated modes:

- **COMPLETE** — every unit has both a return and a declared figure; all rules apply.
- **PARTIAL** — exactly one rule survives, because it does not depend on coverage: *what we counted cannot exceed what was declared for a place that contains it.* Everything else reports "not enough coverage to compare", in those words.

> A dashboard that says "I cannot tell you yet" is worth more than one that
> guesses, because the second one is only wrong once before nobody reads it.

---

## 8. A night is several counts, not one

A voter is handed more than one ballot paper. `lib/races.js` makes the
**position** a dimension inside the election project: one row per position per
booth, every screen reading one position at a time. That is what makes "62%
counted" mean something — 62% of booths have reported *this* contest.

---

## 9. Security posture

- **Sessions** — the cookie carries an opaque random token and nothing else; it is stored *hashed*, so a leaked backup contains no usable credentials. Identity is read from the database on every request, which is what makes "revoke this session" take effect on the next click.
- **Passwords** — scrypt from `node:crypto`, no dependency.
- **Encryption at rest** — AES-256-GCM. Sealed: incident narratives, agent contacts, sheet keys. Clear: vote totals, coverage, timestamps, unit codes — *a column you cannot aggregate is one you cannot draw a map from*. GCM authenticates, so a tampered row fails loudly instead of decrypting to something else.
- **One sign-in error message** — wrong password, no such account, disabled account all answer the same, so the form cannot be used to ask whether a phone number belongs to an agent.
- **Payment ledger** — a hash chain (`lib/ledger.js`). Every entry carries the previous entry's hash, so the ledger is tamper-*evident*: alter row 400 and every hash after it stops matching. Deliberately **not** untraceable — untraceable cash to polling agents during a Nigerian election is indistinguishable from vote-buying, and the product's credibility rests on being able to prove it isn't that. Privacy is served by pseudonymity: the screen shows a payment reference, not a name.

---

## 10. Analysis on top

- **`lib/forecast.js`** — projection by uniform national swing, the standard psephological baseline: transparent, checkable by hand, with a well-understood failure mode. Factors it does not have data for (census, rainfall, security feed) are declared `loaded: false` rather than filled with invented numbers.
- **`lib/assistant.js` (Poll360 AI)** — deliberately **not** a language model for answers. Every figure it returns is computed from the same modules the screens are drawn from, so it can never state a number the screen behind it contradicts. If it cannot find a figure it says so. Narrower phrasing coverage is the accepted price for a desk that reads answers out on air.

---

## 11. The stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Prisma 7 on **Postgres**
(Neon pooled) · `lucide-react` · Zod · `tesseract.js` · `@anthropic-ai/sdk`.
No CSS-in-JS, no component library, no chart library — the board is SVG and CSS.
Tests run on Node's own runner, so there is no test dependency to install or
audit *on the morning of an election*. It installs as a PWA with a hand-written
service worker and an offline page, because booths lose signal.

Storage is Postgres and that is not optional: it used to be a SQLite file,
which is correct on one machine and wrong the moment it is deployed anywhere
serverless — the filesystem does not survive between invocations, so every
filed result disappears without an error.

---

## 12. The demonstration board

The home page replays the **2023 Nigerian presidential election** with its real
declared results (APC 12 states, PDP 12, LP 12, NNPP 1). What is *not* real is
the order and timing of arrival — INEC publishes no per-booth arrival log — so
the replay distributes each state's declared total across batches that sum to it
exactly, and says so **above** the numbers, because a screenshot of an election
board travels further than the page around it.

Two source discrepancies are reproduced rather than reconciled: Wikipedia's
Kwara and Yobe rows do not sum to their own stated totals, so 37 rows come to
24,026,730 valid votes against INEC's declared 24,025,940. Both figures are
printed under the board.

`lib/live-board.js` builds the *identical structure* from real rows in the
results table, so the map, standings, coverage dial and ticker draw a live count
without knowing which of the two they were handed. An empty project yields a
board where every state is `reported: false` — grey — which is the correct
picture of the hour before polls close.

---

## The register it is built against

INEC: 37 states, 774 LGAs, 8,809 registration areas, **176,623 polling units**.
The hierarchy is not stored in a table — an INEC unit code carries its own
address (`SS-LL-WW-UUU`), so ward, LGA and state are read off the code. Storing
both would let them disagree, and on the night they disagree the code wins,
because the code is what is printed on the sheet in the agent's hand.

Boundaries: geoBoundaries (gbOpen), CC BY 4.0.
