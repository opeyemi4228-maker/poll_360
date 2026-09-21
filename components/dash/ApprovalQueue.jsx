"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, KeyRound, Loader2, MapPin, TriangleAlert, UserRoundCheck, X } from "lucide-react";

import Button from "@/components/ui/Button";
import { approveCoordinator, declineCoordinator } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

/**
 * Agents waiting to be approved, from Data Bank's list.
 *
 * ── THE ONE SCREEN WHERE A TYPO IS WORTH CATCHING ──────────────────────────
 * Everything about an agent can be fixed later except the polling unit,
 * because the unit is what every figure they file is attached to — and it is
 * baked into the code they are about to be given. So the unit is printed in a
 * field, ready to be corrected by the person approving, who is usually the one
 * holding the appointment list.
 *
 * ── AND THE CODE IS SHOWN HERE, ONCE ───────────────────────────────────────
 * Approving is what issues an agent's code. Data Bank keeps only a fingerprint
 * of it, so this is the only moment anybody can read it: the row turns into
 * the code, large, with the instruction to hand it to the agent. Lose it and
 * the agent is given a new one.
 */
export default function ApprovalQueue({ waiting = [], signUpAddress }) {
  if (!waiting.length) {
    return (
      <div className="border-l-2 border-dash-line bg-dash-bg px-4 py-3.5">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">
          Nobody is waiting. Agents from a party&rsquo;s uploaded list, and agents who sign up at{" "}
          <span className="figure text-dash-ink">{signUpAddress}</span>, appear here. None of them
          can sign in until they are approved and given a code.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-dash-line">
      {waiting.map((person) => (
        <Applicant key={person.id} person={person} />
      ))}
    </ul>
  );
}

function Applicant({ person }) {
  const [approveState, approve] = useActionState(approveCoordinator, {});
  const [declineState, decline] = useActionState(declineCoordinator, {});
  const [scope, setScope] = useState(person.scope ?? "");

  if (approveState?.ok) {
    return (
      <li className="py-4">
        <p className="flex items-start gap-2.5 text-[0.875rem] text-dash-ink">
          <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-ok-600" />
          <span>
            <span className="font-semibold">{approveState.name}</span> is approved for{" "}
            <span className="figure">{approveState.scope}</span>.
          </span>
        </p>
        {approveState.code && (
          <div className="mt-3 rounded-dash-sm border-2 border-dash-ink bg-dash-bg p-4">
            <p className="flex items-center gap-2 text-[0.8125rem] font-bold text-dash-ink">
              <KeyRound size={15} strokeWidth={2.5} />
              Give {approveState.name.split(" ")[0]} this code. It is shown only once.
            </p>
            <p className="figure mt-3 text-center text-[1.5rem] leading-none font-bold tracking-[0.08em] text-dash-ink select-all">
              {approveState.code}
            </p>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
              They sign in with it on the agents&rsquo; site, or by sending it to the WhatsApp desk. If
              it is lost, they are given a new one and this one stops working.
            </p>
          </div>
        )}
      </li>
    );
  }

  if (declineState?.ok) {
    return (
      <li className="flex items-start gap-3 py-4">
        <X size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-dash-muted" />
        <p className="text-[0.875rem] text-dash-muted">
          <span className="font-semibold text-dash-ink">{declineState.declined}</span> was turned
          down. They stay on the list, marked as turned down.
        </p>
      </li>
    );
  }

  const error = approveState?.error ?? declineState?.error;
  const scopeError = approveState?.errors?.scope;

  return (
    <li className="py-4">
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-bold text-dash-ink">{person.name}</p>
        <p className="figure mt-1 text-[0.8125rem] text-dash-muted">
          {person.phoneTail ? `Phone ending ${person.phoneTail}` : "No phone"}
          {person.party && ` · ${person.party}`}
          {person.sourceLabel && ` · ${person.sourceLabel.toLowerCase()}`}
          {person.waitingFor && ` · waiting ${person.waitingFor}`}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`scope-${person.id}`}
            className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
          >
            <MapPin size={11} strokeWidth={2.5} />
            Polling unit
          </label>
          <input
            id={`scope-${person.id}`}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className={cn(
              "figure mt-1.5 h-11 w-full max-w-[14rem] rounded-dash-sm border-2 bg-dash-card px-3 text-[0.9375rem] font-bold text-dash-ink focus:outline-none",
              scopeError ? "border-red-500" : "border-dash-line focus:border-dash-ink"
            )}
          />
          <Where person={person} />
        </div>

        <form action={approve} className="shrink-0">
          <input type="hidden" name="id" value={person.id} />
          <input type="hidden" name="scope" value={scope} />
          <Approve />
        </form>

        <form action={decline} className="shrink-0">
          <input type="hidden" name="id" value={person.id} />
          <Decline />
        </form>
      </div>

      {(error || scopeError) && (
        <p className="mt-2.5 flex gap-2 text-[0.8125rem] text-dash-ink">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-600" />
          {scopeError ?? error}
        </p>
      )}
    </li>
  );
}

/* The state and local government, read off the code on the server against the
   lists this product ships. They move when the code is corrected. */
function Where({ person }) {
  const placed = [person.stateName, person.lgaName].filter(Boolean);
  if (!placed.length) return null;
  return (
    <p className="mt-1.5 max-w-[26rem] text-[0.8125rem] leading-relaxed text-dash-ink">
      {placed.join(" · ")}
    </p>
  );
}

function Approve() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 size={14} strokeWidth={3} className="animate-spin" />
      ) : (
        <UserRoundCheck size={14} strokeWidth={2.5} />
      )}
      Approve and issue code
    </Button>
  );
}

function Decline() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dashOutline" size="sm" disabled={pending}>
      {pending ? <Loader2 size={14} strokeWidth={3} className="animate-spin" /> : <X size={14} strokeWidth={2.5} />}
      Decline
    </Button>
  );
}
