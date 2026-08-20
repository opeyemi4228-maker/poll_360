import { whatsapp, results, units, positions, sheetReads } from "./db.js";
import { parties } from "./election2023.js";
import { screenReturn } from "./anomalies.js";
import { parseUnitCode } from "./units.js";
import { parseSheet, readImage, visionAvailable } from "./sheet-vision.js";
import { STEPS } from "./whatsapp-steps.js";

export { STEPS, STEP_LABEL } from "./whatsapp-steps.js";

/**
 * The Poll360 WhatsApp bot.
 *
 * ── WHY WHATSAPP AT ALL ────────────────────────────────────────────────────
 * An agent at a polling unit in Zamfara has a phone, a WhatsApp account and
 * about two bars of signal. Asking them to install an app, create an account
 * and keep a browser session alive for eleven hours is asking most of them to
 * fail. They already know how to send a message and a photograph. So the
 * product meets them there, and the dashboard is where the room reads it.
 *
 * ── IT IS A FORM, NOT A CHATBOT ────────────────────────────────────────────
 * This asks one question at a time and refuses to move on until the answer is
 * valid. That is deliberately unglamorous. A free-text assistant that guesses
 * what somebody meant by "about 200 I think" is a system that files a number
 * nobody said, and the whole product exists to make figures checkable.
 *
 * ── AN UNVERIFIED NUMBER CANNOT FILE ───────────────────────────────────────
 * Anybody can send a WhatsApp message to a published number. So a number that
 * has not been tied to a real account by an operator can talk to the bot, and
 * its answers are held as a draft that a human has to claim. Nothing reaches
 * the results table from a stranger.
 * ───────────────────────────────────────────────────────────────────────────
 */


const HELP = [
  "Poll360.",
  "",
  "Send RESULT to file the figures from your polling unit.",
  "Send PHOTO to add a picture of the result sheet.",
  "Send STATUS to see what has been filed from your unit.",
  "Send CANCEL at any point to stop and start again.",
  "",
  "Somebody on the desk reads everything sent here.",
].join("\n");

const digits = (text) => {
  const cleaned = String(text ?? "").replace(/[, ]/g, "").trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
};

const command = (text) => String(text ?? "").trim().toUpperCase();

/**
 * One inbound message in, one reply out.
 *
 * Everything is written down before a reply is composed, so a crash between
 * the two loses the reply and never the message. A missing reply is a person
 * repeating themselves; a missing message is a lost result.
 */
export async function handleInbound({
  phone,
  name = null,
  waId = null,
  text = "",
  kind = "text",
  mediaId = null,
  imageBytes = null,
  location = null,
}) {
  const contact = whatsapp.contactFor(phone, name);

  if (contact.status === "BLOCKED") {
    /* Recorded, never answered. A blocked number that gets a reply learns it
       is blocked, and then simply uses another number. */
    whatsapp.record({ waId, contactId: contact.id, direction: "IN", kind, body: text, mediaId, step: "BLOCKED" });
    return { contact, reply: null, step: "BLOCKED" };
  }

  const session = whatsapp.session(contact.id);
  const step = session?.step ?? STEPS.IDLE;

  whatsapp.record({
    waId,
    contactId: contact.id,
    direction: "IN",
    kind,
    body: location ? describePlace(location) : text,
    mediaId,
    step,
  });

  /* A position is not a step in the conversation. It arrives whenever the
     coordinator sends it, including in the middle of filing, and it must not
     disturb where they had got to. So it is banked and answered on its own,
     and the return carries on exactly where it was. */
  if (location) {
    const outcome = recordPlace(contact, location);
    whatsapp.record({ contactId: contact.id, direction: "OUT", body: outcome.reply, step, status: "QUEUED" });
    return { contact, ...outcome, step };
  }

  const outcome = await advance({ contact, session, step, text, kind, mediaId, imageBytes });

  if (outcome.reply) {
    whatsapp.record({
      contactId: contact.id,
      direction: "OUT",
      body: outcome.reply,
      step: outcome.step,
      status: "QUEUED",
    });
  }

  return { contact, ...outcome };
}

