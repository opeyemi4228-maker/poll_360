# Poll360: everything about it

**From the booth to the broadcast.**

This is the full account of Poll360 in plain language: what it is, what it does, what is special about it, and where it is ahead of the other ways people follow a Nigerian election. It ends with an honest list of what it does not do yet.

Checked against the product as it stands on 11 October 2026.

---

## Contents

1. [Poll360 in one minute](#1-poll360-in-one-minute)
2. [The problem it solves](#2-the-problem-it-solves)
3. [How a result travels](#3-how-a-result-travels)
4. [Who uses it](#4-who-uses-it)
5. [Every feature](#5-every-feature)
6. [What makes it special](#6-what-makes-it-special)
7. [Advantages over other tools](#7-advantages-over-other-tools)
8. [Built for election night](#8-built-for-election-night)
9. [Poll360 in numbers](#9-poll360-in-numbers)
10. [What it does not do yet](#10-what-it-does-not-do-yet)
11. [The short version](#11-the-short-version)

---

## 1. Poll360 in one minute

Poll360 runs a **second, independent count** of a Nigerian election.

A named agent stands at a polling unit. When counting ends, they enter the figures from the result sheet (INEC Form EC8A) on their phone and photograph the sheet. Poll360 checks the figures against the photograph, checks the sheet against its own arithmetic, and puts the running total in front of a situation room, a newsroom and a video wall at the same moment.

It is not the electoral commission and it publishes no official result. It gives you a number of your own to hold beside the official one, with a photograph behind every figure. That is the product.

It also does four things around the count:

- **Verifies.** It sets three records of the same election side by side: what your agents filed, what INEC photographed and published, and what INEC announced.
- **Broadcasts.** A newsroom desk writes, clears and publishes result cards to social platforms and to air.
- **Answers questions.** Ask Poll360 answers questions typed in ordinary words, from the election record back to 1999.
- **Plans.** It shows a campaign where it is strong, where it is weak, what it takes to win a seat, and where to send people first.

---

## 2. The problem it solves

On election night in Nigeria there are 176,846 polling units and one official count. Anyone who wants to check that count has, until now, had three poor options.

| What people do today | What goes wrong |
|---|---|
| Wait for the official announcement | There is nothing to hold it against except trust |
| Run a situation room on WhatsApp groups and spreadsheets | Figures are retyped by hand, nobody can say how much of the country a total covers, and nothing is kept as evidence |
| Scroll INEC's result portal | It holds photographs of paper, one per polling unit. Nobody can add up 176,846 photographs by eye |

A dispute that could have been caught in the hour it happened is instead argued at a tribunal eighteen months later, after the winner has been sworn in.

Poll360 exists to catch the result that cannot be true while there is still time to do something about it, and to keep the proof.

---

## 3. How a result travels

```
 POLLING UNIT
   The agent enters the figures and photographs the sheet
        │
        ▼
 FOUR CHECKS, BEFORE IT COUNTS
   1. Do the figures add up?
   2. Does the sheet add up against itself?
   3. Do the typed figures match the photograph?
   4. Is the result possible at all?
        │
        ▼
 THE RECORD
   One result per polling unit, per contest, per election
   A copy goes to Data Bank, sealed as evidence
        │
        ▼
 THE ROOMS
   Situation room · Broadcast desk · Verification · Admin
```

**Check 1: the figures add up.** Accredited voters cannot be more than registered voters. Votes cast plus rejected ballots cannot be more than accredited. An empty form is not a result. This runs on the phone as the agent types, so a slip is caught while the sheet is still in their hand, and it runs again on Poll360's side.

**Check 2: the sheet adds up.** Form EC8A checks itself: each party's votes are written in figures and in words, and the presiding officer writes the total in its own box. Poll360 reads the sheet and tests it against its own arithmetic.

**Check 3: typed figures match the photograph.** If the agent types 190 and the sheet clearly shows 90, the result is refused and the agent is told which figure differs. There is no override. A figure the reader could not make out is compared with nothing. It is never treated as a zero, and a sheet nobody could read never blocks a filing.

**Check 4: the result is possible.** Every result is screened the moment it arrives (see [integrity screening](#integrity-screening)).

---

## 4. Who uses it

| Who | Their screen | What they do there |
|---|---|---|
| **Polling unit agent** | The Agents app, on a phone | File the result, send updates through the day, report trouble |
| **Situation room** (a party or coalition) | The room | Watch coverage, read reports from the field, see the gap with official figures |
| **Broadcast desk** (a newsroom or studio) | The broadcast desk | Write, clear and publish result cards; put the count on air |
| **WhatsApp desk** | The WhatsApp desk | Read and answer every agent who files over WhatsApp |
| **Super administrator** | Admin | Run the count: approve agents, issue accounts, verify results, gather INEC's sheets |
| **Campaign strategist** | Election analytics and strategic planning | Ask questions, study strongholds, build a plan to win |

Each person sees only their own screen and their own ground. A senatorial campaign in Adamawa Central sees Adamawa Central, not the country.

---

## 5. Every feature

### Collecting results

**The Agents app.** Agents have their own app with its own name, icon and web address. It installs to the phone's home screen. Nothing in it says Poll360. It has three doors, because an agent does three different jobs on three different clocks:

- **Updates**: the day's steps. Materials arrived, voting started, voting closed, counting begun.
- **Results**: once, late, from the sheet.
- **Situations**: whatever goes wrong, at any minute. A threat, a snatched ballot box, a card reader that will not read.

An **SOS button** sits on the home screen as well as inside Situations. Somebody in danger should not have to choose a door first.

**Sign in with a code, not a password.** An agent signs up, an administrator approves them, and they receive a code like `33-0101001-K7M4QX`. The first part is their state, the second is their polling unit, and the last six characters are theirs alone. The public polling unit number printed on every result sheet is never accepted as a way in, because anybody holding a sheet would then be able to pose as the agent.

**Ward and polling unit by name.** Every ward and polling unit in Nigeria is loaded from INEC's own list, so an agent picks their unit from a list of names. Nobody types nine digits in the dark.

**Photographs that get through.** A photograph of 8MB is shrunk to about 300KB on the phone before it is sent, which is the difference between a report that lands on a weak rural signal and one that times out.

**Filing by WhatsApp.** An agent who will not install anything can file on WhatsApp, the app they already use. They photograph the sheet, Poll360 reads every figure and reads them back, and nothing is filed until the agent confirms. Eleven numbers typed in the dark become one confirmation.

**A desk for booths with no signal.** A situation room can enter a result read out over the phone from a polling unit that has no data connection. This is a separate permission from an agent's own filing.

**Reading the sheet.** The figures on a result sheet are handwritten by a tired presiding officer. Poll360 uses a reader that can read handwriting, with two simpler readers behind it if that one is not set up. Whichever reader runs, **it never files anything on its own**. The agent standing at the sheet always confirms.

### Checking results

<a id="integrity-screening"></a>
**Integrity screening.** Every result is screened on arrival against four kinds of problem:

| Kind | What it means | Example |
|---|---|---|
| **Impossible** | Breaks arithmetic. No innocent explanation | More accredited voters than registered voters |
| **Implausible** | Possible on paper, almost never real | 95% turnout or more at one polling unit |
| **Outlier** | Legal, but unusual for that area | Turnout far out of line with the rest of its state |
| **Pattern** | The digits look made up across many results | Too many results ending in round numbers |

The last one works because real counts end in every digit about equally often, and numbers that were invented cluster on round figures. It reports across a batch and never accuses a single polling unit.

**It states facts and leaves the judgement to a person.** Each finding is a statement that can be opened and checked against the photographed sheet. A typing mistake and a rigged figure can look the same on paper, so a person reads the sheet and decides.

**Who signed the sheet.** A result sheet is evidence because a named presiding officer signed and stamped it. Poll360 records whether a signature, a stamp and the officer's name are present. It keeps three answers apart: present, absent, and *could not tell from this photograph*. A thumb over the corner of a photo is never turned into a claim that a sheet was unsigned. It never ranks or scores officers, because an officer who was forced to sign and one who was corrupt produce the same paper.

**What the photograph says about itself.** A camera writes a note inside every picture: when it was taken and, often, where. Poll360 reads that note. A sheet whose own file says it was photographed forty kilometres from its polling unit, or the day before the poll, is one somebody should look at.

**Nobody signs off their own work.** A result is checked by somebody other than the person who filed it. Change a figure after it has been checked and it goes back to unchecked.

**A disputed result is never deleted.** It stays where it is, keeps its photograph, and stops counting.

### Verification: three records of one election

For every place, Poll360 holds three independent records and asks one question: do they say the same thing?

| Record | Where it comes from |
|---|---|
| **Our agents** | What the person you sent wrote down at the polling unit |
| **INEC's sheets** | What the commission photographed and published on its result portal, read into figures |
| **Announced** | What the commission then declared, uploaded by your desk or read automatically from a shared sheet |

Where they agree, the place is green. Where any two disagree, it is red. Where there is not enough to compare yet, it says so in a colour of its own.

**It only compares like with like.** Your agents cover some polling units. INEC's sheets cover the ones it has published. Setting those two totals beside each other compares different sets of polling units and proves nothing. Poll360 compares only the polling units both sides hold, so a gap it shows is a real gap, and a difference that is only coverage is shown as coverage.

**Announced figures come in two ways.** INEC reads its declared totals aloud at collation centres and publishes no table of them, so there is nothing of the commission's own to plug into. Poll360 takes them both ways that exist:

- **By hand.** Upload a spreadsheet or paste the figures. Every line that could not be read is listed by number, and the rest are saved.
- **Automatically.** Paste the link to a shared sheet where somebody at collation is typing each announcement. Poll360 reads it every two minutes and files whatever changed, so a figure is typed once and appears on every screen. The screen always says when the sheet was last read, when it last changed and what went wrong if anything did. A sheet that cannot be read changes nothing already on file.

Both go through the same reader and the same rules, and each figure records who is answerable for it.

**It gathers INEC's result portal for you.** From a screen, with buttons, an administrator can gather an election from INEC's Result Viewing Portal into Data Bank, keep it current, and have the sheets read into figures as they arrive. A whole national election is 8,809 wards. The work is done in short steps, so it carries on from where it stopped whether a screen is left open or a machine is left running overnight.

**It reports what is wrong with the publishing itself**, before any sheet is even read:

- polling units INEC lists and published no sheet for
- sheets that went up days after the poll
- sheets that were replaced after they first went up
- sheets the portal says are published, where no file exists

Each is given as a count and as a share of the place's polling units, so thirty-one missing sheets in a hundred and one in a hundred are not painted the same.

**Findings are grouped the way a room talks:** signs of rigging (more votes than voters, two counts naming different winners), signs of fraud (the paper itself is wrong: photographed elsewhere or on another day, replaced, or carrying another unit's code), figures that differ, and counting errors.

### The situation room

One console per desk, under a wall clock:

- **Coverage**: what has arrived and what has not, by state, local government and ward
- **Map**: drill from the country to a state to a local government to a ward to a polling unit, without leaving the frame
- **Situations**: a live feed of reports from the field, with photographs
- **Agents on the map**: a filled dot means a real location fix; a hollow ring means only the polling unit is known
- **Timeline**: the night as one clock, from materials arriving to the last result
- **Integrity**: everything the screening flagged
- **INEC**: the official sheets and what is wrong with them
- **Evidence**: the photographs, beside the figures
- **Operations**: who has not sent their result yet, and where the queue is backing up

**Two alarms that do not sound alike.** One means the product noticed something and somebody should look at a screen. The other means a person in the field reported trouble and somebody should pick up a phone. A room can tell which without looking up.

**About your seat, not the country.** Every panel narrows to the contest and the ground the account holds. A governorship campaign sees that state's governorship.

### The broadcast desk

**It publishes.** The desk writes a result card and sends it to Facebook, Instagram, X, Threads and Telegram itself, with other platforms reached through a relay.

**Two people, always.** One person writes a post and a different person clears it. Nobody may clear what they wrote. Nothing goes out on a timer.

**It never says "sent" when it was not.** A platform counts as sent only when it has answered with the address of the published post. A platform that did not answer is reported as "did not answer", so the desk goes and looks.

**The figures on a card cannot be typed in.** A writer chooses the place. The numbers are built from the stored results, so no screen can send out numbers the count does not hold.

**Every card is a Poll360 card.** One look across every platform, with the share counted and the time printed into the picture, so a screenshot cannot outlive its context.

**Going live.** One press opens a live broadcast on Facebook and YouTube, hands the operator the keys for their streaming software, puts up a full-screen stage showing the cleared count, and announces the programme on the other platforms.

**Corrections.** The desk can put an update right, on the record.

**For the studio.** Full-screen boards for a video wall, a web address that studio software such as OBS and vMix can point at, lower thirds and state cards that update themselves, and a cautious call that moves through four words: too early, too close, leaning, decided. Nothing is called under 25% counted.

### Ask Poll360

Type a question in ordinary words and get an answer from the record.

- "Where can he get 25%?"
- "How do I win Kano Central?"
- "What changed in Gombe since 2019?"
- "How strong is the ADC in Sokoto?"
- "What if Labour gains six points?"
- "Who has held this senate seat since 1999?"

**Every answer has four parts, in the same order:** the headline in one sentence, the reading place by place, what a campaign should do about it, and how it was worked out, including which figures are counted and which are estimated.

**A picture when it helps.** A map when the answer is about places, a chart when it is about change between two elections, and a table underneath with the same information in words.

**It cannot make up a number.** This is the part to understand. An AI model reads the question and writes the sentences. It never does the sums. Every figure comes from Poll360's own record, and every figure in every sentence is checked against that record before anybody reads it. A sentence carrying a number that traces to nothing is removed.

**It always answers.** If the AI model is switched off, slow, or having a bad hour, Poll360's own reader answers from the same record. On election morning nobody is told to come back later.

**It reasons out loud.** You can see how it got to the answer.

**Download it as a brief.** An answer can be saved as a branded PDF. Each answer is sealed when it is made, so a file can only ever print what Poll360 actually said.

**It stays inside your ground.** However a question is worded, an account cannot read past the area it was given.

### Poll360 AI: the voice on every dashboard

Press a button, speak, and it answers out loud. It can explain any figure or word on the screen, put cards up on a shared board and leave them there, and move the dashboard for you.

It answers only from what is on the screens, so it cannot say a number the screen behind it would contradict. When it does not know, it says so. It prefers a Nigerian English voice where the device has one, so place names are read properly. Speech in and speech out use the device's own browser, the microphone is silent until the button is pressed, and it visibly shows when it is listening.

### Planning and analysis

**Strongholds.** Where a candidate or party is strong and weak, from the state down to the polling unit, with a clear line drawn around what is counted and what is estimated. For 2023, a local government whose own collated figure was published is shown from that figure, and the rest of its state shares out what remains.

**How to win a seat.** For a presidency, a governorship, a senate seat or a House seat, Poll360 gives the number of votes it takes, who stands where, the local governments and wards to work in order, and the polling units to cover first.

**The contest run 10,000 times.** Poll360 takes the last result on that ground and moves it the way the vote has actually moved between past elections, ten thousand times over. If a party comes first in 6,400 of them, it says 64%, and beside it says exactly what that is: a statement about the last result and the size of past swings. It is not an opinion poll and knows nothing about candidates, money or defections. Ask the same question twice and you get the same figures to the last digit.

**Each contest from its own elections.** A senate seat is planned from senate elections. A governorship is planned from governorship elections. The presidential vote is never borrowed for either. Poll360 holds every senate election in all 109 senatorial districts and every governorship election in all 36 states since 1999.

**The presidential rule, shown in full.** To win the presidency a candidate needs the most votes **and** at least a quarter of the vote in 24 of the 36 states. Most trackers show only the first. Poll360 shows both, and warns the moment a scenario produces no winner at all.

**A candidate's path.** Poll360 will not invent a percentage chance. It measures the distance: how far short on each test, the smallest swing that would close it, and every state given a role (base, defend, target, out of reach).

**Research on anybody.** Type a candidate or a party and get every run on record: votes, share, position, states carried.

**Party strength on the ground.** Poll360 holds the ADC's own membership register for all 36 states and the FCT, down to the polling unit. Members' names are not kept. Membership and votes are always shown side by side and never added together, because a member is somebody who filled in a form and a vote is a mark on a ballot.

**The executive brief.** One party's position everywhere, in twelve figures, for the person who has ninety seconds before somebody wants an answer.

**How Nigeria has voted since 1999.** Turnout, how much the vote moves between elections, and how often places change hands, all measured from declared results.

**The planning map.** It opens blank on purpose, so the last election does not quietly argue for fighting it again. Pick territory and it costs the plan in polling units, agents and reach. Coverage can be measured four ways: against registered voters, accredited voters, votes actually cast, or polling units to staff. A state and the places inside it can never be counted twice. The plan downloads as a spreadsheet.

**What-if analysis.** Move a party's share and see the result. Five conditions (rain on the day, security, hardship, urban living, a young population) can be dialled up and down. Any figure that is generated is labelled as such.

### Agents

**Approval by a person.** Agents sign themselves up, with a photograph of their face on the record, and an administrator approves each one.

**Check-ins.** Agents check in through the day so a room knows somebody was actually standing there.

**Poll360 handles no money.** It does not pay agents, hold balances or record payments. Whatever an organisation pays its agents is settled outside the product.

### Running more than one election

Everything belongs to an **election project**. A presidential election in February and a governorship in March are two projects. Starting the second does not erase the first. A single-state contest opens on that state, not on a country where 36 of 37 places will never report.

The **command screen starts as a clean slate** and holds nothing until a real result arrives. Past elections appear only on the results and analysis screens.

### Data Bank: the evidence store

Everything Poll360 receives is also delivered to Data Bank: registrations, result sheets, the figures, situation reports and messages. Data Bank seals it and chains it together as evidence for the long wait between a polling day and a tribunal.

- **Every delivery is signed**, so a figure altered on the way would be detectable.
- **Nothing is lost on a bad night.** Whatever does not get through is kept and can be sent again safely.
- **A slow Data Bank never slows an agent.** Filing a result does not wait on it.

---

## 6. What makes it special

Poll360 is defined as much by what it refuses to do as by what it does. These rules are built in, not left to good behaviour.

| The rule | Why it matters |
|---|---|
| **Silence is not zero** | A polling unit that has not reported is drawn grey and labelled "no returns yet". It is never coloured for a party or shown as a low score |
| **Coverage travels with every total** | A party ahead on 4% of polling units is not ahead. Every figure carries the share it is built from: on screen, on air, in every download |
| **A photograph behind every result** | A number with nothing behind it is a claim, not a result |
| **A count, not the count** | Your agents' figures stay in their own column beside the official ones. The gap between them is the story, and blending them destroys it |
| **Facts, with the judgement left to people** | It tells you what is wrong with a document. A person decides what it means |
| **Counted and estimated are never mixed** | Every answer says which of its figures were counted and which are estimates |
| **The AI writes the words and never the numbers** | A confident wrong figure is the worst thing a campaign desk can read out |
| **One polling unit, one result** | A correction updates the result. It never adds a second one |
| **A polling unit is assigned, not typed** | A box where you type the polling unit is a box somebody could change |
| **Nobody approves their own work** | Not a ward coordinator, not head office |
| **Nothing disputed is deleted** | Deleting it would be the most suspicious thing the system could do |
| **Each contest from its own elections** | A senate seat is never planned from the presidential vote |
| **No money** | Poll360 pays nobody and holds no balances. A count and a payroll in one product would invite the question of what the payments were for |
| **Colour is never the only clue** | Every map has labels, a legend and a table with no colour in it, so it reads on a projector, in print, and for colour-blind readers |

---

## 7. Advantages over other tools

This compares Poll360 with the *kinds* of tool people use today. It is not a tested head-to-head against any named product.

| Compared with | What they give you | What Poll360 adds |
|---|---|---|
| **Results trackers and election maps** | A map and totals | Says how much of the country each total covers. Draws silence as grey. Shows the 25%-in-24-states test. Catches impossible results as they arrive. Keeps a photograph behind every figure |
| **INEC's result portal on its own** | Photographs of result sheets, one per polling unit | Reads them into figures, adds them up by place, lists what is missing, late or replaced, and sets them beside your own agents' count and the announcement |
| **WhatsApp groups and spreadsheets** | Fast, familiar, free | Keeps WhatsApp for the agent but reads the sheet automatically, checks the arithmetic, stops double reporting, ties each result to one approved agent and one polling unit, and keeps it all as evidence |
| **General survey and form apps** | A form anybody can fill in | Built for Form EC8A and for INEC's own list of 176,846 polling units. The polling unit comes from the agent's appointment. Figures are checked against the photograph |
| **Broadcast graphics systems** | Polished graphics from numbers supplied by somebody else | The desk sits on top of the count itself, so the card going to air and the photographed sheet behind it are in the same place. Two-person clearance is real, not ceremonial |
| **General AI chatbots** | Fluent answers, sometimes invented | Every figure is taken from the record and checked before it is shown. It says "not held" when it does not know. It still answers when the AI is unavailable |
| **Polling and forecasting sites** | A percentage chance | Will not invent a probability. Shows the distance to winning and the simulation behind any figure, and says what that figure does not know |

**The six things that are hard to find together anywhere else:**

1. **One chain from polling unit to air.** Collection, checking, verification, the situation room and the broadcast desk share one record, so nothing is retyped between them.
2. **Three records compared like for like.** Your count, INEC's published sheets and the announcement, held against each other only where they cover the same polling units.
3. **Evidence that lasts.** Photographs, the reading taken from them, and who did what, sealed for a tribunal.
4. **An AI that is held to the record.** Useful like a chatbot, and unable to print a figure it was not given.
5. **Planning down to the polling unit, from each seat's own history.** Presidency, governorship, senate and House, each from its own elections.
6. **It says what it does not know.** "Cannot tell yet", "not held" and "estimated" are real answers on every screen.

---

## 8. Built for election night

**Weak signal.** Photographs are shrunk on the phone. Maps load one state at a time, so a phone downloads about a hundred kilobytes, not a country. The app installs to the home screen and has an offline page.

**One hand, standing up, at night.** Big number pads, a running total, and figures saved as the agent goes, so a dropped signal costs a retry and not the figures.

**A crowd of viewers.** The figures on a board do not depend on who is looking, so everybody asking the same question in the same few seconds shares one answer. Load follows the number of different questions, not the number of people watching.

**A general election's worth of results.** A finished general election is about 884,000 results (176,846 polling units, five contests). Totals are added up where the data is stored, so the time to draw a board does not grow as results pour in.

**When something outside fails.** If Data Bank is slow, agents still file. If the AI is down, Ask Poll360 still answers. If the photograph store cannot be reached, the photograph is kept in the main store. If the service that limits sign-in attempts fails, it lets people through, because a hiccup must never lock four thousand agents out.

**Outages say so.** If the product cannot reach its data, the sign-in page says that, and does not treat it as a wrong password.

**Security.**

- Passwords are stored scrambled and cannot be read back, even by an administrator.
- Agents' phone numbers, incident reports and message contents are stored encrypted. Vote totals stay open, because they have to be added up.
- Result sheet photographs are private. Totals are public; the photograph shows handwriting and where somebody stood.
- Every page checks who is asking before it shows anything. Somebody who wanders into another room is sent back to their own.
- Staff and agents are kept as two separate populations with two separate sign-ins, so a mistake made for thousands of agents cannot reach the few staff accounts.
- Sign-in attempts are limited. Every important action is recorded with who did it and when.
- The product checks its own setup each time an administrator opens the dashboard and tells them what is not ready for a real election.

**Tested.** 1,360 automated checks, all passing. Many of them exist because of a specific fault that once slipped through quietly, so it cannot return.

---

## 9. Poll360 in numbers

| | |
|---|---|
| Polling units covered | **176,846**, from INEC's own list |
| Wards · local governments · states | 8,809 · 774 · 36 and the FCT |
| Senatorial districts · federal constituencies | 109 · 360 |
| Contests it can count | 6: presidential, governorship, senate, House of Representatives, House of Assembly, local government |
| Presidential record | Every election from 1999 to 2023 |
| Senate and governorship record | 999 elections since 1999 across 109 districts and 36 states. Vote figures for 229 of 249 governorship elections and 111 of 750 senate elections |
| Local governments with counted 2023 presidential figures | 71 of 774, in 7 states |
| Ways announced figures arrive | 2: uploaded by hand, or read automatically from a shared sheet |
| Party membership held | ADC, all 36 states and the FCT, to polling-unit level |
| Kinds of integrity finding | 4: impossible, implausible, outlier, pattern |
| Records compared in verification | 3: our agents, INEC's sheets, announced |
| Platforms the desk publishes to | Facebook, Instagram, X, Threads, Telegram, and others by relay |
| Simulation | 10,000 runs per contest, repeatable |
| Kinds of account | 6 |
| Automated checks | 1,360, all passing |

---

## 10. What it does not do yet

Stated plainly, because a product that asks to be trusted with a count should be the first to say where it stops.

| Limit | What it means |
|---|---|
| **Votes below state level are mostly estimated** | For past presidential elections, INEC published totals by state. Poll360 now holds the real 2023 figure for the 71 local governments where one was published and passed its checks (all of Bayelsa, Ekiti and the FCT, and parts of Kano, Adamawa, Ondo and Niger). Everywhere else, and for every ward and polling unit, the figure is the state total spread across its real polling units and labelled as an estimate. Lagos's published local government figures do not add up to its declared result, so they were left out |
| **Past turnout at a single polling unit is only known where a sheet has been read** | It was never published before INEC began posting sheets. Poll360 prints no estimate for it |
| **Senate vote figures before 2019 are not held** | Governorship votes are held for 229 of 249 elections. Senate votes are held for 102 of 105 seats in 2019 and only 9 in 2023, and for none from 1999 to 2015, because no readable record of them has been published. Who won is on record for nearly every seat, and where the votes are missing the answer says so |
| **Only one party's membership register is held** | The ADC's. Other parties show votes only |
| **Seat-by-seat plans below the senate** | House of Representatives and House of Assembly plans lean on the presidential vote on that ground, and say so |
| **Automatic announced figures need a sheet somebody keeps** | INEC provides no feed of declared totals. Poll360 reads a shared sheet on its own, but a person still has to type each announcement into that sheet once |
| **It cannot send live video itself** | It opens the broadcast and hands over the keys. Streaming software still has to send the picture |
| **New agents cannot sign in if Data Bank is unreachable** | Agents already signed in keep filing |
| **Filing with no signal at all** | Figures are saved as the agent goes, but a result still needs a connection to be sent |
| **The simulation is not a poll** | It knows the last result and the size of past swings, and nothing about the coming campaign |
| **Some factors are generated** | Security, hardship and rain figures in the what-if tools are not measured data and are labelled wherever they appear |

---

## 11. The short version

Poll360 gives you your own count of a Nigerian election, with a photograph behind every figure, checked in the hour it arrives, compared honestly against what INEC published and announced, ready to go on air, and kept as evidence.

Anyone can draw a map. Poll360 is for catching the result that cannot be true while it can still be challenged, and for being able to prove it afterwards.
