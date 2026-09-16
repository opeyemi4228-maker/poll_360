"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { revalidatePath } from "next/cache";

import { coordinators, coordinatorSessions } from "@/lib/coordinators";
import {
  createCoordinatorSession,
  currentCoordinator,
  destroyCoordinatorSession,
  sweepExpiredCoordinatorSessions,
} from "@/lib/coordinator-session";
import { rateLimit } from "@/lib/ratelimit";
import { isNigerianMobile, normalisePhone } from "@/lib/phone";
import { boothFromForm } from "@/lib/booth";
import { parseUnitCode } from "@/lib/units";
import { sniffImage } from "@/lib/image-bytes";
import { agentPath } from "@/lib/agent-address";
import { applyAsAgent, confirmAgentCode } from "@/lib/databank-agents";
import { forgetAgentCode, rememberAgentCode } from "@/lib/agent-code-vault";
import { audit, results, units, sheetReads } from "@/lib/db";
/* Everything this product takes in is also delivered to the hub that seals and
   chains it for the eighteen months between a polling day and a tribunal.
   Never awaited on a user's path — see lib/databank.js. */
import { KIND, forwardToDataBank } from "@/lib/databank";
import { currentElection } from "@/lib/election-scope";
import { agentElection } from "@/lib/agent-election";
import { placeOf } from "@/lib/lga-names";
import { elections } from "@/lib/elections";
import { ballotFor, isRace } from "@/lib/races";
import { validateReturn } from "@/lib/results";
import { figuresForBallot, readSheet, trustworthy, visionAvailable } from "@/lib/sheet-vision";
import { matchSheet, matchRecord, mismatchMessage } from "@/lib/sheet-match";

/**
 * The coordinator's own way in and out.
 *
 * ── SEPARATE FROM app/actions/auth.js ON PURPOSE ───────────────────────────
 * These never touch `users`, never issue a staff session, and never consult
 * the role table. A coordinator account cannot open a Poll360 room and a staff
 * account cannot sign in here, because neither action ever looks in the other's
 * table. That is the guarantee the separation is for, and it only holds while
 * these two files stay apart.
 * ───────────────────────────────────────────────────────────────────────────
 */

async function whereFrom() {
  const list = await headers();
  return {
    ip: (list.get("x-forwarded-for")?.split(",")[0] ?? "local").trim(),
    userAgent: list.get("user-agent") ?? undefined,
  };
}

/* ── signing up ───────────────────────────────────────────────────────────── */

