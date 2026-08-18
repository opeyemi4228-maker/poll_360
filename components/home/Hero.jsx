import { ArrowDown, ArrowRight } from "lucide-react";

import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import ReturnCard from "./ReturnCard";
import { register } from "@/lib/site";
import { formatNumber } from "@/lib/utils";

/**
 * The hero.
 *
 * One flat block of brand colour, one claim set as large as the page will
 * carry, one thing to do. The Labour construction, and it works for the same
 * reason theirs does: nothing on the screen competes with the sentence.
 *
 * The headline runs the full width rather than sitting in a column beside the
 * illustration. At display size it is 1,200px of type — put that in a 55%
 * column and it wraps to four ragged lines and stops being a headline. Full
 * width it is two lines, and the supporting material hangs underneath it.
 *
 * The illustration is deliberately *one return* rather than the map. The
 * headline is a journey — booth to broadcast — so the hero shows the booth and
 * the section immediately below shows the broadcast. Leading with the map
 * would spend the product's best moment before the argument for it is made.
 */
const FACTS = [
  ["Polling units", register.pollingUnits],
  ["Wards", register.wards],
  ["LGAs", register.lgas],
  ["States + FCT", register.states],
];

export default function Hero() {
  return (
    <section className="on-dark relative overflow-hidden bg-blue-950">
      {/* Graph-paper wash: the instrument texture, kept far enough back that
          it reads as surface rather than as decoration. */}
      <div aria-hidden="true" className="board-grid absolute inset-0 opacity-[0.18]" />

      <div className="shell shell-wide relative pt-14 pb-16 lg:pt-20 lg:pb-24">
        <Reveal>
          <p className="eyebrow text-white/70">
            <span className="text-red-400">01</span>
            Parallel vote tabulation · Nigeria
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-8 text-fluid-6xl text-white">
            From the booth
            <br />
            to the broadcast<span className="text-red-500">.</span>
          </h1>
        </Reveal>

        <Reveal delay={160} className="mt-12">
          <div className="rule" />
        </Reveal>

        <div className="mt-12 grid items-start gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div className="min-w-0">
            <Reveal delay={200}>
              <p className="prose-body text-white/75">
                One trained agent in every polling unit. A photo of the result sheet behind every
                number. And the share of booths counted shown beside every total — so you always
                know how much of the country you are actually looking at.
              </p>
            </Reveal>

            <Reveal delay={260}>
              {/* Three doors, in the order a stranger needs them: look at the
                  thing, ask for it, or sign in if you already have it. Only
                  the first is in the act colour. */}
              <div className="mt-9 flex flex-wrap gap-3">
                <Button href="#board" variant="primary" size="lg">
                  See the live board
                  <ArrowDown size={16} strokeWidth={3} />
                </Button>
                <Button href="#access" variant="inverse" size="lg">
                  Request access
                  <ArrowRight size={16} strokeWidth={3} />
                </Button>
                <Button href="/login" variant="inverseOutline" size="lg">
                  Log in
                </Button>
              </div>
            </Reveal>

            {/* The register this is sized against. Structural facts, not
                achievements — which is why they are set as a ruled row and not
                as four boastful cards. */}
            <Reveal delay={320}>
              <dl className="mt-12 grid grid-cols-2 gap-px border border-white/12 bg-white/12 sm:grid-cols-4">
                {FACTS.map(([label, value]) => (
                  <div key={label} className="bg-blue-950 px-4 py-4">
                    <dt className="tag text-white/50">{label}</dt>
                    <dd className="figure mt-1.5 text-fluid-lg leading-none font-bold text-white">
                      {formatNumber(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal delay={380}>
              <p className="mt-6 text-[0.75rem] leading-relaxed text-white/45">
                Poll360 is not an electoral commission and publishes no official result. The
                figures are what our agents reported from the booths they were standing in.
              </p>
            </Reveal>
          </div>

          <Reveal delay={240} className="min-w-0">
            <ReturnCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
