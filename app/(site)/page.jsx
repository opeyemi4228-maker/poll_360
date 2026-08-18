import { SectionHeading } from "@/components/ui/Section";
import Hero from "@/components/home/Hero";
import Disciplines from "@/components/home/Disciplines";
import Chain from "@/components/home/Chain";
import Rooms from "@/components/home/Rooms";
import Broadcast from "@/components/home/Broadcast";
import Levels from "@/components/home/Levels";
import Statement from "@/components/home/Statement";
import Refusals from "@/components/home/Refusals";
import StatusBoard from "@/components/home/StatusBoard";
import Access from "@/components/home/Access";
import LiveBoard from "@/components/board/LiveBoard";
import { buildBoard } from "@/lib/replay";

/**
 * The home page.
 *
 * The order is an argument, made in this sequence and no other:
 *
 *   the booth        one return, filed by one named person          (hero)
 *   the board        what 176,623 of them look like, moving         (§2)
 *   the rules        why this board can be trusted and others can't (§3)
 *   the mechanism    how a return survives the trip                 (§4)
 *   the rooms        who is reading it, and what each one needs     (§5–6)
 *   the machinery    the hierarchy and the query behind it          (§7)
 *   the claim        one sentence, in the product's own voice       (red)
 *   the refusals     what it will not do, ever                      (§8)
 *   the truth        what is built and what is not                  (§9)
 *   the ask          who it is for, and how to start                (§10)
 *
 * The board is built on the server — 90KB of projected boundary geometry and a
 * deterministic feed of returns travel in the RSC payload rather than in the
 * JavaScript bundle, so the map is in the first paint, works without
 * JavaScript, and gives hydration nothing to disagree about.
 */
export default function Home() {
  const board = buildBoard();

  return (
    <>
      <Hero />

      {/* --------------------------------------------------------- the board */}
      <section id="board" className="on-board bg-board">
        <div className="shell shell-wide section">
          <SectionHeading
            index={2}
            eyebrow="The live board"
            title="February 2023, arriving again"
            lead="Nigeria's last presidential election, replayed on the board a situation room would have watched it on. States start grey because nobody has reported from them yet, the share counted climbs, and leads change hands before they settle. Every figure is the real declared result — drag the slider to go back to any moment of the night."
            titleClassName="text-white"
          />

          <LiveBoard board={board} className="mt-12" />
        </div>
      </section>

      <Disciplines />
      <Chain />
      <Rooms />
      <Broadcast />
      <Levels />
      <Statement />
      <Refusals />
      <StatusBoard />
      <Access />
    </>
  );
}
