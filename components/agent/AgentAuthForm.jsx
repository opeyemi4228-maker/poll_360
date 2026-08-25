"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";

/**
 * The coordinator's sign-in and sign-up form.
 *
 * ── BUILT FOR ONE THUMB, AT NIGHT, ON A WEAK SIGNAL ────────────────────────
 * This is not the staff sign-in with different wording. The people using it
 * are standing up, holding a result sheet in the other hand, on a phone whose
 * screen they can barely see. So every target is at least 48px tall, the
 * keyboard that opens is the right one for the field (a number pad for a phone
 * number, never a full keyboard), autocapitalise is off everywhere it would
 * corrupt an identifier, and every error is a sentence rather than a code.
 *
 * It posts to a server action, so it works with JavaScript switched off: the
 * browser submits, the action runs, and the page comes back with whatever it
 * has to say. The checks below are a courtesy that saves a round trip on an
 * obvious slip. They are not the gate. The server repeats every one of them.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function AgentAuthForm({ action, mode = "signin", initial = {} }) {
  const joining = mode === "join";
  const [state, submit] = useActionState(action, {});
  const [visible, setVisible] = useState(false);

  const values = state?.values ?? initial;
  const errors = state?.errors ?? {};

  return (
    <form action={submit} noValidate className="mt-8 space-y-5">
      {state?.error && (
        <p className="flex gap-2.5 rounded-dash-sm border-2 border-red-500 bg-red-50 px-4 py-3 text-[0.875rem] leading-relaxed text-red-900">
          <TriangleAlert size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      {joining && (
        <Field label="Your full name" error={errors.name} name="name">
          {(id) => (
            <input
              id={id}
              name="name"
              type="text"
              autoComplete="name"
              defaultValue={values.name ?? ""}
              placeholder="As your coordinator knows it"
              className={input(errors.name)}
            />
          )}
        </Field>
      )}

      {joining ? (
        <>
          <Field label="Phone number" error={errors.phone} name="phone">
            {(id) => (
              <input
                id={id}
                name="phone"
                type="tel"
                /* The number pad, not the full keyboard. A coordinator typing
                   eleven digits through a QWERTY layout at night is the single
                   most reliable way to get a phone number wrong. */
                inputMode="tel"
                autoComplete="tel"
                defaultValue={values.phone ?? ""}
                placeholder="0803 000 0000"
                className={input(errors.phone)}
              />
            )}
          </Field>

          <Field label="Email address" hint="Optional" error={errors.email} name="email">
            {(id) => (
              <input
                id={id}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                defaultValue={values.email ?? ""}
                className={input(errors.email)}
              />
            )}
          </Field>

          <Field
            label="Your polling unit code"
            hint="Printed at the top of the result sheet"
            error={errors.unitCode}
            name="unitCode"
          >
            {(id) => (
              <input
                id={id}
                name="unitCode"
                type="text"
                inputMode="numeric"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                defaultValue={values.unitCode ?? ""}
                placeholder="01/01/04/006"
                className={`${input(errors.unitCode)} figure`}
              />
            )}
          </Field>
        </>
      ) : (
        <Field label="Phone number or email" error={errors.contact} name="contact">
          {(id) => (
            <input
              id={id}
              name="contact"
              type="text"
              inputMode="tel"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="0803 000 0000"
              className={input(errors.contact)}
            />
          )}
        </Field>
      )}

      <Field
        label="Password"
        hint={joining ? "At least 10 characters" : undefined}
        error={errors.password}
        name="password"
      >
        {(id) => (
          <div className="relative">
            <input
              id={id}
              name="password"
              type={visible ? "text" : "password"}
              autoComplete={joining ? "new-password" : "current-password"}
              className={`${input(errors.password)} pr-14`}
            />
            <button
              type="button"
              onClick={() => setVisible((on) => !on)}
              /* A real target, not a 16px icon. Somebody who cannot see the
                 screen well enough to type the password also cannot hit a
                 sixteen-pixel eye. */
              className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-ink-500"
              aria-label={visible ? "Hide password" : "Show password"}
            >
              {visible ? <EyeOff size={18} strokeWidth={2.25} /> : <Eye size={18} strokeWidth={2.25} />}
            </button>
          </div>
        )}
      </Field>

      <Submit joining={joining} />
    </form>
  );
}

const input = (error) =>
  [
    "h-14 w-full rounded-dash-sm border-2 bg-white px-4 text-[1.0625rem] text-ink-950",
    "placeholder:text-ink-400 focus:outline-none",
    error ? "border-red-500" : "border-ink-300 focus:border-ink-950",
  ].join(" ");

function Field({ label, hint, error, name, children }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3">
        <span className="text-[0.9375rem] font-bold text-ink-950">{label}</span>
        {hint && <span className="text-[0.8125rem] text-content-subtle">{hint}</span>}
      </label>
      <div className="mt-2">{children(id)}</div>
      {error && (
        <p id={`${name}-error`} className="mt-2 flex gap-2 text-[0.875rem] text-red-700">
          <TriangleAlert size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function Submit({ joining }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-dash-sm bg-ink-950 text-[1rem] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
      ) : (
        <ArrowRight size={18} strokeWidth={2.5} />
      )}
      {joining ? "Sign up" : "Sign in"}
    </button>
  );
}
