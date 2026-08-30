import { LogIn } from "lucide-react";

import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import AccessForm from "./AccessForm";
import { allPlaces } from "@/lib/constituencies";
import { RACES } from "@/lib/races";
import { site } from "@/lib/site";

/**
 * The ask, and the way in.
 *
 * Agents, coordinators and producers already working an election land here to
 * sign in; everyone else lands here to ask for an account. Both are on the same
 * block, with the sign-in first, because on the night the person arriving is
 * far more likely to be someone who already has a login than someone browsing.
 *
 * The four audiences are listed because setting up differs sharply between
 * them: a broadcaster needs frames and an embargo, an observer mission needs
 * downloads and boundaries, and pretending one setup fits both wastes the first
 * meeting.
 */
const AUDIENCES = [
  ["Situation rooms", "Party and coalition rooms running their own agents in the field"],
  ["Broadcasters", "Newsrooms and studios that need graphics with the count attached"],
  ["Observer missions", "Local and international observers who need their own downloads"],
  ["Campaigns", "Candidates who want to know what their own agents actually saw"],
];

export default function Access() {
  /* ── READ HERE, BECAUSE ONLY A SERVER CAN ────────────────────────────────
     `allPlaces` reads the state, district and local government tables off
     disk, so it cannot run in the browser, and the form that needs them is a
     client component. It goes down with the page for the same reason the
     coordinators' sign-up form's state list does: the moment the second
     dropdown is needed is the moment somebody has just answered the first,
     and a list that arrives after that is a list that was empty when it was
     looked at. */
  const places = allPlaces();

  return (
    <section id="access" className="on-dark relative overflow-hidden bg-blue-900">
      <div aria-hidden="true" className="board-grid absolute inset-0 opacity-[0.14]" />

      <div className="shell shell-wide relative section">
        <div className="rule" />

        <div className="grid gap-14 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div className="min-w-0">
            <Reveal>
              <p className="eyebrow text-white/70">
                <span className="text-red-400">10</span>
                Request access
              </p>
            </Reveal>

            <Reveal delay={70}>
              <h2 className="mt-6 text-fluid-4xl text-white">
                Bring us the election you have to cover
              </h2>
            </Reveal>

            <Reveal delay={140}>
              <p className="prose-body mt-6 text-white/75">
                Tell us the contest, the date, and roughly how many polling units you can put a
                named agent in. We will tell you honestly what Poll360 will do for that night, what
                it will not, and what it takes to set up. Already working an election with us? Log
                in and pick up where your room left off.
              </p>
            </Reveal>

            <Reveal delay={210}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button href="/login" variant="inverse" size="lg">
                  <LogIn size={16} strokeWidth={2.75} />
                  I already have an account
                </Button>
              </div>
            </Reveal>

            <Reveal delay={260}>
              <dl className="mt-12 grid gap-px border border-white/15 bg-white/15">
                {AUDIENCES.map(([term, description]) => (
                  <div key={term} className="bg-blue-900 px-6 py-5">
                    <dt className="text-fluid-base font-bold text-white">{term}</dt>
                    <dd className="mt-1 text-[0.875rem] leading-relaxed text-white/60">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal delay={300}>
              <p className="mt-8 text-[0.8125rem] leading-relaxed text-white/50">
                Accounts are issued to named people by the room they work for, never signed up for
                in public. Prefer email? Write to{" "}
                <a
                  href={`mailto:${site.contact.access}`}
                  className="font-semibold text-white underline underline-offset-4 transition-colors hover:text-red-400"
                >
                  {site.contact.access}
                </a>{" "}
                and a person will answer you.
              </p>
            </Reveal>
          </div>

          <Reveal delay={160} className="min-w-0">
            <AccessForm
              places={places}
              races={RACES.map((race) => ({ id: race.id, label: race.label }))}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
