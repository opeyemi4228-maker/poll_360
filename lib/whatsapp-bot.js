import { whatsapp, results, users } from "./db.js";
import { parties } from "./election2023.js";
import { screenReturn } from "./anomalies.js";
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
export function handleInbound({ phone, name = null, waId = null, text = "", kind = "text", mediaId = null }) {
  const contact = whatsapp.contactFor(phone, name);

  if (contact.status === "BLOCKED") {
    /* Recorded, never answered. A blocked number that gets a reply learns it
       is blocked, and then simply uses another number. */
    whatsapp.record({ waId, contactId: contact.id, direction: "IN", kind, body: text, mediaId, step: "BLOCKED" });
    return { contact, reply: null, step: "BLOCKED" };
  }

  const session = whatsapp.session(contact.id);
  const step = session?.step ?? STEPS.IDLE;

  whatsapp.record({ waId, contactId: contact.id, direction: "IN", kind, body: text, mediaId, step });

  const outcome = advance({ contact, session, step, text, kind, mediaId });

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

function advance({ contact, session, step, text, kind, mediaId }) {
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

  switch (step) {
    case STEPS.UNIT: {
      const code = String(text ?? "").trim().toUpperCase();
      if (code.length < 4) {
        return { step, reply: "That does not look like a polling unit code. Send it exactly as it is printed on the sheet." };
      }
      whatsapp.saveSession(contact.id, STEPS.ACCREDITED, { ...draft, unitCode: code });
      return { step: STEPS.ACCREDITED, reply: `Polling unit ${code}.\n\nHow many voters were accredited? Send the number only.` };
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
        whatsapp.saveSession(contact.id, STEPS.CONFIRM, { ...draft, mediaId });
        return { step: STEPS.CONFIRM, reply: `Sheet received.\n\n${summarise(draft)}\n\nIs that correct? Send YES to file it, or CANCEL to start again.` };
      }
      if (said === "SKIP") {
        whatsapp.saveSession(contact.id, STEPS.CONFIRM, draft);
        return { step: STEPS.CONFIRM, reply: `Filing without a sheet.\n\n${summarise(draft)}\n\nIs that correct? Send YES to file it, or CANCEL to start again.` };
      }
      return { step, reply: "Send the photograph of the result sheet, or send SKIP if you cannot." };
    }

    case STEPS.CONFIRM: {
      if (said !== "YES" && said !== "Y" && said !== "CONFIRM") {
        return { step, reply: "Send YES to file these figures, or CANCEL to start again." };
      }
      return commit(contact, draft);
    }

    default:
      return { step: STEPS.IDLE, reply: HELP };
  }
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

  const votes = draft.votes ?? [];
  const registered = draft.registered ?? draft.accredited;

  const screening = screenReturn({
    unitCode: draft.unitCode,
    registered,
    accredited: draft.accredited,
    rejected: draft.rejected,
    votes,
  });

  results.file({
    unitCode: draft.unitCode,
    stateCode: contact.stateCode ?? draft.unitCode.slice(0, 2),
    registered,
    accredited: draft.accredited,
    rejected: draft.rejected,
    votes,
    note: "Filed over WhatsApp",
    submittedBy: contact.userId,
  });

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
