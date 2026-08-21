import { redirect } from "next/navigation";
import { MailQuestion } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card } from "@/components/dash/DashCard";
import Button from "@/components/ui/Button";
import { currentUser } from "@/lib/session";
import { homeFor, ROLES } from "@/lib/roles";
import { site } from "@/lib/site";

export const metadata = { title: "Console", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where an account with no room yet lands.
 *
 * ── IT SHOULD ALMOST NEVER BE SEEN ─────────────────────────────────────────
 * Every role that has a room is sent straight to it, so reaching this page
 * means one specific thing: somebody has an account but has not been given a
 * job. Rather than showing them a dashboard full of panels they cannot use,
 * it says exactly that, and gives them the one useful next step.
 *
 * An empty state that explains itself beats a populated one that does not
 * work, and a viewer bounced here from a room they cannot open needs to
 * understand why, not just find themselves somewhere else.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default async function ConsolePage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  /* An account that does have a room should never be here. */
  const home = homeFor(user.role);
  if (home !== "/console") redirect(home);

  return (
    <DashLayout user={user} title="Your account">
      <div className="max-w-2xl">
        <Card title="No room assigned yet" subtitle={ROLES[user.role]?.blurb}>
          <p className="text-[0.9375rem] leading-relaxed text-dash-muted">
            You are signed in, and your account is working, but it has not been attached to a room
            yet, so there is nothing here to show you. Rooms are assigned by whoever issued your
            account: a situation room, a newsroom, an observer mission, or a ward coordinator if
            you are filing from a booth.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button href="/#board" variant="dash" size="lg">
              Watch the public board
            </Button>
            <Button
              href={`mailto:${site.contact.access}?subject=Poll360%20room%20assignment`}
              variant="dashOutline"
              size="lg"
            >
              <MailQuestion size={16} strokeWidth={2.5} />
              Ask to be assigned
            </Button>
          </div>

          <p className="mt-6 border-t border-dash-line pt-5 text-[0.8125rem] leading-relaxed text-dash-muted">
            If you were sent here after trying to open a dashboard, that room is not one this
            account may enter. That is the guard doing its job rather than a fault, every attempt
            is recorded, and an administrator can widen your access if it should have been allowed.
          </p>
        </Card>
      </div>
    </DashLayout>
  );
}
