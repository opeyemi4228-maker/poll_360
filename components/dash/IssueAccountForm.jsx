"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, KeyRound, Loader2, TriangleAlert } from "lucide-react";

import Button from "@/components/ui/Button";
import { issueAccount } from "@/app/admin/actions";
import { ROLES } from "@/lib/roles";

/**
 * Issue an account for one of the rooms.
 *
 * The credential appears once, in a block the administrator has to actively
 * dismiss, with a copy button, because the realistic alternative is that they
 * photograph the screen, and a credential that is easy to hand over correctly
 * is a credential less likely to be sent over WhatsApp in three parts.
 */
const ISSUABLE = ["PU_AGENT", "BROADCASTER", "SITUATION_ROOM", "SUPER_ADMIN"];

export default function IssueAccountForm() {
  const [state, formAction] = useActionState(issueAccount, {});
  const [role, setRole] = useState("BROADCASTER");
  const [copied, setCopied] = useState(false);

  if (state?.issued) {
    const { issued } = state;
    return (
      <div className="rounded-dash border-2 border-dash-ink bg-dash-card p-5">
        <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-dash-ink">
          <Check size={17} strokeWidth={3} className="text-emerald-600" />
          {issued.name} can now sign in
        </p>

        <dl className="mt-4 space-y-2 text-[0.875rem]">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-dash-muted">Room</dt>
            <dd className="text-dash-ink">{ROLES[issued.role]?.label}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-dash-muted">Sign in</dt>
            <dd className="figure wrap-break-word text-dash-ink">{issued.email ?? issued.phone}</dd>
          </div>
        </dl>

        <div className="mt-4 border border-dash-line bg-dash-card p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-dash-muted">Password, shown once</p>
          <div className="mt-2 flex items-center gap-3">
            <code className="figure flex-1 wrap-break-word text-[1rem] font-bold text-dash-ink">
              {issued.password}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(issued.password);
                setCopied(true);
              }}
              className="inline-flex size-10 shrink-0 items-center justify-center border-2 border-dash-line text-dash-ink transition-colors hover:border-dash-ink hover:bg-dash-ink hover:text-white"
              aria-label="Copy the password"
            >
              {copied ? <Check size={15} strokeWidth={3} /> : <Copy size={15} strokeWidth={2.5} />}
            </button>
          </div>
        </div>

        <p className="mt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          It is not stored in readable form and cannot be shown again. If it is lost, issue a new
          one. Hand it over in person or by voice, never in the same message as the username.
        </p>

        <Button
          variant="dashOutline"
          size="md"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Issue another
        </Button>
      </div>
    );
  }

  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <Field name="name" label="Name of the person or desk" error={errors.name} required />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="email" type="email" label="Email" error={errors.email} />
        <Field name="phone" type="tel" label="Phone" error={errors.phone} />
      </div>

      <div>
        <label htmlFor="role" className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted">
          Room
        </label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="mt-2 h-12 w-full rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 text-[0.9375rem] text-dash-ink focus:border-dash-ink focus:outline-none"
        >
          {ISSUABLE.map((value) => (
            <option key={value} value={value} className="bg-dash-card">
              {ROLES[value].label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[0.8125rem] text-dash-muted">{ROLES[role].blurb}</p>
      </div>

      {/* A coordinator without a booth is an account that cannot do the one
          thing it exists for, so the field appears only for that role and is
          required there. */}
      {role === "PU_AGENT" && (
        <Field
          name="scope"
          label="Polling unit code"
          hint="state/LGA/ward/unit"
          placeholder="25/07/04/019"
          error={errors.scope}
          required
        />
      )}

      {state?.error && (
        <p className="flex gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-[0.875rem] text-dash-ink">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="lg" full disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
          Issuing
        </>
      ) : (
        <>
          <KeyRound size={16} strokeWidth={2.75} />
          Issue account
        </>
      )}
    </Button>
  );
}

function Field({ name, label, hint, error, ...props }) {
  return (
    <div>
      <label htmlFor={name} className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted">
        {label} {hint && <span className="text-dash-muted">{hint}</span>}
      </label>
      <input
        id={name}
        name={name}
        className={[
          "mt-2 h-12 w-full rounded-dash-sm border-2 bg-dash-card px-3 text-[0.9375rem] text-dash-ink",
          "placeholder:text-dash-muted focus:outline-none",
          error ? "border-red-500" : "border-dash-line focus:border-dash-ink",
        ].join(" ")}
        {...props}
      />
      {error && <p className="mt-1.5 text-[0.8125rem] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
