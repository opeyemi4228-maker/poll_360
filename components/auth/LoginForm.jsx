"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";

import Button from "@/components/ui/Button";
import { signIn } from "@/app/actions/auth";
import { site } from "@/lib/site";

/**
 * The sign-in form.
 *
 * Two fields, one button, and nothing else competing with them. The people who
 * use this are signing in one-handed, at night, on a phone, sometimes in a
 * hurry, so the targets are large, the labels are plain words, and every error
 * is written as a sentence rather than as a code.
 *
 * It posts to a server action, so it works with JavaScript switched off: the
 * browser submits the form, the action runs, and the page comes back with
 * whatever it has to say. The client-side checks below are a courtesy that
 * saves a round trip on an obvious slip, they are not the gate, and the
 * server repeats every one of them.
 *
 * The server answers a failed attempt with one message whatever went wrong.
 * See app/actions/auth.js for why that matters here more than it usually does.
 */

/** Deliberately loose: an agent may sign in with a phone number, not an email. */
function looksLikeContact(value) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
  return /^[+\d][\d\s-]{6,}$/.test(trimmed);
}

export default function LoginForm() {
  const contactId = useId();
  const passwordId = useId();

  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState({});

  const [state, formAction] = useActionState(signIn, {});
  const notice = state?.error ?? null;

  /* Client-side checks run before the action is allowed to fire. They catch an
     empty field without a round trip; everything else is the server's call. */
  function check(event) {
    const next = {};
    if (!contact.trim()) next.contact = "Enter the email or phone number on your account.";
    else if (!looksLikeContact(contact))
      next.contact = "That does not look like an email address or a phone number.";
    if (!password) next.password = "Enter your password.";

    setErrors(next);
    if (Object.keys(next).length) event.preventDefault();
  }

  return (
    <form noValidate action={formAction} onSubmit={check} className="mt-10">
      <Field
        id={contactId}
        label="Email or phone number"
        error={errors.contact}
        input={
          <input
            id={contactId}
            name="contact"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            aria-invalid={errors.contact ? true : undefined}
            aria-describedby={errors.contact ? `${contactId}-error` : undefined}
            placeholder="you@yourroom.ng"
            className={inputClass(errors.contact)}
          />
        }
      />

      <div className="mt-6">
        <Field
          id={passwordId}
          label="Password"
          error={errors.password}
          input={
            <div className="relative">
              <input
                id={passwordId}
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? `${passwordId}-error` : undefined}
                className={`${inputClass(errors.password)} pr-14`}
              />
              <button
                type="button"
                onClick={() => setVisible((value) => !value)}
                aria-pressed={visible}
                aria-label={visible ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 inline-flex w-13 items-center justify-center text-content-subtle transition-colors hover:text-ink-950"
              >
                {visible ? <EyeOff size={17} strokeWidth={2.25} /> : <Eye size={17} strokeWidth={2.25} />}
              </button>
            </div>
          }
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <label className="group flex cursor-pointer items-center gap-3 text-[0.875rem] text-content-muted">
          <input
            type="checkbox"
            name="remember"
            className="size-4.5 shrink-0 appearance-none border-2 border-ink-300 bg-white transition-colors checked:border-ink-950 checked:bg-ink-950 group-hover:border-ink-950"
          />
          Keep me signed in
        </label>

        <a
          href={`mailto:${site.contact.access}?subject=Poll360%20password%20reset`}
          className="text-[0.875rem] font-semibold text-ink-950 underline underline-offset-4 transition-colors hover:text-red-600"
        >
          Forgotten your password?
        </a>
      </div>

      {/* One place for anything the form has to say back. Announced to screen
          readers, and never a code, a sentence. */}
      {notice && (
        <div
          role="alert"
          className="mt-8 flex gap-3 border-l-2 border-red-500 bg-red-50 px-4 py-4"
        >
          <TriangleAlert size={17} strokeWidth={2.5} className="mt-px shrink-0 text-red-600" />
          <p className="text-[0.875rem] leading-relaxed text-ink-800">{notice}</p>
        </div>
      )}

      <SubmitButton />

      <div className="mt-8 border-t border-ink-200 pt-6">
        <p className="text-[0.8125rem] leading-relaxed text-content-muted">
          No account yet? Poll360 logins are issued to named people by the room they work for, a
          situation room, a newsroom or an observer mission. Ask yours, or ask us.
        </p>
        <Button href="/#access" variant="outline" size="md" full className="mt-4">
          Request access
          <ArrowRight size={15} strokeWidth={3} />
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Its own component so it can read `useFormStatus`, which only reports the
 * pending state of the form *above* the component reading it. Double
 * submission is prevented by the disabled attribute rather than by a flag the
 * form has to remember to clear.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" full disabled={pending} className="mt-8">
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
          Signing you in
        </>
      ) : (
        <>
          Log in
          <ArrowRight size={16} strokeWidth={3} />
        </>
      )}
    </Button>
  );
}

function inputClass(error) {
  return [
    "h-13 w-full border-2 bg-white px-4 text-[0.9375rem] text-ink-950",
    "placeholder:text-ink-400 transition-colors",
    error ? "border-red-500" : "border-ink-300 hover:border-ink-500 focus:border-ink-950",
  ].join(" ");
}

function Field({ id, label, error, input }) {
  return (
    <div>
      <label htmlFor={id} className="tag block text-content-subtle">
        {label}
      </label>
      <div className="mt-2.5">{input}</div>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-[0.8125rem] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
