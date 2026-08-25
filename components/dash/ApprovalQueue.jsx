"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, MapPin, TriangleAlert, UserRoundCheck, X } from "lucide-react";

import Button from "@/components/ui/Button";
import { approveCoordinator, declineCoordinator } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

/**
 * Coordinators waiting to be let in.
 *
 * ── THE ONE SCREEN WHERE A TYPO IS WORTH CATCHING ──────────────────────────
 * Everything on a sign-up form can be fixed later except the polling unit,
 * because the unit is what every figure that account ever files will be
 * attached to. A wrong code does not fail loudly: it files a real return
 * against a booth in the wrong ward, and the map looks entirely normal.
 *
 * So the unit is not printed here as a fact, it is printed in a field, ready to
 * be corrected by the person approving — who is usually the one holding the
 * appointment list. Approving without touching it keeps what they typed.
 *
 * ── AND WHY DECLINING IS NOT A DELETE ──────────────────────────────────────
 * A declined application stays on the record, marked declined. The alternative
 * is somebody signing up again an hour later and arriving in the queue looking
 * like a new name nobody has seen before.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function ApprovalQueue({ waiting = [] }) {
  if (!waiting.length) {
    return (
      <div className="border-l-2 border-dash-line bg-dash-bg px-4 py-3.5">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">
          Nobody is waiting. Coordinators who sign up at{" "}
          <span className="figure text-dash-ink">/join</span> appear here, and can file nothing at
          all until somebody approves them.
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

  /* Once dealt with, the row says what happened and stops offering the
     buttons. The list itself is re-fetched on the next render of the page;
     this is what the person who just clicked sees in the meantime. */
  if (approveState?.ok) {
    return (
      <li className="flex items-start gap-3 py-4">
        <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-emerald-600" />
        <p className="text-[0.875rem] text-dash-ink">
          <span className="font-semibold">{approveState.name}</span> is approved for{" "}
          <span className="figure">{approveState.scope}</span>. They can file from that booth now.
        </p>
      </li>
    );
  }

  if (declineState?.ok) {
    return (
      <li className="flex items-start gap-3 py-4">
        <X size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-dash-muted" />
        <p className="text-[0.875rem] text-dash-muted">
          <span className="font-semibold text-dash-ink">{declineState.declined}</span> was turned
          down. The application stays on the record.
        </p>
      </li>
    );
  }

  const error = approveState?.error ?? declineState?.error;
  const scopeError = approveState?.errors?.scope;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-bold text-dash-ink">{person.name}</p>
          <p className="figure mt-1 text-[0.8125rem] text-dash-muted">
            {person.phoneTail ? `Phone ending ${person.phoneTail}` : person.email ?? "No contact"}
            {person.waitingFor && ` · waiting ${person.waitingFor}`}
          </p>
        </div>
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

function Approve() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 size={14} strokeWidth={3} className="animate-spin" />
      ) : (
        <UserRoundCheck size={14} strokeWidth={2.5} />
      )}
      Approve
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