async function advance({ contact, session, step, text, kind, mediaId, imageBytes }) {
  const draft = session?.draft ?? {};
  const said = command(text);

  /* Commands that work from anywhere, checked before the step machine, so
     CANCEL always cancels even halfway through a list of party figures. */
  if (said === "CANCEL" || said === "STOP") {
    whatsapp.endSession(contact.id);
    return { step: STEPS.IDLE, reply: "Stopped. Nothing was filed. Send RESULT when you are ready to start again." };
  }

  if (said === "HELP" || said === "MENU" || said === "HI" || said === "HELLO") {
    return { step, reply: HELP };
  }

  if (said === "STATUS") {
    return { step, reply: statusFor(contact) };
  }

  if (said === "RESULT" || said === "START") {
    if (contact.unitCode) {
      whatsapp.saveSession(contact.id, STEPS.ACCREDITED, { unitCode: contact.unitCode });
      return {
        step: STEPS.ACCREDITED,
        reply: `Filing for polling unit ${contact.unitCode}.\n\nHow many voters were accredited? Send the number only.`,
      };
    }
    whatsapp.saveSession(contact.id, STEPS.UNIT, {});
    return { step: STEPS.UNIT, reply: "What is your polling unit code? It is printed at the top of the result sheet." };
  }

  if (said === "PHOTO") {
    whatsapp.saveSession(contact.id, STEPS.PHOTO, draft);
    return { step: STEPS.PHOTO, reply: "Send the photograph of the result sheet now." };
  }

  /**
   * A photograph sent out of the blue.
   *
   * ── THE FASTEST PATH THROUGH THE WHOLE PRODUCT ─────────────────────────
   * An agent who simply photographs the sheet has done the entire return in
   * one action. The reader proposes every figure, the agent says yes, and
   * eleven numbers typed in the dark become one confirmation. When the
   * reading does not hold together the bot falls back to asking, so this is
   * a shortcut that can never become a wrong answer.
   */
  if (kind === "image" && mediaId && (step === STEPS.IDLE || step === STEPS.UNIT)) {
    const read = await readSheetIfPossible({ contact, draft, mediaId, imageBytes });

    if (read?.parsed?.usable) {
      const parsed = read.parsed;
      const unitCode = parsed.unitCode ?? draft.unitCode ?? contact.unitCode;

      if (unitCode) {
        const filled = {
          ...draft,
          unitCode,
          registered: parsed.registered ?? undefined,
          accredited: parsed.accredited,
          rejected: parsed.rejected ?? 0,
          votes: [...parsed.votes, Math.max(0, parsed.accredited - (parsed.rejected ?? 0) - parsed.sum)],
          repName: parsed.repName ?? null,
          mediaId,
          readId: read.id,
          fromSheet: true,
        };
        whatsapp.saveSession(contact.id, STEPS.CONFIRM, filled);
        return {
          step: STEPS.CONFIRM,
          read,
          reply: `I read your result sheet.\n\n${summarise(filled)}${parsed.repName ? `\nPresiding officer: ${parsed.repName}` : ""}\n\nIs that right? Send YES to file it, NO to type the figures yourself, or CANCEL to stop.`,
        };
      }
    }

    /* Either there is no reader configured, or it could not make the figures
       add up. Either way the agent is asked, and told why. */
    whatsapp.saveSession(contact.id, STEPS.UNIT, { ...draft, mediaId, readId: read?.id ?? null });
    return {
      step: STEPS.UNIT,
      read,
      reply: `Thank you for the sheet.${read?.note ?? ""}\n\nI will take the figures from you instead. What is your polling unit code?`,
    };
  }

  switch (step) {
    case STEPS.UNIT: {
      const at = parseUnitCode(text);
      if (!at) {
        return {
          step,
          reply: "That does not look like a polling unit code. It is four parts, like 08-03-07-012, printed at the top of the sheet.",
        };
      }
      whatsapp.saveSession(contact.id, STEPS.ACCREDITED, { ...draft, unitCode: at.code });
      return {
        step: STEPS.ACCREDITED,
        reply: `Polling unit ${at.code}${at.stateName ? `, ${at.stateName}` : ""}.\n\nHow many voters were accredited? Send the number only.`,
      };
    }

    case STEPS.ACCREDITED: {
      const value = digits(text);
      if (value === null) return { step, reply: "Send the number of accredited voters, digits only. For example 412." };
      if (value > 3000) {
        return { step, reply: "That is higher than any polling unit register. Check the figure and send it again." };
      }
      whatsapp.saveSession(contact.id, STEPS.REJECTED, { ...draft, accredited: value });
      return { step: STEPS.REJECTED, reply: `${value} accredited.\n\nHow many ballots were rejected? Send 0 if none.` };
    }

    case STEPS.REJECTED: {
      const value = digits(text);
      if (value === null) return { step, reply: "Send the number of rejected ballots, digits only. Send 0 if there were none." };
      if (value > draft.accredited) {
        return { step, reply: `You cannot reject more ballots than the ${draft.accredited} voters accredited. Check and send it again.` };
      }
      whatsapp.saveSession(contact.id, STEPS.VOTES, { ...draft, rejected: value, votes: [] });
      return { step: STEPS.VOTES, reply: `${value} rejected.\n\nNow the votes. How many for ${parties[0].id}?` };
    }

    case STEPS.VOTES: {
      const value = digits(text);
      const votes = draft.votes ?? [];
      const index = votes.length;

      if (value === null) return { step, reply: `Send the number of votes for ${parties[index].id}, digits only.` };

      const next = [...votes, value];
      const valid = draft.accredited - draft.rejected;
      const running = next.reduce((sum, item) => sum + item, 0);

      if (running > valid) {
        /* Caught here rather than at the end, so the agent fixes the figure
           they are looking at instead of being told at the end that one of
           five numbers was wrong. */
        return {
          step,
          reply: `That brings the total to ${running}, but only ${valid} ballots can be counted at this unit, ${draft.accredited} accredited less ${draft.rejected} rejected. Check ${parties[index].id} and send it again.`,
        };
      }

      if (next.length < parties.length) {
        whatsapp.saveSession(contact.id, STEPS.VOTES, { ...draft, votes: next });
        return { step: STEPS.VOTES, reply: `How many for ${parties[next.length].id}?` };
      }

      /* Whatever is left over is everybody else, which is how the rest of the
         product carries it, so the two can never disagree. */
      const withOthers = [...next, Math.max(0, valid - running)];
      whatsapp.saveSession(contact.id, STEPS.PHOTO, { ...draft, votes: withOthers });
      return {
        step: STEPS.PHOTO,
        reply: `${summarise({ ...draft, votes: withOthers })}\n\nNow send a photograph of the result sheet. If you cannot, send SKIP.`,
      };
    }

    case STEPS.PHOTO: {
      if (kind === "image" && mediaId) {
        const read = await readSheetIfPossible({ contact, draft, mediaId, imageBytes });
        whatsapp.saveSession(contact.id, STEPS.CONFIRM, { ...draft, mediaId, readId: read?.id ?? null });
        return {
          step: STEPS.CONFIRM,
          read,
          reply: `Sheet received.\n\n${summarise(draft)}${read?.note ?? ""}\n\nIs that correct? Send YES to file it, or CANCEL to start again.`,
        };
      }
      if (said === "SKIP") {
        whatsapp.saveSession(contact.id, STEPS.CONFIRM, draft);
        return { step: STEPS.CONFIRM, reply: `Filing without a sheet.\n\n${summarise(draft)}\n\nIs that correct? Send YES to file it, or CANCEL to start again.` };
      }
      return { step, reply: "Send the photograph of the result sheet, or send SKIP if you cannot." };
    }

    case STEPS.CONFIRM: {
      if (said === "NO" || said === "N") {
        /* Rejecting a reading is not cancelling. The polling unit is still
           right, so only the figures are asked again. */
        whatsapp.saveSession(contact.id, STEPS.ACCREDITED, { unitCode: draft.unitCode, mediaId: draft.mediaId });
        return {
          step: STEPS.ACCREDITED,
          reply: "No problem, we will do it by hand. How many voters were accredited?",
        };
      }
      if (said !== "YES" && said !== "Y" && said !== "CONFIRM") {
        return { step, reply: "Send YES to file these figures, NO to type them yourself, or CANCEL to start again." };
      }
      return commit(contact, draft);
    }

    default:
      return { step: STEPS.IDLE, reply: HELP };
  }
}


