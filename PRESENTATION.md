# Poll360

**Parallel vote tabulation infrastructure for Nigeria. From the booth to the broadcast.**

---

## 1. The one-sentence pitch

> Nigeria has 176,623 polling units. Poll360 puts a named agent in each one, takes a
> photographed result from them in under a minute, screens every figure for the things
> that cannot be true, and puts the same count in front of a situation room, a newsroom
> and a video wall at the same second.

**It is not the commission's count.** It is a second, independently sourced count held
beside the official one. That distinction is the product, not a disclaimer.

---

## 2. Why this wins

Most election technology shows you results. There are dozens of those, and on the night
they all look the same. Poll360 competes on the four things nobody else does.

### 2.1 It catches what cannot be true, in the hour it arrives

Every return is screened on arrival against four classes of check. Tested against
planted faults in a batch of 43:

```
screened 43 · flagged 4 · impossible 2 · false positives 0

IMPOSSIBLE   25/01/02/001   640 accredited at a booth with 500 registered
IMPOSSIBLE   25/01/02/002   531 ballots from 300 accredited voters
IMPLAUSIBLE  25/01/02/003   All 589 votes to one party
OUTLIER      25/01/02/001   Turnout 128.0% against 47.7% nearby
```

| Class | What it means | Example rule |
|---|---|---|
| **Impossible** | Breaks arithmetic. No innocent explanation. | Accredited exceeds the register |
| **Implausible** | Possible on paper, vanishingly rare in reality. | 95%+ turnout at a booth |
| **Outlier** | Legal, unusual for where it is. | Turnout 3σ from its own state |
| **Pattern** | The shape of the digits is wrong across many returns. | Last-digit chi-squared, p < 0.001 |

The last one is the sophisticated one: genuine counts distribute their final digit
near-uniformly. Figures that were **composed rather than counted** cluster on round
numbers. It reports across a batch, never accusing a single booth.

**It never says "fraud."** It states the arithmetic and names the unit so it can be read
against its photographed sheet. That wording is deliberate: the first accusation that
turned out to be a typo would discredit every true finding after it.

*This is the line to lead with. A results viewer cannot do this.*

### 2.2 The ledger cannot be altered, and you can prove it

Agents are paid through a hash-chained ledger. Every entry carries the hash of the one
before it. Demonstrated live by tampering with the database directly:

```sql
UPDATE ledger SET amount = 9900000 WHERE kind='STIPEND';
```
```
verify() → { ok: false, at: 1, reason: "entry altered after it was written" }
```

- No UPDATE or DELETE path to the table exists anywhere in the codebase
- Balances are **derived on read**, never stored, so they cannot drift from the statement
- Agents appear as opaque payment references, so a ledger can be shown in a room without
  exposing who is being paid
- The admin console walks the whole chain on every page load

**What was deliberately refused:** untraceable payments. In a Nigerian election that is
indistinguishable from vote-buying infrastructure, it breaks AML/KYC law, and it
contradicts the product's own thesis. Tamper-evident and auditable is the property worth
having, and it needs no chain, no token and no network.

*Say this out loud in the room. Refusing a feature for a stated reason reads as
judgement, not as a gap.*

### 2.3 Every figure carries its coverage

> **A number without its coverage is not a smaller truth. It is a different claim.**

38% of the vote on 9% of booths and 38% on 82% of booths are not the same sentence. Every
total the system renders, on screen, on air, in the export, arrives with the share of
booths behind it, in the same frame, at a readable size.

Nothing is called under **25% counted**, however wide the lead. The call model is
conservative and defensible: *too early → too close → leaning → decided.*

### 2.4 Silence is never zero

A booth nobody has reported from is drawn grey and labelled "no returns yet". Never in a
party's colour, never as a low number. At 9pm, "nobody is winning here" and "nobody has
told us yet" are completely different facts, and a map that blurs them lies early in the
evening.

---

## 3. The four dashboards

One count, four rooms, four completely different jobs. Each is role-gated on the server.

