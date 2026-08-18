import Reveal from "@/components/ui/Reveal";

/**
 * The one place the product speaks in its own voice.
 *
 * A full-bleed block of brand red with a single sentence set in the editorial
 * serif — the only appearance of that face on the page, which is exactly what
 * makes it worth reading. The Labour construction: flat colour, no image, no
 * ornament, nothing to look at but the claim.
 *
 * It is placed after the hierarchy table on purpose. The reader has just been
 * shown the machinery; this is what the machinery is for.
 */
export default function Statement() {
  return (
    <section className="bg-red-500">
      <div className="shell shell-wide py-20 lg:py-28">
        <Reveal>
          <blockquote className="max-w-[22ch] font-editorial text-fluid-5xl leading-[0.98] tracking-[-0.02em] text-white sm:max-w-[26ch]">
            A number without its coverage is not a smaller truth. It is a different claim.
          </blockquote>
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-10 max-w-2xl border-t border-white/30 pt-6 text-fluid-base leading-relaxed text-white/85">
            Every total we show — on the wall, in the studio, in what you download — arrives with
            the share of booths it came from attached to it. Not in a tooltip. Not in a footnote.
            Right beside the number, in the same frame, at a size you can read across a room.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
