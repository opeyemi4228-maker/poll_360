import { Section, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import { status, STATUS_LABEL } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * Built, partial, next — stated on the home page.
 *
 * An unusual thing to publish, and the cheapest credibility on the site.
 * Everyone evaluating election infrastructure has sat through a demonstration
 * that turned out to be entirely a demonstration. A roadmap that names its own
 * gaps in public is the strongest available evidence that the rest of the page
 * is describing something that exists.
 */
const TONE = {
  built: "border-ink-950 text-ink-950",
  partial: "border-red-500 text-red-600",
  next: "border-ink-300 text-content-subtle",
};

export default function StatusBoard() {
  return (
    <Section id="status" className="bg-white">
      <SectionHeading
        index={9}
        eyebrow="Where it actually is"
        title="What is built, and what is not"
        lead="Booth to board is working today. Two things are half-done and two are still to come. You should know which is which before you put an election night on it."
      />

      <ul className="mt-14 divide-y divide-ink-200 border-y border-ink-200">
        {status.map((item, index) => (
          <Reveal as="li" key={item.label} delay={Math.min(index, 5) * 50}>
            <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-baseline sm:gap-8">
              <span
                className={cn(
                  "tag inline-flex w-fit shrink-0 items-center border px-2.5 py-1.5",
                  TONE[item.state]
                )}
              >
                {STATUS_LABEL[item.state]}
              </span>

              <div className="min-w-0 sm:flex-1">
                <h3 className="text-fluid-base font-bold text-ink-950">{item.label}</h3>
                <p className="mt-1 text-[0.875rem] leading-relaxed text-content-muted">
                  {item.note}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
