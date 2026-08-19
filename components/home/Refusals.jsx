import { Section, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import { refusals } from "@/lib/content";

/**
 * What the system will not do.
 *
 * The most persuasive section on the page, and the hardest to copy. Anyone can
 * add a feature; a refusal has to be built into the schema and then lived with
 * for the whole life of the product. Each of these is a constraint somebody
 * will eventually ask to have relaxed at 11pm, which is precisely why they
 * are written down in public first.
 */
export default function Refusals() {
  return (
    <Section id="integrity" className="bg-paper">
      <SectionHeading
        index={8}
        eyebrow="Our rules"
        title="Six things this system will not do"
        lead="These are not policies in a document somewhere. They are built into how the software works, so nobody can quietly set them aside on the night."
      />

      <ul className="mt-14 grid gap-px bg-ink-200 md:grid-cols-2 xl:grid-cols-3">
        {refusals.map((item, index) => (
          <Reveal as="li" key={item.title} delay={(index % 3) * 70} className="bg-paper">
            <div className="h-full border-t-2 border-red-500 p-7 lg:p-8">
              <h3 className="text-fluid-lg text-ink-950">{item.title}</h3>
              <p className="mt-3.5 text-[0.9375rem] leading-relaxed text-content-muted">
                {item.body}
              </p>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
