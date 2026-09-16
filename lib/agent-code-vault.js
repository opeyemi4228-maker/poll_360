import { cookies } from "next/headers";

import { seal, unseal } from "./crypto.js";

/**
 * The agent's code, kept on the agent's own phone.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS, AND WHY IT IS NOT A COLUMN
 *
 *  Data Bank's agent doors — the updates timeline and the situation report —
 *  will not take a claim about a polling unit unless it carries the code of an
 *  approved agent. That rule is the reason those boards can be trusted: a key
 *  alone could mark the whole country as voting normally.
 *
 *  Poll360 holds no codes. Data Bank keeps only a digest of one, this product
 *  never stored the plaintext, and adding a column for it now would undo the
 *  single best property of the design.
 *
 *  So the code stays where it already is: on the phone of the person it was
 *  given to. They type it once at sign-in, it is sealed with this deployment's
 *  own key, and the sealed value rides in a cookie beside the session for
 *  exactly as long as that session lasts. The server can open it for the few
 *  seconds it takes to file an update; the database never holds it; and a
 *  copied cookie is useless to anybody without this deployment's key.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A missing or unreadable value is never an error. It means the agent signed
 * in before this existed, or the key was rotated — their updates are saved by
 * Poll360 exactly as before and simply are not relayed until they sign in
 * again, which is the right way round for something nobody should notice.
 */

const COOKIE = "poll360_agent_code";
/* The same thirty days as the session in lib/coordinator-session.js: a code
   that outlived its session would be a credential with nothing to spend it
   on, and one that expired first would silently stop the relay. */
const TTL_DAYS = 30;

export async function rememberAgentCode(code) {
  if (!code) return;
  const jar = await cookies();
  jar.set(COOKIE, seal(String(code)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000),
  });
}

/** The signed-in agent's code, or null. */
export async function currentAgentCode() {
  const jar = await cookies();
  const sealed = jar.get(COOKIE)?.value;
  if (!sealed) return null;
  try {
    return unseal(sealed) || null;
  } catch {
    /* A rotated key, or a cookie from another deployment. Not an error. */
    return null;
  }
}

export async function forgetAgentCode() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
