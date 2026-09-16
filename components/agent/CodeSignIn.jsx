"use client";

import { useActionState, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { readTypedAgentCode, unitOfAgentCode } from "@/lib/agent-code";

/**
 * Signing in with the code — the only way an agent signs in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CREDENTIAL AN AGENT ACTUALLY HAS ON THEM
 *
 *  No username and no password. The code is given to an agent when they are
 *  approved, it names their polling unit, and it is theirs alone. Data Bank,
 *  which holds the agent list, confirms it every time somebody signs in.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── IT READS THE BOOTH BACK WHILE THEY TYPE ────────────────────────────────
 * The first nine digits of a code are the agent's own polling unit, so the
 * moment enough has been typed the form can say which booth it names. That is
 * not a check on the credential — anybody can write nine digits — it is a
 * check for the *agent*: somebody who transposed two digits sees a booth that
 * is not theirs before they press anything, rather than a refusal afterwards
 * with nothing to look at.
 *
 * ── AND IT SAYS WHY THE BUTTON IS NOT READY ────────────────────────────────
 * The button stays off until the code is whole, so the line under the box has
 * to say what is missing. The commonest case by far is the polling unit number
 * on its own, typed by somebody who thinks that is the code.
 */
const HINTS = {
  empty: "As your coordinator gave it to you.",
  incomplete: "Keep going — a code is 15 letters and numbers, like 33-0101001-K7M4QX.",
  "unit-only":
    "That is your polling unit number. Now add the six letters and numbers that come after it.",
  "too-long": "That is longer than a code. A code is 15 letters and numbers, like 33-0101001-K7M4QX.",
  stray: "Type only the code itself — letters, numbers and dashes, nothing else.",
};

export default function CodeSignIn({ action }) {
  /* The third value is React's own pending flag. It turns itself off when the
     server answers, so a refused code leaves the button ready to try again
     rather than spinning for ever. */
  const [state, submit, pending] = useActionState(action, {});
  const [typed, setTyped] = useState("");

  const stage = readTypedAgentCode(typed);
  const ready = stage === "complete";
  /* Only once it is a whole code. Reading a booth back off half of one would
     name a different booth on almost every keystroke. */
  const booth = ready ? unitOfAgentCode(typed) : null;
  const nudging = stage !== "empty" && !ready;

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
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={40}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="33-0101001-K7M4QX"
          aria-describedby="agent-code-hint"
          aria-invalid={nudging && stage !== "incomplete" ? true : undefined}
          className="figure mt-2 w-full rounded-dash-sm border-2 border-ink-300 px-4 py-3 text-center text-[1.125rem] tracking-[0.06em] text-ink-950 uppercase placeholder:text-content-subtle focus:border-ink-950 focus:outline-none"
        />

        {/* What the code says it is once it is whole, and what is missing
            until then. Polite, so a screen reader hears it without it
            interrupting every keystroke. */}
        <p
          id="agent-code-hint"
          aria-live="polite"
          className={`mt-2 min-h-5 text-[0.8125rem] leading-relaxed ${
            nudging && stage !== "incomplete" ? "font-bold text-ink-950" : "text-content-muted"
          }`}
        >
          {booth ? (
            <>
              Polling unit <span className="figure font-bold text-ink-950">{booth}</span> — check
              that against your sheet.
            </>
          ) : (
            HINTS[stage]
          )}
        </p>
      </div>

      {state?.error && !pending && (
        <p
          role="alert"
          className="rounded-dash-sm border-l-2 border-red-500 bg-red-50 px-4 py-3 text-[0.875rem] leading-relaxed text-red-900"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        /* Off until it is a whole code, so the commonest failure — pressing it
           too early — never reaches the server and never spends one of the ten
           attempts the rate limit allows. */
        disabled={!ready || pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-dash-sm bg-ink-950 px-5 py-3 text-[0.9375rem] font-bold text-white transition-opacity disabled:opacity-40"
      >
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
        {pending ? "Checking your code…" : "Sign in"}
      </button>
    </form>
  );
}
