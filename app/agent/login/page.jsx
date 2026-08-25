import Link from "next/link";
import { redirect } from "next/navigation";

import AgentAuthForm from "@/components/agent/AgentAuthForm";
import { signInAgent } from "@/app/agent/actions";
import { currentCoordinator } from "@/lib/coordinator-session";

export const metadata = { title: "Sign in — polling unit", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a polling unit coordinator signs in.
 *
 * ── ITS OWN DOOR, NOT A TAB ON THE STAFF ONE ───────────────────────────────
 * /login speaks to newsrooms, situation rooms and administrators as well, and
 * a page addressing four audiences addresses none of them. This one says one
 * thing: file the results from your booth. There is nothing on it about
 * broadcast graphics or coverage dials, because the person reading it is
 * standing at a polling unit and none of that is theirs.
 */
export default async function AgentLoginPage() {
  /* Already signed in on this phone — which is the normal case, because the
     session lasts a month and they signed up weeks ago. Sending them to the
     form to type a password they have forgotten would be the product's own
     worst moment. */
  const person = await currentCoordinator();
  if (person) redirect(person.canFile ? "/agent" : "/agent/pending");

  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <h1 className="text-fluid-2xl text-ink-950">Sign in to file your booth</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-content-muted">
        Use the phone number you signed up with.
      </p>

      <AgentAuthForm action={signInAgent} mode="signin" />

      <p className="mt-8 border-t border-ink-200 pt-6 text-[0.9375rem] leading-relaxed text-content-muted">
        Not signed up yet?{" "}
        <Link href="/agent/join" className="font-bold text-ink-950 underline underline-offset-4">
          Sign up as a coordinator
        </Link>
        .
      </p>

      {/* The one warning worth putting on any sign-in page for an election
          product: the commonest way an account is lost is that somebody simply
          asks for the password and is given it. */}
      <p className="mt-6 rounded-dash-sm bg-ink-100 px-4 py-3.5 text-[0.8125rem] leading-relaxed text-content-muted">
        Nobody from Poll360 will ever ask you for your password — not by phone, not by SMS, not on
        WhatsApp. If somebody does, they are not us.
      </p>
    </main>
  );
}
