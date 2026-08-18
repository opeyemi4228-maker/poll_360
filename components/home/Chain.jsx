import { Section, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import { chain } from "@/lib/content";

/**
 * The chain of custody, in the order it happens.
 *
 * Set as a numbered editorial list rather than as a flow diagram with arrows:
 * seven boxes joined by chevrons is a picture of a process, while a numbered
 * list with the technical detail printed against each step is the process. The
 * left rule carries the eye down the sequence and costs nothing to render on a
 * phone, where a horizontal diagram would have to be scrolled sideways.
 */
export default function Chain() {
  return (
    <Section id="chain" className="bg-white">
      <SectionHeading
        index={4}
        eyebrow="How a result travels"
        title="Seven steps from a booth to a screen"
        lead="Each step is a place a count can go wrong. Each one is closed by the software itself, rather than by a rule in a handbook nobody opens on election night."
      />

      <ol className="mt-14 grid gap-px bg-ink-200 lg:grid-cols-2">
        {chain.map((step, index) => (
          <Reveal as="li" key={step.step} delay={(index % 2) * 80} className="bg-white">
            <div className="flex h-full gap-5 p-7 lg:gap-7 lg:p-9">
              <span className="figure shrink-0 text-fluid-xl leading-none font-bold text-red-500">
                {step.step}
              </span>

              <div className="min-w-0">
                <h3 className="text-fluid-lg text-ink-950">{step.title}</h3>
                <p className="mt-3 text-fluid-base leading-relaxed text-content-muted">
                  {step.body}
                </p>
                <p className="tag mt-5 inline-block border border-ink-200 px-2.5 py-1.5 text-content-subtle">
                  {step.detail}
                </p>
              </div>
            </div>
          </Reveal>
        ))}

        {/* Seven steps into two columns leaves one cell empty, and an empty
            cell in a `gap-px` grid is a grey rectangle rather than nothing.
            This fills it with the section's own ground. */}
        {chain.length % 2 === 1 && (
          <li aria-hidden="true" className="hidden bg-white lg:block" />
        )}
      </ol>
    </Section>
  );
}
