import { Check, Radio, ShieldCheck, Smartphone } from "lucide-react";

import { Section, SectionHeading } from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import { rooms } from "@/lib/content";

/**
 * Three dashboards, three completely different rooms.
 *
 * The mistake this section exists to avoid is the one every results product
 * makes: building one interface and pointing three audiences at it. An agent
 * standing in the dark with one hand free, a coordinator working a queue for
 * six hours, and a producer with ninety seconds to air do not want the same
 * screen, and pretending they do is how a system ends up unused by the person
 * whose data it depends on.
 */
const ICONS = { field: Smartphone, situation: ShieldCheck, broadcast: Radio };

export default function Rooms() {
  return (
    <Section id="rooms" className="bg-paper">
      <SectionHeading
        index={5}
        eyebrow="Who is looking at it"
        title="Three rooms, three screens"
        lead="One count, shown three ways. The agent filing the result, the coordinator checking it and the producer putting it on air are doing three different jobs under three different pressures, so they do not get the same screen."
      />

      <div className="mt-14 grid gap-px bg-ink-200 lg:grid-cols-3">
        {rooms.map((room, index) => {
          const Icon = ICONS[room.id];
          return (
            <Reveal key={room.id} delay={index * 80} className="bg-paper">
              <div className="flex h-full flex-col p-7 lg:p-9">
                <div className="flex items-center gap-3">
                  <Icon size={18} strokeWidth={2.25} className="shrink-0 text-red-500" />
                  <span className="tag text-content-subtle">{room.label}</span>
                </div>

                <h3 className="mt-6 text-fluid-xl text-ink-950">{room.title}</h3>
                <p className="mt-3 text-fluid-base leading-relaxed text-content-muted">
                  {room.lead}
                </p>

                <ul className="mt-7 space-y-3.5 border-t border-ink-200 pt-7">
                  {room.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <Check
                        size={15}
                        strokeWidth={3}
                        className="mt-0.5 shrink-0 text-red-500"
                        aria-hidden="true"
                      />
                      <span className="text-[0.875rem] leading-relaxed text-content-muted">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
