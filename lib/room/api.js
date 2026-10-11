import { NextResponse } from "next/server";

import { roomActor } from "./access.js";

/**
 * The room's API routes, in one shape.
 *
 * Each route is the same function the screens call, reached over HTTP. So
 * every answer is JSON, every refusal carries a status and a sentence, and
 * no route redirects: a client that asked for JSON and was sent a sign-in
 * page has been told nothing.
 */
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** Turn `{ ok, error, status, code }` from lib/room/act.js into a response. */
export function answer(out) {
  if (out?.ok) return json(out);
  return json({ error: out?.error ?? "That could not be done.", code: out?.code }, out?.status ?? 400);
}

/**
 * Run a handler for a signed-in account that holds a capability.
 * 401 for nobody, 403 for somebody who may not, and a plain 503 if the
 * handler throws, which is never dressed up as a permission error.
 */
export async function withActor(capability, handler) {
  const ctx = await roomActor();
  if (!ctx) return json({ error: "Sign in to use this." }, 401);
  if (capability && !ctx.holds(capability)) return json({ error: "Your account cannot do that.", code: "FORBIDDEN" }, 403);
  try {
    return await handler(ctx);
  } catch (error) {
    console.error("room api:", error?.message ?? error);
    return json({ error: "Poll360 could not reach its data just now. Nothing was changed. Try again." }, 503);
  }
}

export async function body(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}
