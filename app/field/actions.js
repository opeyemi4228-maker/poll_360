"use server";

import { revalidatePath } from "next/cache";

import { results, incidents, media, units, sheetReads } from "@/lib/db";
import { seal } from "@/lib/crypto";
import { requireCapability, requireUser, log } from "@/lib/guard";
import { currentUser } from "@/lib/session";
import { currentElection } from "@/lib/election-scope";
import { ballotFor, isRace, raceLabel } from "@/lib/races";
import { can } from "@/lib/roles";
import { isUnitCode, parseUnitCode } from "@/lib/units";
import { validateReturn } from "@/lib/results";
import { figuresForBallot, readSheet, trustworthy, visionAvailable } from "@/lib/sheet-vision";
import { matchSheet, matchRecord, mismatchMessage } from "@/lib/sheet-match";

/**
 * Filing from a booth.
 *
 * ── THE BOOTH IS NEVER READ FROM THE REQUEST ───────────────────────────────
 * It comes from `user.scope`, the unit on the agent's own account, resolved
 * on the server on every submission. There is no unit field in this form and
 * no dropdown, because a booth you can choose is a booth somebody can choose
 * wrongly, and a form field naming it is a field somebody can change.
 *
 * There is one exception and it is a different power, not a loosening of this
 * one: an account holding `results:upload` — the desk and the administrator —
 * may name a unit, because somebody has to be able to enter a return read down
 * the phone from a booth with no signal. An account with a booth of its own
 * never gets that field, whatever it sends, and every uploaded row records who
 * uploaded it and that it did not come from the booth.
 *
 * ── AND THE POSITION IS ALWAYS READ FROM THE REQUEST ───────────────────────
 * The opposite rule, for the opposite reason. One agent at one booth counts
 * five ballot papers on the same evening, so which contest these figures are
 * for is genuinely a property of the submission and not of the account. It is
 * checked against the list in lib/races.js and refused if it is not one of
 * them: a return filed against a position that does not exist is a return
 * nobody will ever look at again.
 *
 * The device's position is recorded beside the figures as corroboration. It
 * never decides which booth is being filed for, and a reading that looks wrong
 * never blocks a filing: rural fixes drift, buildings block sky, and a booth
 * moved fifty metres up the road is not fraud. It is stored, and it is visible
 * to whoever checks the return.
 *
 * ── THE SHEET IS THE ONE THING THAT DOES BLOCK ─────────────────────────────
 * Position corroborates; the photographed sheet *is* the return. Where the
 * agent attaches one and it can be read confidently, the figures they typed
 * are held against it and a disagreement stops the filing, with no override.
 * A return and its own photograph are two halves of one claim, and half a
 * claim is not filed.
 *
 * The strictness is bounded by what counts as a disagreement, not by mercy
 * afterwards: lib/sheet-match.js requires the reading to be self-consistent
 * before it may contradict anybody, and a figure the reader could not make out
 * is compared to nothing rather than to zero. A sheet nobody could read does
 * not block anything — it files with the attempt recorded and no corroboration
 * claimed, which is a different thing from having sent no sheet at all and is
 * stored as a different thing.
 * ───────────────────────────────────────────────────────────────────────────
 */