| Role | Lands on | What it is for |
|---|---|---|
| **Super administrator** | `/admin` | Runs the count. Issues every credential, pays every agent, verifies returns |
| **Polling unit coordinator** | `/field` | Files one booth's result from a phone, in the dark, on a weak signal |
| **Broadcast desk** | `/broadcast` | Our count beside INEC's declared figures, driven by touch between bulletins |
| **Situation room** | `/room` | Coverage, incidents, coordinator positions, the declared-figure gap |

### 3.1 Super administrator

- **The coverage dial**, the product's own mark, working. Sixty ticks, filed and
  verified drawn as one object, because you cannot read the count without also reading
  how much of the country it came from
- Returns arriving as a cumulative trend, ranked party standings, live incident feed
- **Issue an account**: password shown once, never stored in readable form
- **Pay an agent**: the only door money comes through, capability-gated and audited
- **Integrity screening** and the ledger chain state
- Append-only audit trail: every privileged action, attributed and timestamped

### 3.2 Polling unit coordinator (the phone)

Designed for one hand, standing up, at night, on a connection that may not hold.

- **The booth is printed, not chosen.** Resolved from the agent's appointment on the
  server, on every submission. *A booth you can choose is a booth somebody can choose
  wrongly*, so there is no dropdown, ever
- **Position is corroboration, not authorisation.** The device's fix is matched against
  the appointed unit and banded: *at the unit / nearby / away from unit*. A far reading
  never blocks a filing; it is recorded and visible to the coordinator above
- Arithmetic checked in the browser first, then again on the server: accredited ≤
  registered, cast + rejected ≤ accredited, nothing negative, a return of nothing is not
  a return
- **The sheet is photographed and shrunk on the phone**: 8MB becomes ~300KB, the
  difference between a report that lands and one that times out at close of poll
- The server sniffs the actual magic bytes, never the filename: *a file called photo.jpg
  is a claim; the first four bytes are a fact*
- **The agent's own account**: earned, requested, available, with a full statement and
  the short hash of every entry

### 3.3 Broadcast desk

- **Three sources, side by side, never merged:** *Our agents · INEC declared · The
  difference*. The comparison is the story
- Tap any state to drill in. Targets are ≥44px and nothing hides behind hover, because
  **a hover does not exist on a touch wall**
- Full contest per jurisdiction: every party, every candidate, margin, turnout
- Air-ready output specified: 1920×1080 browser source for OBS/vMix, transparent
  background, coverage and timestamp **burnt into the frame** so a screenshot cannot
  outlive its context

### 3.4 Situation room

The flagship screen. Top bar only, no sidebar, the map is the page.

- **Six tabs, four of them map layers:** Results · Voters · Turnout · Clusters ·
  Coordinators · Reports
- **Every layer is live**, derived from the same moving count:
  - *Voters*: how much of the register has actually reported
  - *Turnout*: votes against the register **of the booths that have reported**, which is
    the only denominator that means anything mid-count
  - *Clusters*: votes per reporting unit, plus 20 commercial centres
- **Drilling happens in place.** Clicking a state does not navigate or open a panel: the
  country in the frame is replaced by the state, at the same size, and the list beside it
  narrows from 37 states to that state's local governments
- The map is the **one dark object** on a light sheet, with a graticule, depth, live
  arrival pulses and a telemetry strip
- **Coordinator watch**: real GPS positions on the map, with a hard rule, a filled dot
  means a real fix; a hollow ring means we know their booth and nothing else
- **Situation stream**: an X-style live feed of what is happening at booths, with photo
  evidence, severity in words before colour, and *"12m ago"* timestamps
- **Audible alarm** for critical reports, with a 20-second rehearsal mode for demos

---

## 4. Four levels of drill-down, and the honesty inside it

**Nation → State → LGA → Ward → Polling unit**, on real boundaries where they exist.

| Level | Drawn as | Source |
|---|---|---|
| Nation | Choropleth, 37 states | geoBoundaries ADM1 |
| State | Choropleth, **all 774 LGAs** | geoBoundaries ADM2 |
| Ward | Ordered tile grid | **No boundaries exist** |
| Polling unit | Tile grid + full figures | **No boundaries exist** |

Nobody has published ward or polling-unit boundaries for Nigeria. Inventing them would
produce a map that looks authoritative and says something false about where things are,
on the one night when being wrong about that matters most. So those levels are grids:
they claim nothing about geography and still answer the question.