export async function joinAsAgent(_previous, formData) {
  const { ip } = await whereFrom();

  /* Five in an hour from one address. A ward coordinator signing up their
     whole team from one phone is a real thing and this leaves room for it; a
     script filling the approval queue with noise is not. */
  const limit = rateLimit(`agent-join:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return {
      error:
        "That is several sign-ups from this connection in the last hour. Wait a few minutes and try again.",
    };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const rawPhone = String(formData.get("phone") ?? "").trim();

  /* Where they say they are, in the four parts the form asks for. */
  const booth = boothFromForm(formData);

  /* Optional, and kept only as the agent's own words. See UnitPicker. */
  const wardName = String(formData.get("wardName") ?? "").trim().slice(0, 80);
  const unitName = String(formData.get("unitName") ?? "").trim().slice(0, 80);

  const cleaned = rawPhone ? normalisePhone(rawPhone) : null;
  const phone = isNigerianMobile(cleaned) ? cleaned : null;

  const values = {
    name,
    phone: rawPhone,
    state: booth.state,
    lga: booth.lga,
    ward: booth.ward,
    unit: booth.unit,
    wardName,
    unitName,
  };
  const errors = { ...booth.errors };

  if (!name) errors.name = "Tell us your name, as your coordinator knows it.";
  if (!rawPhone) errors.phone = "Your phone number is needed. It is how your coordinator reaches you.";
  else if (!phone) errors.phone = "That does not look like a Nigerian phone number.";

  /* ── THE PHOTOGRAPH, CHECKED BEFORE ANYTHING IS SENT ────────────────────
     Required, because a name and a booth code can be typed by anybody, while
     a photograph is the thing a ward coordinator either recognises or does
     not — and Agent360 pairs every presence claim with a face. What the
     browser calls the file is a claim; the first four bytes are a fact. */
  const photo = formData.get("photo");
  let photoBytes = null;
  let photoMime = null;

  if (!photo || typeof photo.arrayBuffer !== "function" || photo.size === 0) {
    errors.photo = "A photograph of yourself is needed. Your coordinator checks it against the appointment list.";
  } else if (photo.size > 6_000_000) {
    errors.photo = "That picture is too large. Take another one with your phone's camera.";
  } else {
    try {
      const bytes = Buffer.from(await photo.arrayBuffer());
      const mime = sniffImage(bytes);
      if (!mime) {
        errors.photo = "That file is not a photograph this system can read. A picture from your phone's camera will work.";
      } else {
        photoBytes = bytes;
        photoMime = mime;
      }
    } catch {
      errors.photo = "That picture could not be opened. Try taking it again.";
    }
  }

  if (Object.keys(errors).length) return { errors, values };

  /* ── ONTO THE AGENT LIST, WHICH DATA BANK HOLDS ─────────────────────────
     A sign-up is a request to be put on the list, and the list is Data
     Bank's. This product keeps no row for it: the approval screen reads the
     list back, and approving is what issues the code the agent signs in with.

     Awaited, unlike the forwards elsewhere, because the person holding the
     phone needs to know it landed. Signing up is not time-critical the way
     filing a result is; if Data Bank cannot be reached they are told to try
     again, and nothing half-exists. */
  const applied = await applyAsAgent({
    ref: `poll360:site:${crypto.randomUUID()}`,
    fullName: name,
    phone,
    pollingUnitCode: booth.code,
    role: "Polling unit agent",
  });

  if (!applied.ok) {
    return {
      error: "We could not send your details just now, so nothing was saved. Wait a few minutes and try again.",
      values,
    };
  }
  if (applied.outcome === "already") {
    return {
      error:
        "You are already on the agent list for this polling unit. Your coordinator gives you your code once you are approved.",
      values,
    };
  }

  await audit.record({
    actorId: null,
    actorName: name,
    action: "agent:applied",
    subject: booth.code,
    meta: { databankAgentId: applied.id },
    ip,
  });

  /* ── AND THE REGISTRATION, WITH THE PHOTOGRAPH, ON TO AGENT360 ──────────
     Agent360 answers whether somebody was actually standing at a booth, and
     it starts from a face. The registration travels through Data Bank's
     intake door as it always has, sealed at rest, and is never awaited. Every
     key is spelled the way Data Bank's registration handler reads it. */
  const place = parseUnitCode(booth.code);
  const photoHash = createHash("sha256").update(photoBytes).digest("hex");

  forwardToDataBank({
    kind: KIND.REGISTRATION,
    externalId: `poll360:agent:${applied.id}`,
    sender: phone,
    mime: photoMime,
    mediaHashes: [photoHash],
    payload: {
      role: "POLLING_AGENT",
      fullName: name,
      photo: photoBytes.toString("base64"),
      photoMime,
      photoHash,
      phone,
      email: null,
      pollingUnitCode: booth.code,
      unitCode: booth.code,
      wardCode: place?.wardCode ?? null,
      lgaCode: place?.lgaCode ?? null,
      stateCode: booth.code?.slice(0, 2) ?? null,
      wardName: wardName || null,
      unitName: unitName || null,
      status: "PENDING",
      registeredAt: new Date().toISOString(),
    },
  });

  redirect(agentPath(`/pending?unit=${encodeURIComponent(booth.code)}`));
}


/* ── signing in ───────────────────────────────────────────────────────────── */

/**
 * Sign in with the code. The only way an agent signs in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DATA BANK CONFIRMS THE CODE
 *
 *  The agent list is Data Bank's, and so is the answer to "whose code is
 *  this". Every sign-in asks it. A code that belongs to an approved agent
 *  comes back with the agent's name, phone and polling unit; anything else —
 *  not a code, nobody's code, a suspended agent's code — comes back as one
 *  refusal, so the form cannot be used to learn which booths have agents.
 *
 *  ── THE SESSION IS KEPT HERE ─────────────────────────────────────────────
 *  Filing needs an author row for the result it writes, and a session that
 *  survives a bad signal. So the confirmed agent is kept as a row in
 *  `coordinators`, linked to their Data Bank id, and signed in on this
 *  product's own cookie. Nothing on the filing path calls Data Bank.
 * ══════════════════════════════════════════════════════════════════════════
 */
export async function signInWithCode(_previous, formData) {
  const { ip, userAgent } = await whereFrom();

  /* Ten in fifteen minutes. Thirty bits of secret behind that is far past
     anything a guess reaches, and it leaves room for somebody mistyping their
     own code four times in the dark. */
  const limit = rateLimit(`agent-code:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) {
    return { error: "Too many attempts from this connection. Wait a few minutes and try again." };
  }

  const confirmed = await confirmAgentCode(formData.get("code"));

  if (confirmed.state === "unavailable") {
    return {
      error: "Codes cannot be checked right now. Nothing is wrong with yours — wait a minute and try again.",
    };
  }
  if (confirmed.state !== "matched") {
    return { error: "That code did not match an approved agent. Check it and try again, or ask your coordinator." };
  }

  /* ── A GOOD CODE THAT CANNOT BE SAVED IS NOT THE AGENT'S FAULT ───────────
     Data Bank has already said yes by here. If this product's own database
     then refuses the write — full, or unreachable — the agent is owed a
     sentence that says their code is fine, not a page saying it did not
     build. The redirect stays outside, because it works by throwing. */
  let person;
  try {
    person = await coordinators.mirrorAgent(confirmed.agent);
    if (person?.canFile) {
      await createCoordinatorSession(person.id, { userAgent });
      /* Sealed onto this phone, never into the database: it is what Data Bank
         asks for before it will put an update or a report on a board in this
         agent's name. See lib/agent-code-vault.js. */
      await rememberAgentCode(formData.get("code"));
      await coordinators.markSignedIn(person.id);
      await sweepExpiredCoordinatorSessions();
    }
  } catch (error) {
    console.error("agent sign-in could not be saved:", error?.code ?? "", error?.message ?? error);
    return {
      error:
        "Your code is right, but sign-in cannot finish right now because of a problem on our side. Tell your coordinator — nothing you have filed is lost.",
    };
  }

  if (!person?.canFile) {
    return { error: "This account cannot file at the moment. Speak to your coordinator." };
  }

  await audit.record({
    actorId: null,
    actorName: person.name,
    action: "coordinator:signed-in",
    subject: person.unitCode,
    meta: { by: "code", confirmedBy: "databank" },
    ip,
  });

  redirect(agentPath("/"));
}