/* ── the sheet reader ─────────────────────────────────────────────────────── */

/**
 * Read a photographed sheet, if there is anything to read it with.
 *
 * Always returns something rather than throwing. A reader that is not
 * configured, an image that will not download, a page of text that makes no
 * sense: all three end the same way, with the bot asking its questions, and
 * none of them may take the conversation down with them.
 */
async function readSheetIfPossible({ contact, draft, mediaId, imageBytes }) {
  if (!visionAvailable()) {
    return { note: "", parsed: null, id: null, reason: "no reader configured" };
  }

  const bytes = imageBytes ?? (await downloadMedia(mediaId));
  if (!bytes) {
    return { note: "\n\nI could not open the picture.", parsed: null, id: null, reason: "download failed" };
  }

  const read = await readImage(bytes);
  if (!read.ok) {
    return { note: "\n\nI could not read the picture.", parsed: null, id: null, reason: read.reason };
  }

  const parsed = parseSheet(read.text);
  const id = sheetReads.record({
    contactId: contact.id,
    unitCode: parsed.unitCode ?? draft.unitCode ?? contact.unitCode ?? null,
    mediaId,
    rawText: read.text,
    parsed,
    confidence: read.confidence,
  });

  return {
    id,
    parsed,
    confidence: read.confidence,
    /* The agent is told what went wrong in their own terms. "Could not
       reconcile the arithmetic" is not something to send to somebody standing
       in a schoolyard. */
    note: parsed.usable
      ? ""
      : `\n\nI could read some of the sheet but not all of it: ${parsed.problems[0] ?? "the figures did not add up"}.`,
  };
}

