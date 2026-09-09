import Link from "next/link";
import { redirect } from "next/navigation";

import AgentAuthForm from "@/components/agent/AgentAuthForm";
import CodeSignIn from "@/components/agent/CodeSignIn";
import { signInAgent, signInWithCode } from "@/app/agent/actions";
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
        With the code you were given when you signed up, or with your phone number.
      </p>

      {/* ── THE CODE FIRST ────────────────────────────────────────────────
          It is the credential an agent has on them. A password chosen three
          weeks ago at a training session is the one they have forgotten; the
          card in their pocket is the one they are holding. Both work — this is
          not a fallback, it is the shorter road. */}
      <div className="mt-8">
        <CodeSignIn action={signInWithCode} />
      </div>

      <div className="mt-10 border-t border-ink-200 pt-8">
        <h2 className="text-[0.9375rem] font-bold text-ink-950">
          Or with your phone number and password
        </h2>
        <AgentAuthForm action={signInAgent} mode="signin" />
      </div>

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
