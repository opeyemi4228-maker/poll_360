import { Section, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import { levels } from "@/lib/content";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The six levels.
 *
 * Two things are true at once here and the table exists to show both: this is
 * the results hierarchy, and it is also the organisation chart. The person who
 * files a return holds the seat at the bottom of it. That is why the last row
 * is the loud one, every figure at the five levels above is an aggregate of
 * one person doing one job at a booth.
 */
export default function Levels() {
  return (
    <Section id="levels" className="bg-white">
      <SectionHeading
        index={7}
        eyebrow="The structure"
        title="Six levels, and one of them does the work"
        lead="This is how Nigeria's results add up, top to bottom. Every figure at the five levels above is made out of one person, at one booth, filing one result, which is why the bottom row is the loud one."
      />

      <Reveal className="mt-14">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <caption className="sr-only">
              The six levels a result is read at, how many there are of each, and who reports.
            </caption>
            <thead>
              <tr className="border-y-2 border-ink-950">
                <th scope="col" className="tag py-3.5 pr-4 font-semibold text-content-subtle">
                  Level
                </th>
                <th scope="col" className="tag py-3.5 pr-4 font-semibold text-content-subtle">
                  Name
                </th>
                <th scope="col" className="tag py-3.5 pr-4 font-semibold text-content-subtle">
                  What it covers
                </th>
                <th scope="col" className="tag py-3.5 pr-4 text-right font-semibold text-content-subtle">
                  Units
                </th>
                <th scope="col" className="tag py-3.5 font-semibold text-content-subtle">
                  Who reports
                </th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr
                  key={level.rank}
                  className={cn(
                    "border-b border-ink-200",
                    level.emphasis && "bg-ink-50 border-b-2 border-ink-950"
                  )}
                >
                  <td className="figure py-4 pr-4 text-[0.8125rem] text-content-subtle">
                    {String(level.rank).padStart(2, "0")}
                  </td>
                  <th
                    scope="row"
                    className={cn(
                      "py-4 pr-4 font-display font-extrabold tracking-tight whitespace-nowrap",
                      level.emphasis ? "text-fluid-lg text-ink-950" : "text-fluid-base text-ink-950"
                    )}
                  >
                    {level.emphasis && (
                      <span aria-hidden="true" className="mr-2.5 inline-block h-3.5 w-1 bg-red-500 align-baseline" />
                    )}
                    {level.tier}
                  </th>
                  <td className="py-4 pr-4 text-[0.875rem] text-content-muted">{level.scope}</td>
                  <td
                    className={cn(
                      "figure py-4 pr-4 text-right whitespace-nowrap",
                      level.emphasis
                        ? "text-fluid-lg font-bold text-ink-950"
                        : "text-[0.9375rem] text-ink-950"
                    )}
                  >
                    {formatNumber(level.units)}
                  </td>
                  <td
                    className={cn(
                      "py-4 text-[0.875rem] whitespace-nowrap",
                      level.emphasis ? "font-bold text-red-600" : "text-content-subtle"
                    )}
                  >
                    {level.seat}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal delay={100}>
        <p className="mt-6 text-[0.8125rem] text-content-subtle">
          Includes the 56,737 polling units added in 2021. One agent per booth, one result per
          booth, and a correction updates that result rather than adding a second one.
        </p>
      </Reveal>
    </Section>
  );
}