/* ── signing out ──────────────────────────────────────────────────────────── */

export async function signOutAgent() {
  const person = await currentCoordinator();
  if (person) {
    /* Every session, not just this browser's. A phone that files results is a
       phone that gets lost, and "sign out" on a stolen handset has to mean
       the session on it stops working too. */
    await coordinatorSessions.destroyAllFor(person.id);
  }
  await destroyCoordinatorSession();
  await forgetAgentCode();
  redirect(agentPath("/login"));
}


/* ── filing ───────────────────────────────────────────────────────────────── */

/**
 * A return, from the coordinator standing at the booth.
 *
 * ── A TWIN OF fileResult IN app/field/actions.js, AND WHY ──────────────────
 * Every check in there is repeated here, deliberately and in the same order:
 * the position is validated against lib/races.js, the arithmetic runs through
 * the same `validateReturn` the browser ran, and the photographed sheet is
 * held against the typed figures with the same power to stop the filing.
 *
 * What differs is only the identity. There is no role table to consult and no
 * capability to hold: a coordinator who has been approved may file for their
 * own booth, and that is the whole of the permission model on this side. The
 * booth is never read from the request — it is on their account — so there is
 * no equivalent of the desk's power to name a unit, because a coordinator who
 * could type a unit code could file for a booth nobody appointed them to.
 *
 * ── THE SEPARATION HAS ONE COST AND IT IS THIS FUNCTION ────────────────────
 * A check added to the staff action and not to this one leaves a whole
 * population filing under weaker rules. The form is shared precisely so the
 * client-side half cannot drift; this half has to be kept in step by hand.
 * ───────────────────────────────────────────────────────────────────────────
 */