**The arithmetic always sums back.** State totals are the real declared results;
everything below is apportioned from them and labelled:

```
Lagos declared     1,271,451
sum of 20 LGAs     1,271,451   exact
Ikeja                109,789
sum of 12 wards      109,789   exact
Ward 1                12,980
sum of 19 units       12,980   exact
stable across reloads          identical
```

Seeded from each place's own name, so Ikeja shows the same numbers on every machine,
forever. A figure that changed on refresh would be worse than no figure.

---

## 5. The data is real, and checkable

The board replays the **2023 Nigerian presidential election** with declared results.

| Party | Candidate | Votes | States |
|---|---|---:|---:|
| APC | Bola Tinubu | 8,794,726 | 12 |
| PDP | Atiku Abubakar | 6,984,520 | 12 |
| LP | Peter Obi | 6,101,533 | 12 |
| NNPP | Rabiu Kwankwaso | 1,496,687 | 1 |

Spot-checkable against the record: Lagos went to LP by 9,848; Benue to APC by 2,096
(which is why the board marks it *too close*); Kano to NNPP with 997,279.

**A source discrepancy is disclosed, not tidied away.** Two rows in the published source
(Kwara and Yobe) do not sum to their own stated totals, so the 37 rows come to 24,026,730
against INEC's declared 24,025,940, a gap of 0.003%. Both figures are printed under the board.

> A results system's demonstration data does not get to quietly correct the
> inconsistencies in its own source.

---

## 6. Accessibility as engineering, not compliance

This is a genuinely differentiating answer, and it is measured.

The parties keep their **own** colours, because a chart that invents a party's colour is
one nobody in Nigerian politics will read at a glance. Measured against colour-blindness
gates (OKLab ΔE, Machado 2009):

```
APC / PDP    ΔE 23.7   pass
APC / LP     ΔE 23.9   pass
APC / NNPP   ΔE 24.8   pass
PDP / NNPP   ΔE 21.9   pass   (two greens, split by lightness)
LP  / NNPP   ΔE 10.8   pass
PDP / LP     ΔE  3.5   FAIL
```

PDP green against LP red is invisible to the commonest colour blindness. **No hex fixes
it**. Separating that pair by lightness immediately collapses LP against NNPP, because
LP sits between the two greens. It is a property of the Nigerian party palette.

So colour is never load-bearing:

- Every state carries its party's code **in type**
- **LP is hatched**, so the failing pair separates by pattern, for every reader, in a
  monochrome print, and under forced colours
- Tooltips name the party in words
- The table beside every map is the same data **with no colour in it at all**

Also: every figure is monospaced with tabular numerals, so a total ticking from 9,999 to
10,000 never reflows the words beside it.

---

## 7. Built for the conditions, not the demo

| Constraint | What was done |
|---|---|
| Rural connections | Photos shrunk to ~300KB on the phone before sending |
| Map weight | 226KB → 92KB, **30KB gzipped**; LGA boundaries 3KB per state, on demand |
| No signal | Installable PWA, hand-written service worker, offline page precached |
| Long shifts | White working surfaces; the map is the only dark object |
| Wall displays | Retractable rail; the map never moves when a panel grows |
| Shared machines | Sign-out clears the offline page cache |
| Slow JavaScript | Content renders **visible by default**; animation is an enhancement |
| Deployment | Zero-dependency storage; every query in one file for a clean Postgres swap |

**Security:** scrypt password hashing from Node's own crypto; session cookies carry an
opaque token and nothing else, stored hashed, so a leaked backup contains no usable
credentials; capability table rather than scattered role checks; sign-in answers one
message however it failed, because distinguishing them turns the form into a way of
asking whether a phone number belongs to an agent.

---

## 8. Analytics: what would happen, never what will

The situation room's Analytics tab is a projection engine, not a crystal ball. Every
number on it is conditional and says so, and every assumption is a control at the top
rather than a constant buried in a model. The room argues about the assumptions, which
is the argument actually worth having.

**The win condition is the centrepiece.** Nigeria's Section 134 asks two things of a
president, not one: the most votes nationally, **and** at least 25% in at least 24 of
the 36 states. Almost every tracker shows you the first. This one shows both, with a
progress bar against 24, and it shouts the moment a scenario produces a **run-off**.
That is a state you can reach by accident, and nobody else's dashboard will tell you.

