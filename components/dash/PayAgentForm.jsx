"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Banknote, Check, Loader2, TriangleAlert } from "lucide-react";

import Button from "@/components/ui/Button";
import { payAgent } from "@/app/admin/actions";

/**
 * Paying an agent.
 *
 * The only door money comes through. Deliberately plain: an amount, who it is
 * for, and what it is — because the interesting part is not this form, it is
 * the entry it writes into a chain nobody can edit afterwards.
 *
 * "Settle a withdrawal" is the same form with a different kind, rather than a
 * separate screen, because it is the same act: writing one more line into the
 * ledger. Nothing is ever modified.
 */
const KINDS = [
  ["STIPEND", "Stipend", "Standard payment for working the day"],
  ["BONUS", "Bonus", "Filed early, or covered a second unit"],
  ["ADJUSTMENT", "Adjustment", "Correcting an earlier shortfall"],
  ["WITHDRAWAL", "Settle a withdrawal", "Money actually sent to the agent"],
];

export default function PayAgentForm() {
  const [state, formAction] = useActionState(payAgent, {});
  const [kind, setKind] = useState("STIPEND");

  if (state?.ok) {
    return (
      <div className="rounded-dash-sm border-2 border-emerald-300 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-dash-ink">
          <Check size={17} strokeWidth={3} className="text-emerald-600" />
          Written to the ledger for {state.name}
        </p>
        <p className="figure mt-2 text-[0.8125rem] text-dash-muted">
          Reference {state.reference} — the agent sees it on their account now.
        </p>
        <Button
          variant="dashOutline"
          size="md"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Pay somebody else
        </Button>
      </div>
    );
  }

  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="contact"
          className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
        >
          Agent — email or phone
        </label>
        <input
          id="contact"
          name="contact"
          autoComplete="off"
          placeholder="agent@poll360.ng"
          className={[
            "mt-2 h-12 w-full rounded-dash-sm border-2 bg-dash-card px-3 text-[0.9375rem] text-dash-ink",
            "placeholder:text-dash-muted focus:outline-none",
            errors.contact ? "border-red-500" : "border-dash-line focus:border-dash-ink",
          ].join(" ")}
        />
        {errors.contact && (
          <p className="mt-1.5 text-[0.8125rem] font-semibold text-red-600">{errors.contact}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="amount"
          className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
        >
          Amount
        </label>
        <div
          className={[
            "mt-2 flex items-center rounded-dash-sm border-2 bg-dash-card",
            errors.amount ? "border-red-500" : "border-dash-line focus-within:border-dash-ink",
          ].join(" ")}
        >
          <span className="figure pl-3 text-[1.0625rem] text-dash-muted">₦</span>
          <input
            id="amount"
            name="amount"
            inputMode="numeric"
            placeholder="15,000"
            className="figure h-12 w-full bg-transparent px-2 text-[1.0625rem] text-dash-ink placeholder:text-dash-muted focus:outline-none"
          />
        </div>
        {errors.amount && (
          <p className="mt-1.5 text-[0.8125rem] font-semibold text-red-600">{errors.amount}</p>
        )}
      </div>

      <fieldset>
        <legend className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          What is it
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {KINDS.map(([value, label, hint]) => (
            <label
              key={value}
              title={hint}
              className="cursor-pointer rounded-dash-sm border-2 border-dash-line px-3 py-2.5 text-[0.875rem] text-dash-muted transition-colors has-checked:border-dash-ink has-checked:bg-dash-ink has-checked:text-white"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[0.8125rem] text-dash-muted">
          {KINDS.find(([value]) => value === kind)?.[2]}
        </p>
      </fieldset>

      <div>
        <label
          htmlFor="note"
          className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
        >
          Note <span className="text-dash-muted">optional</span>
        </label>
        <input
          id="note"
          name="note"
          placeholder="Election day, 25 February"
          className="mt-2 h-12 w-full rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 text-[0.9375rem] text-dash-ink placeholder:text-dash-muted focus:border-dash-ink focus:outline-none"
        />
      </div>

      {state?.error && (
        <p className="flex gap-2 rounded-dash-sm border-l-2 border-red-500 bg-red-50 px-3 py-2 text-[0.875rem] text-dash-ink">
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
          Writing to the ledger
        </>
      ) : (
        <>
          <Banknote size={16} strokeWidth={2.75} />
          Write to the ledger
        </>
      )}
    </Button>
  );
}