export async function fileAgentResult(_previous, formData) {
  const person = await currentCoordinator();
  if (!person) return { error: "You have been signed out. Sign in again to file." };

  /* Not `requireCoordinator`, which redirects: a form post that redirects to
     a sign-in page loses whatever was typed into it, and this is a form
     somebody filled in while standing at a booth. */
  if (!person.canFile) {
    return { error: "This account has not been approved yet, so it cannot file." };
  }
  if (!person.unitCode) {
    return { error: "This account is not tied to a polling unit. Speak to your coordinator." };
  }

  const race = String(formData.get("race") ?? "").toUpperCase();
  if (!isRace(race)) return { error: "Choose which position these figures are for." };

  const number = (name) => {
    const raw = String(formData.get(name) ?? "").replace(/[^\d]/g, "");
    return raw === "" ? Number.NaN : Number(raw);
  };

  const registered = number("registered");
  const accredited = number("accredited");
  const rejected = Number.isNaN(number("rejected")) ? 0 : number("rejected");

  /* The ballot for this position, read from the same module the form drew
     itself from, so a box on screen always has somewhere to be stored. */
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

  /* The presiding officer, as written at the foot of the sheet: read off the
     photograph and confirmed by the agent, or typed where it could not be. */
  const repName = text("repName");

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

  const check = validateReturn({ registered, accredited, rejected, votes });
  if (!check.ok) return { errors: check.errors };

  /* ── WHICH PROJECT, WITH NO COOKIE TO READ ──────────────────────────────
     The election switcher is a staff control and sets a cookie on the staff
     side; a coordinator has never seen it and has no preference to honour. So
     this files into whatever project is actually running, and refuses rather
     than guessing when none is — filing a governorship return into a closed
     presidential project is not a small mistake. */
  /* The same election the agent's own pages show — their state's first. A
     page and its filing that picked two different projects would file a
     return into an election the agent never saw on screen. */
  const project = await agentElection(person.unitCode);
  if (!project) {
    return { error: "No election is running at the moment, so this return has nowhere to go." };
  }

  /* Read before anything is written: a return that contradicts its own
     photograph must never reach the results table, even briefly. */
  const sheet = await checkSheet(
    formData.get("sheet"),
    { registered, accredited, rejected, votes },
    {
      readId: String(formData.get("sheetReadId") ?? "").trim(),
      userId: person.id,
      electionId: project.id,
    },
  );

  if (sheet.blocked) {
    return { errors: { sheet: sheet.message }, mismatches: sheet.match.mismatches };
  }

  const position = formData.get("lat")
    ? {
        lat: Number(formData.get("lat")),
        lon: Number(formData.get("lon")),
        accuracy: Number(formData.get("accuracy")) || null,
        distance: Number(formData.get("distance")) || null,
      }
    : null;

  const unitCode = person.unitCode;

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
    /* The bridge. `submittedBy` stays null and the database enforces that
       exactly one of the pair is set. */
    coordinatorId: person.id,
    source: "AGENT",
    repName,
    sheetMatch: sheet.record,
  });

  /* The booth enters the registry by being reported, so "reported" and "known
     about" cannot disagree. Idempotent, and it never overwrites a name or a
     position already there with a null. */
  await units.register({
    electionId: project.id,
    code: unitCode,
    registered,
    repName: String(formData.get("repName") ?? "").trim().slice(0, 120) || null,
    lat: position?.lat ?? null,
    lon: position?.lon ?? null,
    source: "AGENT",
  });

  const list = await headers();
  await audit.record({
    /* No actor id: this person is not in `users`, and writing their
       coordinator id into a column that references it would be a foreign key
       violation on the one table that must never refuse a write. The name and
       the booth are what the trail is read for. */
    actorId: null,
    actorName: person.name,
    action: amended ? "result:amended" : "result:filed",
    subject: unitCode,
    meta: {
      race,
      cast: check.cast,
      by: "coordinator",
      coordinatorId: person.id,
      sheet: !sheet.record
        ? "none"
        : sheet.record.agrees
          ? "agreed"
          : `not compared: ${sheet.record.reason ?? "unknown"}`,
    },
    ip: (list.get("x-forwarded-for")?.split(",")[0] ?? "local").trim(),
  });

  /* ── AND ON TO THE HUB ──────────────────────────────────────────────────
     The figures, and the hash of the photograph they were held against. The
     bytes themselves are not sent: the picture already went as its own item
     when it was read, and Data Bank pairs the two on the hash rather than
     holding a second copy of a six-megabyte photograph.

     After the return is committed and after the audit line, never before. A
     hub that is unreachable must cost this product nothing at all — see
     lib/databank.js. */
  forwardToDataBank({
    kind: KIND.RESULT_FIGURES,
    externalId: `poll360:result:${project.id}:${race}:${unitCode}`,
    sender: person.phone ?? null,
    mediaHashes: sheet.record?.hash ? [sheet.record.hash] : [],
    payload: {
      unitCode,
      stateCode: unitCode.slice(0, 2),
      race,
      electionId: project.id,
      registered,
      accredited,
      rejected,
      votes,
      cast: check.cast,
      position: position ?? null,
      /* Whether a photograph corroborated these numbers, in the words the
         audit trail uses, so the hub is never left to infer it. */
      sheet: !sheet.record
        ? "none"
        : sheet.record.agrees
          ? "agreed"
          : `not compared: ${sheet.record.reason ?? "unknown"}`,
      amended,
      unitName: placeOf(unitCode)?.unitName ?? (await units.at(unitCode).catch(() => null))?.name ?? null,
      /* ── EVERYTHING ELSE THE AGENT CONFIRMED OFF THE SHEET ────────────────
         The rest of the boxes, the serial and date, who presided, whether the
         photograph showed a signature and a stamp, and the party agents who
         signed. Without them the hub holds a row of numbers; with them it
         holds a result somebody can defend. The certification is the reading
         the agent was shown, never composed here — see lib/certification.js. */
      ...sheetBoxes,
      presidingOfficer: repName,
      certification: sheet.parsed?.certification ?? null,
      readBy: "HUMAN",
      filedBy: { name: person.name, coordinatorId: person.id },
      filedAt: new Date().toISOString(),
    },
  });

  revalidatePath("/agent", "layout");
  revalidatePath("/admin");
  revalidatePath("/room");

  return { ok: true, amended, cast: check.cast, race, sheet: sheet.record };
}