> Baseline reproduces 2023 exactly: APC 36.65%, quarter of the vote in 29 states, passes.
> Move LP up six points and APC down six: LP leads on 31.1% but clears the quarter in
> only 17 states. **Nobody has won.** That single click is the most persuasive twenty
> seconds in the demo.

**Five conditions move turnout, state by state.** Rain on polling day, security
pressure, economic hardship, urbanisation and a young population. Each is a dial rather
than a switch, because nobody in a room believes a coefficient completely, and two
analysts who disagree can meet at 50% instead of arguing to a standstill. The
coefficients themselves are printed on screen next to each dial.

**With every dial at zero the model returns the declared 2023 result exactly.** There
is always a known-true anchor one click away.

### The synthetic line, drawn in public

Population, religion, climate, security and economic pressure are **generated**, not
measured. Nigeria has not completed a census since 2006. Rather than quietly invent
these and let them pass as fact, the product does three things:

1. Every generated figure is derived from something real, the register, the geopolitical
   zone, the state's real latitude, so the pattern is coherent and internally consistent.
2. Every surface that renders one carries the word **synthetic**, including the AI's
   spoken answers.
3. The factor registry at the bottom of the screen badges every input **Real** or
   **Synthetic**, one row each, with its source.

Real and synthetic are never blended into one confident number. A room that cannot tell
which is which cannot tell how much to believe. Supply a licensed source for any
synthetic row and it turns real with nothing else in the product changing: the shape of
the row is the contract.

**The planning map starts blank on purpose.** Select states, local governments and wards
to build a deployment and it totals the polling units, the agents and the share of the
register you would be covering as you go, then exports it.

---

## 9. Poll360 AI: it can explain every figure on the screen

Press **Hi Poll360 AI**, speak, and it answers out loud. It listens through the browser,
answers in Nigerian English where the device has the voice, and reads the figure back at
a pace somebody can write down.

**It is not a language model, and that is the feature.** A model asked "what was the
turnout in Kano" will answer confidently whether or not it knows, and on a broadcast desk
a confident wrong figure is the worst thing this product could produce. Every answer is
computed from the same modules the screens are drawn from. Ask about Kano and it reads
the Kano row. Ask about the projection and it runs the projection, with whatever the room
currently has the sliders set to. **It cannot return a number the screen behind it would
contradict, and when it does not know it says so rather than guessing.**

What it answers:

| Ask it | It does |
|---|---|
| "Who won Kano" | Every party's figure for that state, the margin, the turnout, the register |
| "What if Labour gained six points" | Runs the swing and reports whether anybody still clears the spread test |
| "Where could APC gain" | Ranks states by votes to flip against booths to work |
| "Which states were closest" | The battlegrounds, with the votes that would turn the tightest |
| "What is a quarter state" | Section 134 explained in plain English, then applied to what is on screen |
| "What am I looking at" | Explains the tab currently open |
| "Security in Borno" | The figure, **plus** that it is synthetic and must not be quoted |
| "Is this data real" | The real and generated line, drawn explicitly |
| "How do you catch fraud" | The four integrity classes, in plain English |
| "How does the ledger work" | Tamper evidence without the word blockchain doing any work |

Behind it is a glossary covering **every metric, every screen and every piece of
vocabulary in the product**, written the way you would explain it to somebody who walked
into the room this morning. A new analyst on election night can ask the dashboard what
its own numbers mean.

**Nothing leaves the machine.** Speech in and speech out are the browser's own, which
matters when the thing being discussed is an unreleased result. The microphone is silent
until somebody presses the button, it shows unmistakably when it is listening, and
hanging up releases it rather than merely hiding the panel.

---

## 10. Live demo script (8 minutes)

Run `npm run dev`. Log in at `/login`.

