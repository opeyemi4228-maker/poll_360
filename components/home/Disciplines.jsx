import { Section, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import { disciplines } from "@/lib/content";

/**
 * The four rules the product will not trade away.
 *
 * Placed immediately after the board, while the visitor still has the map in
 * their eye, because each rule is visible in what they just watched: the grey
 * states, the coverage figure above the standings, the sheet behind the
 * return, the declared-figure column held apart.
 */
export default function Disciplines() {
  return (
    <Section id="discipline" className="bg-paper">
      <SectionHeading
        index={3}
        eyebrow="What we will not get wrong"
        title="Four rules, and they are not settings"
        lead="Every results system has to make these four choices. Most make them quietly, on the night, under pressure to show a cleaner map. We make them in public, and we build them in so nobody can switch them off at 11pm."
      />

      <ol className="mt-14 grid gap-px bg-ink-200 md:grid-cols-2">
        {disciplines.map((rule, index) => (
          <Reveal as="li" key={rule.id} delay={index * 70} className="bg-paper">
            <div className="flex h-full flex-col p-7 lg:p-9">
              <span className="figure text-fluid-2xl leading-none font-bold text-ink-300">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-fluid-xl text-ink-950">{rule.title}</h3>
              <p className="mt-4 text-fluid-base leading-relaxed text-content-muted">{rule.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
