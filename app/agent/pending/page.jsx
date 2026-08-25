import { redirect } from "next/navigation";
import { Clock, MapPin, ShieldCheck } from "lucide-react";

import { currentCoordinator } from "@/lib/coordinator-session";
import { signOutAgent } from "@/app/agent/actions";
import { STATUS } from "@/lib/coordinators";

export const metadata = { title: "Waiting for approval", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a signed-up coordinator waits.
 *
 * ── WHY THIS PAGE EXISTS AT ALL ────────────────────────────────────────────
 * The cheap version of an approval queue signs somebody up and then refuses
 * their sign-in with the same message a wrong password gets. That person now
 * believes the sign-up failed, does it again, and rings the desk on polling
 * morning. So a pending account is a real account that signs in, sees its own
 * name and its own polling unit, and one sentence saying exactly what has to
 * happen next and who has to do it.
 *
 * It also gives them something to check: the unit code they typed is printed
 * here, so somebody who fat-fingered a digit can catch it before an
 * administrator has to.
 */
export default async function AgentPendingPage() {
  const person = await currentCoordinator();
  if (!person) redirect("/agent/login");
  /* An approved account has nothing to wait for, and landing here after
     approval would read as though something had gone wrong. */
  if (person.canFile) redirect("/agent");

  const turnedAway = person.status === "DECLINED" || person.status === "SUSPENDED";

  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <span className="inline-flex size-12 items-center justify-center rounded-dash-sm border-2 border-ink-300">
        <Clock size={20} strokeWidth={2} className="text-ink-950" aria-hidden="true" />
      </span>

      <h1 className="mt-6 text-fluid-2xl text-ink-950">
        {turnedAway ? "This account is not active" : "Waiting to be approved"}
      </h1>

      <p className="mt-4 text-[0.9375rem] leading-relaxed text-content-muted">
        {turnedAway
          ? `Thank you, ${person.name.split(" ")[0]}. This account cannot file at the moment. Speak to the coordinator who appointed you — they can tell you why and put it right.`
          : `Thank you, ${person.name.split(" ")[0]}. Your details are with the administrators. Somebody who knows your ward checks the polling unit against the appointment list before your account can file anything — usually the same day.`}
      </p>

      <dl className="mt-8 divide-y divide-ink-200 border-y border-ink-200">
        <div className="flex items-start gap-4 py-5">
          <MapPin size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-content-subtle" />
          <div>
            <dt className="tag text-content-subtle">The polling unit you gave</dt>
            <dd className="figure mt-1.5 text-[1.25rem] font-bold text-ink-950">
              {person.unitCode ?? "Not given"}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-4 py-5">
          <ShieldCheck size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-content-subtle" />
          <div>
            <dt className="tag text-content-subtle">Where it stands</dt>
            <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-content-muted">
              {STATUS[person.status]?.label ?? person.status}.{" "}
              {turnedAway
                ? "Nothing you send can enter the count while it says that."
                : "Sign in again on polling day and the filing screen will be open if you have been approved. If the unit code above is wrong, tell your coordinator — it can be corrected when they approve you."}
            </dd>
          </div>
        </div>
      </dl>

      <form action={signOutAgent} className="mt-8">
        <button
          type="submit"
          className="h-12 rounded-dash-sm border-2 border-ink-300 px-5 text-[0.9375rem] font-bold text-ink-950 transition-colors hover:border-ink-950"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