export async function fileResult(_previous, formData) {
  /* Either power gets in; which one you hold decides whose booth you may file
     for, a few lines down. Checked with the plain guard first so an account
     with neither is turned away before anything is read from the form. */
  const agent = await requireUser("/field");
  const mayFileOwn = can(agent.role, "results:file");
  const mayUploadAny = can(agent.role, "results:upload");

  if (!mayFileOwn && !mayUploadAny) {
    return { error: "This account is not allowed to file returns." };
  }

  const race = String(formData.get("race") ?? "").toUpperCase();
  if (!isRace(race)) {
    return { error: "Choose which position these figures are for." };
  }

  /* ── WHOSE BOOTH ────────────────────────────────────────────────────────
     An account with a unit of its own files for that unit and nothing else,
     and the field is ignored rather than rejected: an agent has no way to send
     one, so anything arriving in it came from somewhere that is not the form.
     Only an account with no booth and the upload power may name one. */
  const typed = String(formData.get("unitCode") ?? "").trim();
  const unitCode = agent.scope
    ? agent.scope
    : mayUploadAny && isUnitCode(typed)
      ? parseUnitCode(typed).code
      : null;

  if (!unitCode) {
    return agent.scope === null && mayUploadAny
      ? { errors: { unitCode: "Type the polling unit code, as it is printed on the sheet." } }
      : { error: "This account is not tied to a polling unit. Your coordinator must set one." };
  }

  const number = (name) => {
    const raw = String(formData.get(name) ?? "").replace(/[^\d]/g, "");
    return raw === "" ? Number.NaN : Number(raw);
  };

  const registered = number("registered");
  const accredited = number("accredited");
  const rejected = Number.isNaN(number("rejected")) ? 0 : number("rejected");

  /* The ballot for this position, including the bucket at the end. Reading the
     list from the same module the form drew itself from is what stops a box
     existing on screen with nowhere to be stored. */
  const votes = {};
  for (const party of ballotFor(race)) {
    const value = number(`votes_${party.id}`);
    votes[party.id] = Number.isNaN(value) ? 0 : value;
  }

  /* ── THE REST OF FORM EC8A ────────────────────────────────────────────────
     A box the agent left empty stays null rather than becoming 0. The two are
     different answers — "there were no spoiled papers" and "I did not read
     that box" — and only the first is a measurement. `auditSheet` checks an
     identity only when every box in it was captured, so a null quietly
     withdraws that check instead of failing it against a figure nobody wrote. */
  const optional = (name) => {
    const value = number(name);
    return Number.isNaN(value) ? null : value;
  };

  const text = (name) => {
    const value = String(formData.get(name) ?? "").trim();
    return value === "" ? null : value.slice(0, 120);
  };

  /* Three states in one field: struck out "not contested", struck out
     "contested", or left alone. A boolean could not carry the third, and the
     third is common — it is what a hurried officer leaves behind. */
  const contestedRaw = String(formData.get("contested") ?? "").trim();
  const contested = contestedRaw === "yes" ? true : contestedRaw === "no" ? false : null;

  /* Who signed, by party. Only the names actually given: an empty object is
     stored as null so "nobody signed" and "nobody was asked" stay apart. */
  const agents = {};
  for (const party of ballotFor(race)) {
    const name = text(`agent_${party.id}`);
    if (name) agents[party.id] = name;
  }

  const sheetBoxes = {
    formSerial: text("formSerial"),
    ballotsIssued: optional("ballotsIssued"),
    unusedBallots: optional("unusedBallots"),
    spoiled: optional("spoiled"),
    statedValid: optional("statedValid"),
    usedBallots: optional("usedBallots"),
    contested,
    sheetDate: text("sheetDate"),
    agents: Object.keys(agents).length ? agents : null,
  };

  if (Number.isNaN(registered) || Number.isNaN(accredited)) {
    return { errors: { figures: "Registered and accredited are both required." } };
  }

  /* The same function the browser ran. The client copy is a courtesy that
     saves a round trip; this is the one that counts. */
  const check = validateReturn({ registered, accredited, rejected, votes });
  if (!check.ok) return { errors: check.errors };

  /* Filed against the project the agent is looking at, not "the results". A
     booth reports once per position per election, and the unique index is on
     the three of them together.

     Resolved here, above the sheet check, because that check now has to know
     which project it is comparing within — a reading from another election
     must not be able to corroborate this return. */
  const project = await currentElection();

  if (!project) {
    return { error: "No election project is open, so this return has nowhere to go." };
  }

  /* ── THE SHEET, AND WHAT IT IS ALLOWED TO DO ──────────────────────────────
     Read before anything is written, because a return that contradicts its own
     photograph must never reach the results table even briefly. */
  const sheet = await checkAgainstSheet(
    formData.get("sheet"),
    { registered, accredited, rejected, votes },
    /* The reading the agent was actually shown, if the form read the sheet on
       attach. Held against that rather than against a fresh reading of the
       same photograph — see readSheetPhoto. */
    {
      readId: String(formData.get("sheetReadId") ?? "").trim(),
      userId: agent.id,
      electionId: project?.id ?? null,
    },
  );

  if (sheet.blocked) {
    return {
      errors: { sheet: sheet.message },
      mismatches: sheet.match.mismatches,
    };
  }

  const position = formData.get("lat")
    ? {
        lat: Number(formData.get("lat")),
        lon: Number(formData.get("lon")),
        accuracy: Number(formData.get("accuracy")) || null,
        distance: Number(formData.get("distance")) || null,
      }
    : null;

  const { amended } = await results.file({
    /* Every box on the sheet, straight through. */
    ...sheetBoxes,
    electionId: project.id,
    race,
    unitCode,
    stateCode: unitCode.slice(0, 2),
    registered,
    accredited,
    rejected,
    votes,
    position,
    note: String(formData.get("note") ?? "").trim().slice(0, 500) || null,
    submittedBy: agent.id,
    /* How it got here, kept on the row. A return typed by the agent standing
       at the booth and one read down the phone to a desk are both returns and
       they are not equally direct, and a screen that could not tell them apart
       would be hiding the difference rather than not knowing it. */
    source: agent.scope ? "APP" : "UPLOAD",
    /* Null only where no sheet was sent. An unreadable one records the
       attempt and why, so the desk can tell "nobody photographed it" from
       "somebody did and we could not read it" — the second is worth a phone
       call and the first is not. */
    sheetMatch: sheet.record,
  });

  /* ── THE BOOTH ENTERS THE REGISTRY BY BEING REPORTED ────────────────────
     The desk's coverage tree is polling units joined to what has been filed
     against them, so a return for a booth nobody had heard of would be counted
     in every total and appear in no tree. Registering here means "reported" and
     "known about" cannot disagree.

     Idempotent by construction — it upserts on the code — and it never
     overwrites a name or a position that is already there with a null. */
  await units.register({
    electionId: project.id,
    code: unitCode,
    registered,
    repName: String(formData.get("repName") ?? "").trim().slice(0, 120) || null,
    lat: position?.lat ?? null,
    lon: position?.lon ?? null,
    source: agent.scope ? "APP" : "UPLOAD",
  });

  await log(agent, amended ? "result:amended" : "result:filed", unitCode, {
    race,
    cast: check.cast,
    positioned: Boolean(position),
    /* Three different facts about a return, and an audit trail that recorded
       all of them as silence could not tell them apart afterwards. */
    sheet: !sheet.record
      ? "none"
      : sheet.record.agrees
        ? "agreed"
        : `not compared: ${sheet.record.reason ?? "unknown"}`,
  });

  revalidatePath("/field");
  revalidatePath("/admin");
  /* Every screen that draws this return, named rather than assumed. The room's
     map is built from filed returns now, so a new one changes what is on the
     wall; the desk lists what has arrived; and the divergence room reads them
     as they land. */
  revalidatePath("/room");
  revalidatePath("/whatsapp");
  revalidatePath("/broadcast");
  /* The divergence room reads returns as they arrive, so a new one changes
     what it is showing. */
  revalidatePath("/gap");

  return {
    ok: true,
    amended,
    cast: check.cast,
    sheet: sheet.record,
    race,
    raceLabel: raceLabel(race),
    unitCode,
  };
}

