"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";

import Button from "@/components/ui/Button";
import { joinAsCoordinator } from "@/app/actions/join";

/**
 * Signing up as a polling unit coordinator.
 *
 * ── FOUR FIELDS, AND A REASON FOR EACH ─────────────────────────────────────
 * Name, because a return has to have somebody's name on it. A phone number or
 * an email, because that is how you sign in and how the desk reaches you at
 * 11pm about a figure. The polling unit code, because that is the whole
 * appointment. And a password. Nothing else is asked, because every extra
 * field is one more thing to type on a phone and one more reason to give up
 * halfway.
 *
 * ── THE UNIT CODE IS FORMATTED AS IT IS TYPED ──────────────────────────────
 * Nine digits with slashes in three places, entered by somebody copying them
 * off a form. Typing the slashes on a phone keyboard means switching layouts
 * three times, so they are inserted here and the field accepts digits alone.
 * The server parses either shape regardless — see lib/units.js — but a field
 * that shows the code in the same grammar as the paperwork is a field somebody
 * can check against the paperwork.
 * ───────────────────────────────────────────────────────────────────────────
 */
function formatUnit(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 9);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6), digits.slice(6, 9)];
  return parts.filter(Boolean).join("/");
}

export default function JoinForm() {
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const unitId = useId();
  const passwordId = useId();

  const [unitCode, setUnitCode] = useState("");
  const [visible, setVisible] = useState(false);

  const [state, formAction] = useActionState(joinAsCoordinator, {});
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="mt-10">
      <Field id={nameId} label="Your full name" error={errors.name}>
        <input
          id={nameId}
          name="name"
          type="text"
          autoComplete="name"
          defaultValue={state?.values?.name ?? ""}
          placeholder="As your coordinator knows you"
          className={inputClass(errors.name)}
        />
      </Field>

      <div className="mt-6">
        <Field id={phoneId} label="Phone number" error={errors.phone}>
          <input
            id={phoneId}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={state?.values?.phone ?? ""}
            placeholder="0803 123 4567"
            className={inputClass(errors.phone)}
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field id={emailId} label="Email address" hint="optional" error={errors.email}>
          <input
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={state?.values?.email ?? ""}
            placeholder="you@example.com"
            className={inputClass(errors.email)}
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field
          id={unitId}
          label="Your polling unit code"
          error={errors.unitCode}
        >
          <input
            id={unitId}
            name="unitCode"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={unitCode}
            onChange={(event) => setUnitCode(formatUnit(event.target.value))}
            placeholder="01/01/04/006"
            className={`${inputClass(errors.unitCode)} font-mono tracking-[0.05em]`}
          />
        </Field>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-content-muted">
          State, local government, ward, unit. Copy it exactly as it appears on the sheet. Your
          coordinator confirms it before your account is approved.
        </p>
      </div>

      <div className="mt-6">
        <Field id={passwordId} label="Choose a password" error={errors.password}>
          <div className="relative">
            <input
              id={passwordId}
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
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
        </Field>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-content-muted">
          Ten characters or more. Three ordinary words you will remember beats eight characters you
          will write on the back of your hand.
        </p>
      </div>

      {state?.error && (
        <div role="alert" className="mt-8 flex gap-3 border-l-2 border-red-500 bg-red-50 px-4 py-4">
          <TriangleAlert size={17} strokeWidth={2.5} className="mt-px shrink-0 text-red-600" />
          <p className="text-[0.875rem] leading-relaxed text-ink-800">{state.error}</p>
        </div>
      )}

      <SubmitButton />

      <p className="mt-6 text-[0.8125rem] leading-relaxed text-content-muted">
        Signing up does not put anything into the count. An administrator checks your unit and
        approves you first, and until they do your account can file nothing.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" full disabled={pending} className="mt-8">
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
          Sending your details
        </>
      ) : (
        <>
          Ask to be approved
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

function Field({ id, label, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="tag block text-content-subtle">
        {label}
        {hint && <span className="ml-2 font-normal normal-case">{hint}</span>}
      </label>
      <div className="mt-2.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-[0.8125rem] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
