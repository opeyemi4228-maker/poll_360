"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2, TriangleAlert } from "lucide-react";

import Field, { fieldInput as input } from "./Field";
import UnitPicker from "./UnitPicker";
import PhotoField from "./PhotoField";

/**
 * Signing up to be an agent.
 *
 * ── NO PASSWORD, ON PURPOSE ────────────────────────────────────────────────
 * Agents sign in with a code and nothing else. The code is issued when an
 * administrator approves them, so this form asks only for what that decision
 * needs: who they are, how to reach them, what they look like, and the
 * polling unit they were appointed to.
 *
 * ── BUILT FOR ONE THUMB, AT NIGHT, ON A WEAK SIGNAL ────────────────────────
 * Every target is at least 48px tall, the number pad opens for the phone
 * number, and every error is a sentence. It posts to a server action, so it
 * works with JavaScript switched off; the server repeats every check.
 */
export default function AgentAuthForm({ action, initial = {}, places = [] }) {
  const [state, submit] = useActionState(action, {});

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

      <Field label="Phone number" error={errors.phone} name="phone">
        {(id) => (
          <input
            id={id}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={values.phone ?? ""}
            placeholder="0803 000 0000"
            className={input(errors.phone)}
          />
        )}
      </Field>

      <PhotoField error={errors.photo} />

      <UnitPicker places={places} values={values} errors={errors} />

      <Submit />
    </form>
  );
}

function Submit() {
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
      Send my details
    </button>
  );
}