/**
 * Read the attached sheet and hold the typed figures against it.
 *
 * ── EVERY FAILURE PATH ENDS IN "FILE IT ANYWAY" EXCEPT ONE ─────────────────
 * No sheet attached, no reader configured, bytes that are not a photograph, a
 * page the reader could not make sense of: all of these produce a filing with
 * no comparison recorded. The single path that stops a filing is a confident,
 * arithmetically coherent reading of a figure that differs from what the agent
 * typed.
 *
 * That asymmetry is the whole design. Blocking on a reader's every objection
 * would stop honest agents filing under a torch, and a count nobody can file
 * into is worse than a count with some uncorroborated rows in it.
 */
async function checkAgainstSheet(photo, typed, shown = {}) {
  /* ── THREE STATES, NOT TWO ───────────────────────────────────────────────
     No sheet at all is `null`. A sheet that was attached and could not be
     compared records the attempt and why. A sheet that was compared records
     what it found. Collapsing the first two would make "nobody sent a
     photograph" and "somebody sent one and it was unreadable" identical
     afterwards, and only one of those is worth ringing an agent about. */
  const none = { blocked: false, record: null, match: null, message: null };
  const uncompared = (reason) => ({
    blocked: false,
    match: null,
    message: null,
    record: { compared: false, agrees: false, checked: [], mismatched: [], reason },
  });

  /* ── THE READING THE AGENT SAW, WHERE THERE IS ONE ───────────────────────
     Its id comes from the browser, so it is checked rather than trusted: the
     row has to exist and has to belong to the account filing. A borrowed id
     would otherwise let one booth's return be corroborated by another booth's
     photograph, which is precisely the fraud this comparison exists to catch.
     A stale or borrowed id is not an error — it simply falls through to
     reading the attached photograph, which is what used to happen always. */
  if (shown.readId) {
    const stored = await sheetReads.get(shown.readId);
    if (
      stored?.parsed &&
      stored.userId &&
      stored.userId === shown.userId &&
      /* A reading from another project cannot corroborate this one. */
      (!shown.electionId || stored.electionId === shown.electionId)
    ) {
      const match = matchSheet(stored.parsed, typed);
      /* Note on the reading itself what the human did with it, so the row is
         a complete account of one photograph rather than half of one. */
      await sheetReads.accept(shown.readId, typed);
      if (match.comparable && !match.agrees) {
        return {
          blocked: true,
          match,
          record: matchRecord(match),
          message: mismatchMessage(match, { channel: "web" }),
        };
      }
      return { blocked: false, match, record: matchRecord(match), message: null };
    }
  }

  if (!photo || typeof photo.arrayBuffer !== "function" || photo.size === 0) return none;
  /* The framework caps the request body as well; this is the check that can
     say something useful rather than dropping the whole submission. */
  if (photo.size > 6_000_000) return uncompared("the picture was too large to read");
  if (!visionAvailable()) return uncompared("no reader configured");

  let bytes;
  try {
    bytes = Buffer.from(await photo.arrayBuffer());
  } catch {
    return uncompared("the picture could not be opened");
  }

  /* The declared type is a claim; the leading bytes are a fact. */
  if (!sniff(bytes)) return uncompared("the file was not a photograph");

  const read = await readSheet(bytes);
  if (!read.ok) return uncompared(read.reason ?? "the picture could not be read");

  const match = matchSheet(read.parsed, typed);

  if (match.comparable && !match.agrees) {
    return {
      blocked: true,
      match,
      record: matchRecord(match),
      message: mismatchMessage(match, { channel: "web" }),
    };
  }

  return { blocked: false, match, record: matchRecord(match), message: null };
}

