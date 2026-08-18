"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Check, Loader2, TriangleAlert } from "lucide-react";

import Button from "@/components/ui/Button";
import { requestAccess } from "@/app/actions/access";

/**
 * The request-access form.
 *
 * Seven fields, four of them required, and it posts to a server action — so it
 * works with JavaScript off, and the answer comes back on the page rather than
 * in a mail client the visitor may not have configured.
 *
 * On a dark block, so the inputs are drawn as white-ruled boxes on navy rather
 * than as a white card dropped onto it. A form that arrives as a pale rectangle
 * in the middle of a colour field looks bolted on; this one is built from the
 * same rules as everything around it.
 */
const KINDS = [
  ["situation-room", "Situation room"],
  ["broadcaster", "Broadcaster or newsroom"],
  ["observer", "Observer mission"],
  ["campaign", "Campaign"],
  ["other", "Something else"],
];

export default function AccessForm() {
  const [state, formAction] = useActionState(requestAccess, {});
  const ids = useId();

  if (state?.ok) {
    return (
      <div className="border-2 border-white/25 bg-white/5 p-8">
        <Check size={26} strokeWidth={2.5} className="text-white" aria-hidden="true" />
        <h3 className="mt-5 text-fluid-xl text-white">
          {state.name ? `Thank you, ${state.name.split(" ")[0]}.` : "Thank you."}
        </h3>
        <p className="mt-3 text-fluid-base leading-relaxed text-white/70">
          We have it. A person — not an autoresponder — will come back to you, usually within a
          working day, with what Poll360 will do for your night and what it will not.
        </p>
      </div>
    );
  }

  const errors = state?.errors ?? {};
  const values = state?.values ?? {};

  return (
    <form action={formAction} noValidate className="border-2 border-white/20 bg-white/5 p-6 sm:p-8">
      {state?.error && (
        <p
          role="alert"
          className="mb-6 flex gap-3 border-l-2 border-red-400 bg-red-500/10 px-4 py-3 text-[0.875rem] leading-relaxed text-white"
        >
          <TriangleAlert size={17} strokeWidth={2.5} className="mt-px shrink-0 text-red-400" />
          {state.error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id={`${ids}-org`}
          name="organisation"
          label="Your room or organisation"
          placeholder="Channels TV, YIAGA Africa…"
          defaultValue={values.organisation}
          error={errors.organisation}
          required
        />
        <Field
          id={`${ids}-name`}
          name="name"
          label="Your name"
          autoComplete="name"
          defaultValue={values.name}
          error={errors.name}
          required
        />
        <Field
          id={`${ids}-email`}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@yourroom.ng"
          defaultValue={values.email}
          error={errors.email}
          required
        />
        <Field
          id={`${ids}-phone`}
          name="phone"
          type="tel"
          label="Phone"
          hint="optional"
          autoComplete="tel"
          placeholder="0803 000 0000"
          defaultValue={values.phone}
        />
      </div>

      <fieldset className="mt-7">
        <legend className="tag text-white/55">What are you? *</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {KINDS.map(([value, label], index) => (
            <label
              key={value}
              className="group cursor-pointer border-2 border-white/25 px-3.5 py-2.5 text-[0.875rem] text-white/75 transition-colors has-checked:border-white has-checked:bg-white has-checked:text-ink-950 hover:border-white/60"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                defaultChecked={values.kind ? values.kind === value : index === 0}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {errors.kind && (
          <p className="mt-2 text-[0.8125rem] font-semibold text-red-400">{errors.kind}</p>
        )}
      </fieldset>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field
          id={`${ids}-election`}
          name="election"
          label="Which election"
          hint="optional"
          placeholder="Presidential, February 2027"
          defaultValue={values.election}
        />
        <Field
          id={`${ids}-units`}
          name="units"
          type="text"
          inputMode="numeric"
          label="Booths you can staff"
          hint="optional"
          placeholder="e.g. 12,000"
          defaultValue={values.units}
        />
      </div>

      <div className="mt-5">
        <label htmlFor={`${ids}-message`} className="tag block text-white/55">
          Anything else <span className="text-white/35">optional</span>
        </label>
        <textarea
          id={`${ids}-message`}
          name="message"
          rows={3}
          defaultValue={values.message}
          className="mt-2.5 w-full resize-y border-2 border-white/25 bg-blue-950/60 px-4 py-3 text-[0.9375rem] text-white transition-colors placeholder:text-white/35 hover:border-white/45 focus:border-white focus:outline-none"
          placeholder="What you are trying to cover, and what worries you about it."
        />
      </div>

      {/* Honeypot: hidden from people, irresistible to naive bots. Not
          `display:none`, which the better ones check for. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${ids}-website`}>Website</label>
        <input id={`${ids}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <SubmitButton />

      <p className="mt-4 text-[0.8125rem] leading-relaxed text-white/45">
        We use this to answer you and nothing else. No newsletter, no list, no third party.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="primary" size="lg" full disabled={pending} className="mt-7">
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
          Sending
        </>
      ) : (
        <>
          Request access
          <ArrowRight size={16} strokeWidth={3} />
        </>
      )}
    </Button>
  );
}

function Field({ id, name, label, hint, error, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="tag block text-white/55">
        {label} {hint && <span className="text-white/35">{hint}</span>}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          "mt-2.5 h-13 w-full border-2 bg-blue-950/60 px-4 text-[0.9375rem] text-white",
          "transition-colors placeholder:text-white/35 focus:outline-none",
          error ? "border-red-400" : "border-white/25 hover:border-white/45 focus:border-white",
        ].join(" ")}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-[0.8125rem] font-semibold text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