/**
 * Fetch the picture from Meta.
 *
 * Two calls, not one: the first exchanges the media id for a short-lived URL,
 * the second downloads it, and both need the access token. Meta expires that
 * URL in minutes, which is why the bytes are read now rather than a link
 * being stored for later.
 */
async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token || !mediaId) return null;

  try {
    const lookup = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!lookup.ok) return null;

    const { url } = await lookup.json();
    if (!url) return null;

    const file = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!file.ok) return null;

    return Buffer.from(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/* ── where the coordinator is ─────────────────────────────────────────────── */

function describePlace(location) {
  const at = `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
  return location.name ? `Sent a location: ${location.name} (${at})` : `Sent a location: ${at}`;
}

/**
 * Bank a position and say something useful back.
 *
 * ── WHY THE DISTANCE IS QUOTED, AND WHAT IT IS NOT ─────────────────────────
 * If we know where the unit is, the agent is told how far from it they appear
 * to be. That is a courtesy and a check in one: a coordinator who has walked
 * to the wrong school finds out immediately, from a number rather than from
 * an accusation. It corroborates a filing and never authorises one, because a
 * phone fix drifts and a booth genuinely does get moved across a compound.
 */
function recordPlace(contact, location) {
  const unitCode = contact.unitCode ?? null;
  const known = unitCode ? units.at(unitCode) : null;

  const distance =
    known?.lat != null && known?.lon != null
      ? metresBetween(location.latitude, location.longitude, known.lat, known.lon)
      : null;

  positions.record({
    contactId: contact.id,
    unitCode,
    lat: location.latitude,
    lon: location.longitude,
    accuracy: location.accuracy ?? null,
    label: location.name ?? location.address ?? null,
    distance,
  });

  /* The first fix from a unit we have never placed becomes that unit's
     position. Somebody standing at a booth is the best source we will ever
     have for where that booth is. */
  if (unitCode && known && known.lat == null) {
    units.register({ code: unitCode, lat: location.latitude, lon: location.longitude });
  }

  if (distance !== null && distance > 2000) {
    return {
      located: true,
      reply: `Location received. It puts you about ${Math.round(distance / 100) / 10} kilometres from where we have your polling unit. If that is wrong, tell the desk, and carry on either way.`,
    };
  }

  return {
    located: true,
    reply: unitCode
      ? `Location received. The desk can see you at unit ${unitCode}.`
      : "Location received. The desk can see you.",
  };
}

/** Great circle distance in metres. */
function metresBetween(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** The figures read back, so somebody confirms what they actually said. */
function summarise(draft) {
  const votes = draft.votes ?? [];
  const lines = parties.map((party, index) => `${party.id}: ${votes[index] ?? 0}`);
  if (votes.length > parties.length) lines.push(`Others: ${votes[parties.length]}`);
  return [
    `Unit ${draft.unitCode}`,
    `Accredited: ${draft.accredited}`,
    `Rejected: ${draft.rejected}`,
    ...lines,
  ].join("\n");
}

/**
 * Write the return, but only for a number an operator has tied to an account.
 *
 * A stranger's figures are kept as a draft on the desk instead. That is the
 * whole trust boundary of this channel: WhatsApp proves somebody controls a
 * phone, and nothing more, so it can never on its own put a number into the
 * count.
 */
function commit(contact, draft) {
  if (contact.status !== "VERIFIED" || !contact.userId) {
    whatsapp.saveSession(contact.id, STEPS.DONE, { ...draft, held: true });
    return {
      step: STEPS.DONE,
      held: true,
      reply: "Thank you. Your figures are with the desk and are waiting for an officer to confirm who you are before they are counted. You will get a message when that is done.",
    };
  }

  /* ── THE SHAPE OF A VOTE RECORD IS NOT OURS TO CHOOSE ───────────────────
     Returns are stored keyed by party, {"APC": 34, "PDP": 30, ...}, and 485
     of them already are. Filing an array here produced rows the rest of the
     product could not read: the same column held two shapes, and everything
     downstream had to guess which. The conversation collects figures in party
     order because that is the order it asks in; it converts before it writes. */
  const ordered = draft.votes ?? [];
  const votes = {};
  for (const [index, party] of parties.entries()) votes[party.id] = ordered[index] ?? 0;
  const spare = ordered[parties.length] ?? 0;
  if (spare > 0) votes.OTH = spare;

  const registered = draft.registered ?? draft.accredited;
  const at = parseUnitCode(draft.unitCode);

  /* The unit registers itself as its return arrives, which is what makes the
     ward, local government and state totals fill in behind it without anybody
     maintaining a list. */
  units.register({
    code: draft.unitCode,
    registered,
    repName: draft.repName ?? null,
    source: "WHATSAPP",
  });

  const screening = screenReturn({
    unitCode: draft.unitCode,
    registered,
    accredited: draft.accredited,
    rejected: draft.rejected,
    votes: ordered,
  });

  /* The newest position from this coordinator rides along with the return, so
     the filing carries a fix even though it arrived over a channel that has
     no idea what a GPS reading is. */
  const fix = positions.latestFor(contact.id);

  results.file({
    unitCode: draft.unitCode,
    stateCode: contact.stateCode ?? at?.stateCode ?? draft.unitCode.slice(0, 2),
    registered,
    accredited: draft.accredited,
    rejected: draft.rejected,
    votes,
    note: draft.fromSheet ? "Filed over WhatsApp, read from the sheet" : "Filed over WhatsApp",
    submittedBy: contact.userId,
    source: "WHATSAPP",
    repName: draft.repName ?? null,
    position: fix ? { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy, distance: fix.distance } : null,
  });

  /* What the reader proposed is marked accepted against what was filed, so the
     difference between machine and human stays on the record. */
  if (draft.readId) {
    sheetReads.accept(draft.readId, {
      accredited: draft.accredited,
      rejected: draft.rejected,
      votes: ordered,
    });
  }

  whatsapp.endSession(contact.id);

  const flagged = screening?.flags?.length ?? 0;
  return {
    step: STEPS.DONE,
    filed: true,
    flags: screening?.flags ?? [],
    reply: flagged
      ? `Filed for unit ${draft.unitCode}. The desk has been asked to look at it, so somebody may call you to check a figure. That is routine.`
      : `Filed for unit ${draft.unitCode}. Thank you.`,
  };
}

function statusFor(contact) {
  if (!contact.unitCode) {
    return "Your number is not yet tied to a polling unit. Send RESULT and the desk will match you up.";
  }
  const filed = results.forUnit(contact.unitCode);
  if (!filed) return `Nothing filed yet for unit ${contact.unitCode}. Send RESULT to file now.`;
  return `Unit ${contact.unitCode} was filed and is marked ${String(filed.status).toLowerCase()}.`;
}

export { HELP };