/**
 * Read a photographed sheet and hand the figures back to the form.
 *
 * ── WHY THE READING HAPPENS HERE AND NOT AT FILING TIME ────────────────────
 * The photograph used to be checked against figures the agent had already
 * typed. That is the wrong way round when the reader can actually read: it
 * makes somebody type eleven numbers off a form in the dark so a machine can
 * disagree with them afterwards. Read on attach instead, put the figures in
 * the boxes, and the agent's job becomes reading them back against the sheet
 * in their hand — one act of checking rather than eleven of transcription.
 *
 * ── AND WHY THE READING IS STORED, NOT JUST RETURNED ───────────────────────
 * The row written here is what the machine said before any human touched it.
 * The filing that follows carries this row's id, so what finally lands in the
 * count is compared against exactly the reading the agent was shown, and the
 * difference between the two is on the record permanently. Reading the same
 * photograph a second time at filing would cost twice and prove less: a
 * second reading is not evidence about the first one.
 *
 * ── IT PROPOSES. IT STILL DOES NOT FILE. ───────────────────────────────────
 * Nothing here writes a result. The figures go into boxes the agent can edit
 * and must submit. That has been the rule since the first reader and it does
 * not relax because this one is better.
 */
export async function readSheetPhoto(_previous, formData) {
  const failed = (reason) => ({ ok: false, reason });

  /* ── WHY THIS DOES NOT USE `requireUser` ─────────────────────────────────
     `requireUser` redirects to the sign-in page, and a redirect here throws
     away everything already typed into the form — which is the worst thing
     that can happen to somebody standing at a booth at close of poll. Worse,
     it redirected accounts that were never signed out at all: a polling unit
     coordinator has a session of its own and no row in `users`, so this said
     "not signed in" to the one population it was built for and sent them to
     a login page they had no business seeing.

     It reports instead. The form keeps its figures, the agent is told what
     happened, and the sheet can still be filed by hand. The coordinator's
     own twin of this lives in app/agent/actions.js. */
  const user = await currentUser();
  if (!user) {
    return failed("You appear to be signed out. Open this page again in a new tab to sign in, then take the photograph — nothing typed here is lost.");
  }

  if (!visionAvailable()) return failed("No reader is configured on this server.");

  const photo = formData.get("sheet");
  if (!photo || typeof photo.arrayBuffer !== "function" || photo.size === 0) {
    return failed("No photograph was attached.");
  }
  if (photo.size > 6_000_000) return failed("That picture is too large to read.");

  let bytes;
  try {
    bytes = Buffer.from(await photo.arrayBuffer());
  } catch {
    return failed("That picture could not be opened.");
  }

  /* The declared type is a claim; the leading bytes are a fact. */
  if (!sniff(bytes)) return failed("That file is not a photograph.");

  const race = String(formData.get("race") ?? "").toUpperCase();

  /* The project this reading belongs to. Without it the row lands against
     whatever the column defaults to, which is how every reading taken so far
     ended up filed under the 2023 project and invisible to the rehearsal that
     produced it. Refusing beats guessing. */
  const project = await currentElection();
  if (!project) {
    return failed("No election project is running, so a reading has nowhere to be saved.");
  }

  const read = await readSheet(bytes);
  if (!read.ok) return failed(read.reason ?? "That picture could not be read.");

  const parsed = read.parsed;

  /* See `trustworthy` in lib/sheet-vision.js for what earns this. */
  const trusted = trustworthy(read);

  /* The booth is the account's, never the sheet's. A reader that misread a
     unit code must not be able to move a return to another booth — the code
     it read is kept for the record and shown to the agent, and that is all. */
  const id = await sheetReads.record({
    electionId: project.id,
    userId: user.id,
    unitCode: user.scope ?? parsed.unitCode ?? null,
    parsed,
    rawText: read.text ?? null,
    confidence: read.confidence ?? null,
    reader: read.reader ?? null,
    race: isRace(race) ? race : null,
    source: "APP",
  });

  await log("sheet.read", user.id, {
    reader: read.reader ?? null,
    usable: parsed.usable,
    unit: user.scope ?? null,
  });

  return {
    ok: true,
    readId: id,
    reader: read.reader ?? null,
    confidence: read.confidence ?? null,
    legibility: read.legibility ?? null,
    /* Named so the agent can look at the right box rather than all of them. */
    unreadable: read.unreadable ?? [],
    /* What went into "Other parties", with its working shown. */
    folded: read.folded ?? [],
    problems: parsed.problems ?? [],
    usable: parsed.usable,
    trusted,
    /* Said in terms of what to do about it, not what went wrong inside. */
    /* ── WRITTEN FOR SOMEBODY STANDING AT A BOOTH ─────────────────────────
       Not a word about readers, servers or keys. Whoever is holding this
       phone cannot change any of that and has a queue in front of them; what
       they need is what to do with the figures on screen. The version an
       administrator can act on is a readiness check — see lib/readiness.js —
       which is the screen where it can actually be fixed. */
    why: trusted
      ? null
      : "The votes on this sheet do not add up to the accredited total, so at least one figure is misread. Read each box back against your sheet before you send it.",
    figures: figuresForBallot(parsed, race),
  };
}

