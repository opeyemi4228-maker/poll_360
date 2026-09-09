"use client";

import { useActionState, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { normaliseAgentCode, unitOfAgentCode } from "@/lib/agent-code";

/**
 * Signing in with the code, rather than with a password.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CREDENTIAL AN AGENT ACTUALLY HAS ON THEM
 *
 *  A password chosen three weeks ago at a training session is the thing they
 *  have forgotten. The code on the card in their pocket is the thing they have
 *  — it was written down at sign-up, in front of them, on a page that told
 *  them to write it down.
 *
 *  It is offered first for that reason, and the password form sits underneath
 *  for anybody who prefers it. Neither is a fallback for the other; they are
 *  two credentials for one account.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── IT READS THE BOOTH BACK WHILE THEY TYPE ────────────────────────────────
 * The first nine digits of a code are the agent's own polling unit, so the
 * moment enough has been typed the form can say which booth it names. That is
 * not a check on the credential — anybody can write nine digits — it is a
 * check for the *agent*: somebody who transposed two digits sees a booth that
 * is not theirs before they press anything, rather than a refusal afterwards
 * with nothing to look at.
 */
export default function CodeSignIn({ action }) {
  const [state, submit] = useActionState(action, {});
  const [typed, setTyped] = useState("");

  /* Only once it is a whole code. Reading a booth back off half of one would
     name a different booth on almost every keystroke. */
  const booth = unitOfAgentCode(typed);
  const ready = Boolean(normaliseAgentCode(typed));

  return (
    <form action={submit} noValidate className="space-y-4">
      <div>
        <label
          htmlFor="agent-code"
          className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink-950"
        >
          <KeyRound size={16} strokeWidth={2.5} aria-hidden="true" />
          Your code
        </label>

        <input
          id="agent-code"
          name="code"
          type="text"
          /* Not a password field. Nobody is shoulder-surfing a polling unit at
             six in the morning, and a masked box is how a code gets typed
             wrong four times by somebody who cannot see what they typed. */
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="33-0101001-K7M4QX"
          className="figure mt-2 w-full rounded-dash-sm border-2 border-ink-300 px-4 py-3 text-center text-[1.125rem] tracking-[0.06em] text-ink-950 uppercase placeholder:text-content-subtle focus:border-ink-950 focus:outline-none"
        />

        {/* What the code says it is. Present as soon as it is complete, absent
            the rest of the time, so it never argues with a half-typed box. */}
        <p className="mt-2 min-h-5 text-[0.8125rem] text-content-muted">
          {booth ? (
            <>
              Polling unit <span className="figure font-bold text-ink-950">{booth}</span> — check
              that against your sheet.
            </>
          ) : (
            "As it was written down when you signed up."
          )}
        </p>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-dash-sm border-l-2 border-red-500 bg-red-50 px-4 py-3 text-[0.875rem] leading-relaxed text-red-900"
        >
          {state.error}
        </p>
      )}

      <Submit ready={ready} />
    </form>
  );
}

function Submit({ ready }) {
  /* `useActionState`'s own pending flag would need this split into a child
     anyway; keeping the button here keeps the disabled rule beside the rule
     that decides it. */
  const [pending, setPending] = useState(false);

  return (
    <button
      type="submit"
      onClick={() => setPending(true)}
      /* Disabled until it is a whole code, so the commonest failure — pressing
         it too early — never reaches the server and never spends one of the
         ten attempts the rate limit allows. */
      disabled={!ready || pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-dash-sm bg-ink-950 px-5 py-3 text-[0.9375rem] font-bold text-white transition-opacity disabled:opacity-40"
    >
      {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
      Sign in
    </button>
  );
}
