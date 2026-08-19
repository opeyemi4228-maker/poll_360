import { ArrowRight } from "lucide-react";

import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/Section";

/**
 * The broadcast section.
 *
 * Most results platforms treat air as an export problem, a CSV a producer
 * pastes into a template twenty minutes before a bulletin. Poll360 treats the
 * rendered frame as a first-class output: a URL a vision mixer can point at,
 * that updates itself, and that carries its own coverage and timestamp burnt
 * into the frame so a screenshot cannot outlive its context.
 *
 * The mock below is built from the same tokens as the live board, same red,
 * same mono figures, same rule weights, so what a station sees on air is
 * recognisably the same instrument as what the situation room is reading.
 */
/* The declared national shares of the 2023 presidential election, so the
   mock on this page and the board above it are showing the same real result. */
const PARTY_ROWS = [
  { code: "APC", share: "36.6%", token: "var(--color-apc)", width: "36.6%" },
  { code: "PDP", share: "29.1%", token: "var(--color-pdp)", width: "29.1%" },
  { code: "LP", share: "25.4%", token: "var(--color-lp)", width: "25.4%" },
  { code: "NNPP", share: "6.2%", token: "var(--color-nnpp)", width: "6.2%" },
];

const FEATURES = [
  ["A link, not a file", "Point your gallery software at a web address. Full HD, and a see-through background if you need one."],
  ["Context built in", "How much is counted and the time are part of the picture, not a caption somebody forgets to add."],
  ["It updates itself", "The graphic redraws as results land. Nobody re-exports anything halfway through a bulletin."],
  ["A call you can defend", "Too early, too close, leaning, decided. How much is counted comes first, the size of the lead second."],
];

export default function Broadcast() {
  return (
    <section id="broadcast" className="on-dark relative overflow-hidden bg-blue-900">
      <div aria-hidden="true" className="board-grid absolute inset-0 opacity-[0.14]" />

      <div className="shell shell-wide relative section">
        <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div className="min-w-0">
            <SectionHeading
              index={6}
              eyebrow="On air"
              title="Graphics you can put straight on air"
              lead="Not a dashboard somebody screen-grabs at 2am. A finished picture that keeps itself up to date and says how much is counted in every shot."
              titleClassName="text-white"
            />

            <dl className="mt-12 space-y-7">
              {FEATURES.map(([term, description], index) => (
                <Reveal key={term} delay={index * 60}>
                  <dt className="text-fluid-base font-bold text-white">{term}</dt>
                  <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-white/65">
                    {description}
                  </dd>
                </Reveal>
              ))}
            </dl>

            <Reveal delay={280}>
              <Button href="#access" variant="inverse" size="lg" className="mt-12">
                Talk to us about your bulletin
                <ArrowRight size={16} strokeWidth={3} />
              </Button>
            </Reveal>
          </div>

          {/* ------------------------------------------------- the frame */}
          <Reveal delay={140} className="min-w-0">
            <figure>
              <div className="relative aspect-video w-full overflow-hidden border border-white/15 bg-ink-950">
                {/* Stand-in for programme video, so the graphics are judged
                    the way they will be seen: over a moving picture, not on
                    a clean background. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.12),transparent_55%)]"
                />
                <div aria-hidden="true" className="board-grid absolute inset-0 opacity-30" />

                {/* Coverage badge, top right, the part that must never be
                    croppable from the shot. */}
                <div className="absolute top-3 right-3 flex items-center gap-2 bg-ink-950/85 px-2.5 py-1.5 backdrop-blur-sm sm:top-4 sm:right-4">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-white" />
                  <span className="figure text-[0.5rem] font-bold tracking-wider text-white uppercase sm:text-[0.625rem]">
                    62.4% of booths counted · 21:04
                  </span>
                </div>

                {/* Lower third */}
                <div className="absolute inset-x-0 bottom-0">
                  <div className="flex items-stretch">
                    {/* Brand blue rather than brand red on this block: LP's
                        red is a bar six pixels to the right of it, and two
                        reds meaning two things in one frame is how a viewer
                        learns to distrust both. */}
                    <div className="flex items-center bg-blue-700 px-2.5 py-1.5 sm:px-4 sm:py-2.5">
                      <span className="figure text-[0.5rem] leading-tight font-bold tracking-wider text-white uppercase sm:text-[0.6875rem]">
                        Presidential
                        <br />
                        National
                      </span>
                    </div>

                    <div className="flex-1 bg-ink-950/92 px-2.5 py-1.5 backdrop-blur-sm sm:px-4 sm:py-2.5">
                      <ul className="space-y-1 sm:space-y-1.5">
                        {PARTY_ROWS.map((row) => (
                          <li key={row.code} className="flex items-center gap-2 sm:gap-3">
                            <span className="figure w-8 shrink-0 text-[0.5rem] font-bold text-white sm:text-[0.6875rem]">
                              {row.code}
                            </span>
                            <span className="h-1.5 flex-1 bg-white/10 sm:h-2">
                              <span
                                className="block h-full"
                                style={{ width: row.width, background: row.token }}
                              />
                            </span>
                            <span className="figure w-8 shrink-0 text-right text-[0.5rem] font-bold text-white sm:text-[0.6875rem]">
                              {row.share}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <figcaption className="mt-3 text-[0.75rem] leading-relaxed text-white/45">
                An example graphic at full HD, over a stand-in for your programme picture. The
                shares are the declared 2023 presidential result.
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