/**
 * Read a photographed sheet for a polling unit coordinator.
 *
 * ── WHY THIS EXISTS RATHER THAN REUSING THE STAFF ONE ──────────────────────
 * The twin in app/field/actions.js authenticates against `users`. A polling
 * unit coordinator is not a row in `users` — it has its own table and its own
 * session, exactly as `fileAgentResult` above does — so the staff action sees
 * no signed-in user, and the version of it that redirected sent a coordinator
 * who was perfectly signed in to a login page, losing the photograph and
 * everything already typed. This is the same job, asked of the right session.
 *
 * Like `fileAgentResult`, it returns rather than redirects. A form post that
 * redirects to a sign-in page throws away what somebody typed standing at a
 * booth, and that is never the right answer to any failure here.
 */
export async function readAgentSheetPhoto(_previous, formData) {
  const failed = (reason) => ({ ok: false, reason });

  const person = await currentCoordinator();
  if (!person) return failed("You have been signed out. Sign in again to read a sheet.");
  if (!person.canFile) return failed("This account has not been approved yet.");

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

  /* What it is, not what it says it is. The type the browser sends is a claim,
     and this one travels to Data Bank as the label on an exhibit — so it is read
     off the bytes here the same way the sign-up photograph is. */
  const sheetMime = sniffImage(bytes);
  if (!sheetMime) {
    return failed("That file is not a photograph this system can read. A picture from your phone's camera will work.");
  }

  const project = await agentElection(person.unitCode);
  if (!project) {
    return failed("No election project is running, so a reading has nowhere to be saved.");
  }

  const race = String(formData.get("race") ?? "").toUpperCase();

  /* Where the agent stood when they took the photograph. Corroboration only,
     and absent rather than guessed when the phone did not share it. */
  const lat = Number(formData.get("lat"));
  const lon = Number(formData.get("lon"));
  const position =
    formData.get("lat") && Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon, accuracy: Number(formData.get("accuracy")) || null }
      : null;

  const read = await readSheet(bytes);
  if (!read.ok) return failed(read.reason ?? "That picture could not be read.");

  const parsed = read.parsed;

  /* See `trustworthy` in lib/sheet-vision.js for what earns this. */
  const trusted = trustworthy(read);

  /* The booth is the account's, never the sheet's. */
  const id = await sheetReads.record({
    electionId: project.id,
    userId: person.id,
    unitCode: person.unitCode ?? parsed.unitCode ?? null,
    parsed,
    rawText: read.text ?? null,
    confidence: read.confidence ?? null,
    reader: read.reader ?? null,
    race: isRace(race) ? race : null,
    source: "APP",
  });

  /* ══════════════════════════════════════════════════════════════════════
     THE PICTURE AND THE READING, AS TWO ITEMS

     ── WHY TWO AND NOT ONE ──────────────────────────────────────────────
     They are different kinds of evidence with different lifetimes. The
     photograph is what the officer wrote and does not change; the reading is
     a machine's opinion of it, and a second reader, a better model or a human
     correction produces another one tomorrow. Sent as one item they could
     never be told apart afterwards, and "which reading is this" is the first
     question anybody asks of a disputed figure.

     So the sheet goes as RESULT_SHEET carrying the image, and the reading
     goes as RESULT_FIGURES carrying the same hash. Data Bank pairs them on
     that hash — see lib/taxonomy.js there, where the image is routed to
     Agent360 for custody and the figures to Poll360.

     ── AND THE READING TRAVELS WITH ITS PROVENANCE ──────────────────────
     Which reader, how confident, what it could not make out. A figure read
     off a photograph and a figure typed by a person are not the same claim,
     and eighteen months later the difference is the whole argument. */
  const hash = createHash("sha256").update(bytes).digest("hex");
  const unitCode = person.unitCode ?? parsed.unitCode ?? null;

  forwardToDataBank({
    kind: KIND.RESULT_SHEET,
    externalId: `poll360:sheet:${hash}`,
    sender: person.phone ?? null,
    mime: sheetMime,
    mediaHashes: [hash],
    payload: {
      unitCode,
      stateCode: unitCode?.slice(0, 2) ?? null,
      race: isRace(race) ? race : null,
      electionId: project.id,
      /* The photograph itself. This is the one item this product sends that
         carries bytes, because a hash without the image it names proves
         nothing to a tribunal. */
      image: bytes.toString("base64"),
      bytes: bytes.length,
      /* The place in words — state, local government, ward, unit — so Data
         Bank's Sheets board can group the photograph where it belongs. */
      place: unitCode ? placeOf(unitCode) : null,
      unitName: (unitCode ? placeOf(unitCode)?.unitName : null) ?? (await units.at(unitCode).catch(() => null))?.name ?? null,
      /* ── ITS CUSTODY: WHO, WHERE, WHEN ─────────────────────────────────
         Evidence is a photograph plus the person who took it, where they
         were standing and the moment they took it. Data Bank's Sheets board
         shows all three beside the picture. */
      position,
      capturedBy: { name: person.name, coordinatorId: person.id },
      capturedAt: new Date().toISOString(),
    },
  });

  forwardToDataBank({
    kind: KIND.RESULT_FIGURES,
    externalId: `poll360:read:${id}`,
    sender: person.phone ?? null,
    mediaHashes: [hash],
    payload: {
      unitCode,
      stateCode: unitCode?.slice(0, 2) ?? null,
      race: isRace(race) ? race : null,
      electionId: project.id,
      figures: parsed,
      /* The same reading laid onto this ballot and keyed by party, so the hub
         does not need to know the reader's scanning order to find a figure. */
      ballot: isRace(race) ? figuresForBallot(parsed, race) : null,
      position,
      capturedBy: { name: person.name, coordinatorId: person.id },
      /* Read by a machine, and said so. Nothing downstream may weigh this the
         way it weighs a figure a person typed off the sheet in their hand. */
      readBy: "MACHINE",
      reader: read.reader ?? null,
      confidence: read.confidence ?? null,
      legibility: read.legibility ?? null,
      unreadable: read.unreadable ?? [],
      trusted,
      usable: parsed.usable,
      problems: parsed.problems ?? [],
      readAt: new Date().toISOString(),
    },
  });

  return {
    ok: true,
    readId: id,
    reader: read.reader ?? null,
    confidence: read.confidence ?? null,
    legibility: read.legibility ?? null,
    unreadable: read.unreadable ?? [],
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

/**
 * Hold the photograph against the figures.
 *
 * A twin of `checkAgainstSheet` in app/field/actions.js. It returns rather
 * than throws on every failure path: a reader that is not configured, an image
 * that will not decode, a page of text that makes no sense — none of them may
 * take a filing down with them, and none of them is a mismatch.
 */
async function checkSheet(file, typed, shown = {}) {
  const empty = { blocked: false, record: null, match: null, message: null };

  /* The reading the coordinator was shown, if the form read on attach. Its id
     comes from the browser and is checked rather than trusted: it has to
     exist, belong to this account, and belong to this project. Anything else
     falls through to reading the photograph, which is what used to happen
     always. Same rule as the staff twin, for the same reason. */
  if (shown.readId) {
    const stored = await sheetReads.get(shown.readId);
    if (
      stored?.parsed &&
      stored.userId &&
      stored.userId === shown.userId &&
      (!shown.electionId || stored.electionId === shown.electionId)
    ) {
      const match = matchSheet(stored.parsed, typed);
      await sheetReads.accept(shown.readId, typed);
      if (match.comparable && !match.agrees) {
        return {
          blocked: true,
          match,
          record: matchRecord(match),
          message: mismatchMessage(match, { channel: "web" }),
          parsed: stored.parsed,
        };
      }
      return { blocked: false, match, record: matchRecord(match), message: null, parsed: stored.parsed };
    }
  }

  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) return empty;
  if (!visionAvailable()) {
    return { ...empty, record: matchRecord({ comparable: false, agrees: false, mismatches: [], checked: [], reason: "no reader configured" }) };
  }

  let parsed = null;
  try {
    if (file.size > 6_000_000) throw new Error("too large");
    const bytes = Buffer.from(await file.arrayBuffer());
    const read = await readSheet(bytes);
    if (read.ok) parsed = read.parsed;
  } catch {
    parsed = null;
  }

  const match = matchSheet(parsed, typed);

  if (match.comparable && !match.agrees) {
    return {
      blocked: true,
      match,
      record: matchRecord(match),
      message: mismatchMessage(match, { channel: "web" }),
      parsed,
    };
  }

  return { blocked: false, match, record: matchRecord(match), message: null, parsed };
}
