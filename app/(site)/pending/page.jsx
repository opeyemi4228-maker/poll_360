import { Clock, MapPin, ShieldCheck } from "lucide-react";

import SignOutButton from "@/components/auth/SignOutButton";
import Reveal from "@/components/ui/Reveal";
import { currentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Waiting for approval", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a signed-up coordinator waits.
 *
 * ── WHY THERE IS A PAGE FOR THIS AT ALL ────────────────────────────────────
 * The cheap version of an approval queue signs somebody up and then refuses
 * their sign-in with the same message a wrong password gets. That person now
 * believes the sign-up failed, does it again, and rings the desk on polling
 * morning. So a pending account is a real account that signs in, sees its own
 * name, its own polling unit, and one sentence saying exactly what has to
 * happen next and who has to do it.
 *
 * It also gives them something to check against: the unit code they typed is
 * printed here, so somebody who fat-fingered a digit can see it before an
 * administrator has to.
 */
export default async function PendingPage() {
  const user = await currentUser();

  if (!user) redirect("/login");
  /* An approved account has no business on this page — and landing here after
     approval, with nothing to do, would read as though something had gone
     wrong. The guard sends pending accounts here; this sends everybody else
     back to their own room. */
  if (user.status !== "PENDING") redirect("/console");

  return (
    <section className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8 lg:py-24">
      <Reveal>
        <span className="inline-flex size-12 items-center justify-center border-2 border-ink-300">
          <Clock size={20} strokeWidth={2} className="text-ink-950" aria-hidden="true" />
        </span>

        <h1 className="mt-6 text-fluid-3xl text-ink-950">Your account is waiting to be approved</h1>

        <p className="mt-4 text-[1rem] leading-relaxed text-content-muted">
          Thank you, {user.name.split(" ")[0]}. Your details are with the administrators. Somebody
          who knows your ward checks the polling unit against the appointment list before your
          account can file anything — usually the same day.
        </p>

        <dl className="mt-10 divide-y divide-ink-200 border-y border-ink-200">
          <div className="flex items-start gap-4 py-5">
            <MapPin size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-content-subtle" />
            <div>
              <dt className="tag text-content-subtle">The polling unit you gave</dt>
              <dd className="figure mt-1.5 text-[1.25rem] font-bold text-ink-950">
                {user.scope ?? "Not given"}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-4 py-5">
            <ShieldCheck size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-content-subtle" />
            <div>
              <dt className="tag text-content-subtle">What you can do now</dt>
              <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-content-muted">
                Nothing here needs doing. Sign in again on polling day and the filing screen will be
                open if you have been approved. If the unit code above is wrong, tell your
                coordinator — it can be corrected when they approve you.
              </dd>
            </div>
          </div>
        </dl>

        <div className="mt-10">
          <SignOutButton variant="outline" size="md" />
        </div>
      </Reveal>
    </section>
  );
}