| # | Do | Say |
|---|---|---|
| 1 | Open `/` and let the board replay | "This is the 2023 presidential election arriving. Watch the grey states. That is *nobody has told us yet*, not zero." |
| 2 | Point at the coverage figure | "Every total on this site carries that number. It is the whole product." |
| 3 | Log in as **situation room** | "Six dashboards over one country." |
| 4 | Click Turnout, then Clusters | "Each one is live and answers its own question. None of them reports who is winning. The dots are the figure encoded twice, in colour and in size, so it survives a projector and a colour blind reader." |
| 5 | Click Lagos, then an LGA | "The map never leaves the frame. Real boundaries for all 774 LGAs." |
| 6 | Open **Reports**, hit **Rehearse** | "Critical reports sound an alarm. This is rehearsal mode, every 20 seconds." |
| 7 | Open **Coordinators** | "Filled dots are real GPS fixes. Hollow rings mean we know their booth and nothing else." |
| 8 | Log in as **admin**, show integrity | "This is the one that matters. It catches what cannot be true, and it never says fraud." |
| 9 | Tamper with the ledger in SQL, run verify | "Now watch the chain break at the exact row." |
| 10 | Open **Analytics**, push LP up six and APC down six | "Labour now leads the country. And nobody has won, because the spread test fails in 17 states. That is the number every other tracker hides." |
| 11 | Press **Hi Poll360 AI** and say "what is a quarter state" | "It answers out loud, from the same data on the screen. Ask it anything on this dashboard." |
| 12 | Ask it "security in Borno" | "Notice it volunteers that the figure is generated. It will not let you quote a number we did not measure." |

**Accounts** (in `.env.example`):

| Room | Email | Password |
|---|---|---|
| Super administrator | `admin@poll360.ng` | `poll360-super-admin` |
| Coordinator | `agent@poll360.ng` | `poll360-field-agent` |
| Broadcast | `broadcast@poll360.ng` | `poll360-broadcast-desk` |
| Situation room | `room@poll360.ng` | `poll360-situation-room` |

Currently seeded: **49 coordinators, 485 returns, 34 incidents.**

> Click something on the page before the alarm demo. Browsers block audio until you
> interact, and opening the panel is itself that gesture.

---

## 11. What is built, and what is not

Publishing this is the cheapest credibility available. Everyone evaluating election
software has sat through a demo that turned out to be entirely a demo.

**Built and working:** four role-gated dashboards · four-level drill-down on real
boundaries · integrity screening · tamper-evident ledger · agent wallet · photo evidence
with authenticated serving · GPS coordinator watch · live incident stream with alarm ·
projection engine with the Section 134 spread test and run-off detection · blank planning
map with live deployment totals and CSV export · Poll360 AI with voice in and voice out,
grounded entirely in the product's own data · PWA with offline support · full auth with
rate limiting · append-only audit trail ·
public marketing site with live board.

**Honestly not yet:**

| Gap | What it needs |
|---|---|
| Withdrawals record an instruction, they do not move money | A payment provider and KYC |
| No census data on the clusters layer | A licensed population source. Density is derived from the register and labelled |
| Real-time is the 2023 replay | Agents in the field. The plumbing is live |
| Figures below state level are apportioned | Real returns, which replace them entirely |
| SQLite will not survive serverless | Postgres. Every query is in one file for exactly this |

---

## 12. Numbers for the deck

| | |
|---|---|
| Polling units modelled | **176,623** |
| Wards / LGAs / states | 8,809 / 774 / 37 |
| Real LGA boundaries | **774**, across 37 files |
| 2023 votes replayed | **24,026,730** |
| Map payload | **30KB** gzipped nationally, 3KB per state |
| Source files / lines | 58 components, 19 modules, **~14,800 lines** |
| Runtime dependencies | **7** |
| Integrity false positives | **0** across 461 screened returns |
| Drill-down accuracy | Sums back **exactly** at every level |

---

## 13. The closing line

> Anyone can draw a map. What a parallel count is *for* is catching the returns that
> cannot be true, in the hour they arrive, not in a tribunal eighteen months later when
> the government has already been seated.
>
> Poll360 is built by refusals as much as by features: it will not colour a silent booth,
> will not publish a total without its coverage, will not delete a disputed return, will
> not let anyone verify their own work, and will not move money it cannot trace.
>
> Those are the constraints somebody will ask to relax at 11pm on election night. That is
> exactly why they are written into the schema, and into this document, in public, first.
