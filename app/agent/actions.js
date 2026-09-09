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
import { hashPassword, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/ratelimit";
import { isNigerianMobile, normalisePhone } from "@/lib/phone";
import { boothFromForm } from "@/lib/booth";
import { parseUnitCode } from "@/lib/units";
import { sniffImage } from "@/lib/image-bytes";
import { accountForCode } from "@/lib/agent-login";
import { audit, media, results, units, sheetReads } from "@/lib/db";
/* Everything this product takes in is also delivered to the hub that seals and
   chains it for the eighteen months between a polling day and a tribunal.
   Never awaited on a user's path — see lib/dumpsite.js. */
import { KIND, forwardToDumpSite } from "@/lib/dumpsite";
import { currentElection } from "@/lib/election-scope";
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Length is the only rule. A composition rule ("one capital, one symbol")
   reliably produces Password1! and the feeling of having asked for something. */
const MIN_PASSWORD = 10;

async function whereFrom() {
  const list = await headers();
  return {
    ip: (list.get("x-forwarded-for")?.split(",")[0] ?? "local").trim(),
    userAgent: list.get("user-agent") ?? undefined,
  };
}

/* ── signing up ───────────────────────────────────────────────────────────── */

export async function joinAsAgent(_previous, formData) {
  const { ip, userAgent } = await whereFrom();

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
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  /* Where they say they are, in the four parts the form asks for. */
  const booth = boothFromForm(formData);

  /* Optional, and stored exactly as written. These are the agent's words for
     their own ward and booth, not a lookup: nobody here holds INEC's ward or
     unit names, and a name we could not check is worth having only as long as
     it is never mistaken for one we could. */
  const wardName = String(formData.get("wardName") ?? "").trim().slice(0, 80);
  const unitName = String(formData.get("unitName") ?? "").trim().slice(0, 80);

  /* `normalisePhone` puts a number into one shape; it does not judge whether
     it is one. A Nigerian mobile is 234 and ten digits, and anything that does
     not come out that length is a typo rather than a phone — left unchecked,
     "0803" sits in the queue as a contact nobody can ring. */
  const cleaned = rawPhone ? normalisePhone(rawPhone) : null;
  /* The rule itself is in lib/phone.js, so the two sign-up paths and every
     script that takes a number agree on what one is. */
  const phone = isNigerianMobile(cleaned) ? cleaned : null;

  const values = {
    name,
    email,
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
  if (!phone && !email) errors.phone = "A phone number or an email address is needed to sign in.";
  if (rawPhone && !phone) errors.phone = "That does not look like a Nigerian phone number.";
  if (email && !EMAIL.test(email)) errors.email = "That does not look like an email address.";
  if (password.length < MIN_PASSWORD) {
    errors.password = `Choose a password of at least ${MIN_PASSWORD} characters. Length is what makes it hard to guess.`;
  }

  /* ── THE PHOTOGRAPH, CHECKED BEFORE ANYTHING IS WRITTEN ─────────────────
     Required, because Agent360's whole question is whether somebody was
     actually standing at a booth and the answer to it starts with a face —
     and because a name and a booth code can be typed by anybody, while a
     photograph is the thing a ward coordinator either recognises or does not.

     Checked here rather than after the account exists, so a camera file this
     server cannot read is a sentence on the form somebody can act on rather
     than an account that quietly has no picture. Registration is not
     time-critical the way filing a return at nine at night is; an agent can
     take another photograph.

     What the browser calls the file is a claim; the first four bytes are a
     fact. The browser has already downscaled it — see components/agent/
     PhotoField.jsx — so anything still over the ceiling did not come through
     that path. */
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

  /* ── AN ACCOUNT THAT EXISTS IS NOT A SIGN-UP ────────────────────────────
     Said plainly rather than answered with a generic failure. This is not a
     sign-in form, the address is not a secret worth protecting here, and the
     alternative is somebody signing up four times, wondering why nothing
     happens, and ringing the desk on polling morning. */
  if (email && (await coordinators.byEmail(email))) {
    return { errors: { email: "An account already uses that email. Sign in instead." }, values };
  }
  if (phone && (await coordinators.byPhone(phone))) {
    return { errors: { phone: "An account already uses that number. Sign in instead." }, values };
  }

  const person = await coordinators.signUp({
    name,
    email: email || null,
    phone,
    passwordHash: await hashPassword(password),
    /* The booth they say they are at. A claim until an administrator agrees
       with it, which is what the queue is for — and the approval screen can
       still correct it, because a booth chosen from a list is a great deal
       harder to get wrong than nine digits copied off a form in the dark, and
       nowhere near impossible. */
    unitCode: booth.code,
    wardName: wardName || null,
    unitName: unitName || null,
  });

  /* Stored against the account, in the same table as the incident
     photographs — see `attachToCoordinator` in lib/db.js. The pointer goes on
     the coordinator so a screen showing an agent does not have to search. */
  const stored = await media.attachToCoordinator({
    coordinatorId: person.id,
    mime: photoMime,
    bytes: photoBytes,
  });
  await coordinators.attachPhoto(person.id, stored.id);

  /* ── THE CODE, CUT ONCE ─────────────────────────────────────────────────
     The one moment this code exists anywhere. It is returned to the page that
     shows it to the agent and is written nowhere else — not to the audit
     trail, not to a log, not into the row, which holds only its hash. See
     lib/agent-code.js for why it is not simply their polling unit. */
  const agentCode = await coordinators.issueCode(person.id, { hash: hashPassword });

  /* Signed in immediately, on purpose. There is nothing to protect — the
     account can read nothing and file nothing — and the alternative is telling
     somebody their application went somewhere they cannot see. */
  await createCoordinatorSession(person.id, { userAgent });

  /* Written to the same audit trail as everything else. The trail is about
     what happened to the count, not about which table the actor sat in, and
     splitting it would leave the one question worth asking at 2am — who did
     this — with two places to look. */
  await audit.record({
    actorId: null,
    actorName: person.name,
    action: "coordinator:signed-up",
    subject: person.unitCode,
    meta: { id: person.id },
    ip,
  });

  /* ── AND ON TO THE HUB ──────────────────────────────────────────────────
     A registration belongs to Agent360 — whether somebody was actually
     standing at a booth is its question, not this product's — and it reaches
     it through DumpSite, which seals and chains it on receipt. See
     lib/dumpsite.js for why this is never awaited: an agent signing up must
     not fail because a hub is having a bad night, and their account is
     already committed here.

     Identity travels on this one, unlike almost everything else this product
     sends anywhere. That is the point of a registration: Agent360 cannot
     confirm a person was at a booth without knowing which person. DumpSite
     seals it at rest under a per-item key and logs every opening. */
  /* The ward and local government the booth sits in, read back off the code
     rather than off the form — the form's boxes are optional and a typed code
     is allowed to be the whole answer, so this is the one field that is
     present however somebody filled it in. */
  const place = parseUnitCode(person.unitCode);

  forwardToDumpSite({
    kind: KIND.REGISTRATION,
    externalId: `poll360:coordinator:${person.id}`,
    sender: person.phone ?? person.email ?? null,
    mime: photoMime,
    mediaHashes: [stored.hash],
    /* ── THE NAMES ARE THE HUB'S, NOT OURS ─────────────────────────────────
       Every key below is read by name in DumpSite's registration handler, and
       from there by Agent360, which owns the register. A key spelled our way
       instead of theirs does not fail: it is simply never read, so the field
       is sealed as null and an agent arrives on the register with no name and
       no booth. That is invisible at this end — the post returns 200 — which
       is why these are spelled to match the reader and not the sender. */
    payload: {
      /* `POLLING_AGENT`, which is the hub's own default and the word Agent360
         maps to an agent account. An unrecognised role is refused there rather
         than defaulted, so this is not a cosmetic difference. */
      role: "POLLING_AGENT",
      fullName: person.name,
      /* The photograph itself, not a reference to it. Agent360 pairs a
         presence claim with a face, and a hash it cannot resolve to an image
         proves nothing to anybody. */
      photo: photoBytes.toString("base64"),
      photoMime,
      photoHash: stored.hash,
      phone: person.phone ?? null,
      email: person.email ?? null,
      /* Both spellings of the booth. `pollingUnitCode` is what the hub reads;
         `unitCode` is what this product calls it everywhere else, and it costs
         nothing to keep for anybody reading a stored payload later. */
      pollingUnitCode: person.unitCode,
      unitCode: person.unitCode,
      wardCode: place?.wardCode ?? null,
      lgaCode: place?.lgaCode ?? null,
      stateCode: person.unitCode?.slice(0, 2) ?? null,
      wardName: person.wardName ?? null,
      unitName: person.unitName ?? null,
      /* Pending until an administrator agrees with the booth they claimed.
         Sent as the claim it is rather than as a fact. */
      status: person.status ?? "PENDING",
      registeredAt: new Date().toISOString(),
    },
  });

  /* ── SHOWN, NOT REDIRECTED PAST ─────────────────────────────────────────
     The code goes on the query string of the holding page rather than into a
     session or a cookie, for one reason: it is the only copy, this is the only
     moment, and a redirect that lost it would leave an agent registered and
     unable to sign in anywhere. It leaves the URL the moment they leave that
     page, and it is useless to anybody who did not also register. */
  redirect(agentCode ? `/agent/pending?code=${encodeURIComponent(agentCode)}` : "/agent/pending");
}

/* ── signing in ───────────────────────────────────────────────────────────── */

/**
 * Sign in with the code, rather than with a phone and a password.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS BESIDE THE PASSWORD PATH
 *
 *  An agent at a booth has one hand free, a cheap handset, and a queue in
 *  front of them. A password chosen three weeks ago at a training session is
 *  the thing they have forgotten; the code on the card in their pocket is the
 *  thing they have. It is also the only credential that works over WhatsApp,
 *  where there is no form to put an email address into.
 *
 *  ── AND WHY THE SEARCH IS NARROWED BY THE BOOTH ─────────────────────────
 *  The code is hashed with a per-row salt, so there is nothing to look it up
 *  by. Verifying against every account in the country would be forty thousand
 *  slow hashes for every attempt, which is a denial of service anybody could
 *  trigger from a phone.
 *
 *  So the booth inside the code narrows it to the people at one polling unit.
 *  That is arithmetic, not authorisation: the booth half is printed on every
 *  result sheet and published in this repository, and anybody can write it.
 *  The secret half still has to match a stored hash, and a wrong booth simply
 *  finds nobody to check against.
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

  /* One message whatever went wrong. A code that is not a code and a code that
     belongs to nobody get the same answer, or the form becomes an oracle
     telling somebody which booths have agents on them. */
  const REFUSED_CODE = "That code did not match an account. Check it and try again.";

  const person = await accountForCode(formData.get("code"));
  if (!person) return { error: REFUSED_CODE };

  await createCoordinatorSession(person.id, { userAgent });
  await coordinators.markSignedIn(person.id);

  await audit.record({
    actorId: null,
    actorName: person.name,
    action: "coordinator:signed-in",
    subject: person.unitCode,
    meta: { by: "code" },
    ip,
  });

  redirect(person.canFile ? "/agent" : "/agent/pending");
}


/**
 * ── ONE MESSAGE, WHATEVER WENT WRONG ───────────────────────────────────────
 * A form that says "no account with that number" tells whoever is guessing
 * which half of the pair to keep. It is the same rule app/actions/auth.js
 * follows, and it matters more here: a coordinator's identifier is a phone
 * number, and phone numbers are guessable in a way email addresses are not.
 */
const REFUSED =
  "That did not match an account. Check the number or email and the password, and try again.";

/**
 * A hash of the right shape and cost to compare against when no account was
 * found. Built once as the module loads rather than written in as a literal,
 * so it tracks whatever cost lib/password.js currently uses instead of
 * quietly becoming cheaper than a real one as those parameters are raised.
 *
 * Declared above its use on purpose: a `let` referenced before its
 * initialiser is a temporal-dead-zone error waiting for the first person who
 * moves this code.
 */
const DUMMY_HASH = await hashPassword(
  `no-such-account-${Math.random().toString(36).slice(2)}`
);

export async function signInAgent(_previous, formData) {
  const { ip, userAgent } = await whereFrom();

  /* Ten attempts an hour per address. Enough for somebody fumbling a password
     on a phone keypad in the dark, not enough to work through a list. */
  const limit = rateLimit(`agent-signin:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return { error: "Too many attempts from this connection. Wait a few minutes and try again." };
  }

  const contact = String(formData.get("contact") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!contact || !password) return { error: REFUSED };

  /* An identifier with an @ is an email; anything else is treated as a phone
     and normalised the same way the sign-up normalised it, so "0803 123 4567"
     and "+2348031234567" reach the same row. */
  const person = contact.includes("@")
    ? await coordinators.byEmail(contact)
    : await coordinators.byPhone(normalisePhone(contact));

  /* ── THE HASH IS VERIFIED EVEN WHEN THERE IS NO ACCOUNT ─────────────────
     Against a dummy of the same shape and cost. Without it, a missing account
     returns in a millisecond and a wrong password takes a hundred, and the
     difference is a reliable way to ask this endpoint whether a phone number
     is registered — which for this product is asking whether a named person
     is an agent, and that is exactly the kind of question the incident log is
     encrypted to prevent being answerable. */
  const stored = person ? await coordinators.secretFor(person.id) : null;
  const ok = await verifyPassword(password, stored ?? DUMMY_HASH);

  if (!person || !ok) return { error: REFUSED };

  if (person.status === "DECLINED" || person.status === "SUSPENDED") {
    /* Told plainly. Somebody who was turned down or switched off needs to know
       that is what happened, or they will keep trying and then ring the desk
       on the busiest morning of the year. */
    return {
      error:
        "This account is not active. Speak to the coordinator who appointed you — they can tell you why and put it right.",
    };
  }

  await createCoordinatorSession(person.id, { userAgent });
  await coordinators.markSignedIn(person.id);
  await sweepExpiredCoordinatorSessions();

  /* Pending accounts sign in and land on the page that says where they stand,
     rather than on a filing screen they cannot use. */
  redirect(person.canFile ? "/agent" : "/agent/pending");
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
  redirect("/agent/login");
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
  const project = (await currentElection()) ?? (await elections.active());
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
     when it was read, and DumpSite pairs the two on the hash rather than
     holding a second copy of a six-megabyte photograph.

     After the return is committed and after the audit line, never before. A
     hub that is unreachable must cost this product nothing at all — see
     lib/dumpsite.js. */
  forwardToDumpSite({
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
      filedBy: { name: person.name, coordinatorId: person.id },
      filedAt: new Date().toISOString(),
    },
  });

  revalidatePath("/agent");
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
     and this one travels to DumpSite as the label on an exhibit — so it is read
     off the bytes here the same way the sign-up photograph is. */
  const sheetMime = sniffImage(bytes);
  if (!sheetMime) {
    return failed("That file is not a photograph this system can read. A picture from your phone's camera will work.");
  }

  const project = await currentElection();
  if (!project) {
    return failed("No election project is running, so a reading has nowhere to be saved.");
  }

  const race = String(formData.get("race") ?? "").toUpperCase();
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
     goes as RESULT_FIGURES carrying the same hash. DumpSite pairs them on
     that hash — see lib/taxonomy.js there, where the image is routed to
     Agent360 for custody and the figures to Poll360.

     ── AND THE READING TRAVELS WITH ITS PROVENANCE ──────────────────────
     Which reader, how confident, what it could not make out. A figure read
     off a photograph and a figure typed by a person are not the same claim,
     and eighteen months later the difference is the whole argument. */
  const hash = createHash("sha256").update(bytes).digest("hex");
  const unitCode = person.unitCode ?? parsed.unitCode ?? null;

  forwardToDumpSite({
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
      capturedBy: { name: person.name, coordinatorId: person.id },
      capturedAt: new Date().toISOString(),
    },
  });

  forwardToDumpSite({
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
        };
      }
      return { blocked: false, match, record: matchRecord(match), message: null };
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
    };
  }

  return { blocked: false, match, record: matchRecord(match), message: null };
}