/** Raise something that is not a number: a queue, a delay, an obstruction. */
export async function reportIncident(_previous, formData) {
  const agent = await requireCapability("incidents:file", "/field");

  const kind = String(formData.get("kind") ?? "").trim().slice(0, 80);
  const severity = String(formData.get("severity") ?? "INFO");
  const detail = String(formData.get("detail") ?? "").trim().slice(0, 1500);

  if (!kind) return { errors: { kind: "Say what happened." } };
  if (!["INFO", "SERIOUS", "CRITICAL"].includes(severity)) {
    return { errors: { severity: "Pick how serious it is." } };
  }

  const project = await currentElection();

  const incidentId = await incidents.create({
    electionId: project?.id,
    unitCode: agent.scope ?? "unassigned",
    stateCode: (agent.scope ?? "00").slice(0, 2),
    kind,
    severity,
    /* Sealed: an incident narrative names people and places, and it is the
       most sensitive thing this system stores. */
    detailSealed: seal(detail),
    reportedBy: agent.id,
  });

  /* ------------------------------------------------------------- the photo
     The browser has already downscaled this to ~1280px, so what arrives is a
     few hundred kilobytes rather than eight megabytes over a rural signal.

     What arrives is still never trusted: the declared type is checked against
     the actual magic bytes, because a file called photo.jpg is a claim and the
     first four bytes are a fact. Anything that is not a real JPEG or PNG is
     dropped and the incident is still filed, losing the picture must never
     lose the report. */
  const photo = formData.get("photo");
  if (photo && typeof photo.arrayBuffer === "function" && photo.size > 0) {
    try {
      if (photo.size > 6_000_000) throw new Error("too large");
      const bytes = Buffer.from(await photo.arrayBuffer());
      const mime = sniff(bytes);
      if (mime) {
        await media.attach({ incidentId, mime, bytes });
      }
    } catch {
      /* Deliberately silent: the report is the thing that matters, and an
         agent standing in a queue must not be blocked by a bad camera file. */
    }
  }

  await log(agent, "incident:reported", agent.scope, { kind, severity });
  revalidatePath("/field");
  revalidatePath("/admin");
  revalidatePath("/room");

  return { ok: true };
}

/**
 * What these bytes actually are.
 *
 * The Content-Type a browser sends is a claim; the leading bytes are a fact.
 * Only two formats are accepted, both of which every phone camera produces,
 * and anything else, including an SVG, which is a script in a trench coat, * is refused.
 */
function sniff(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}
