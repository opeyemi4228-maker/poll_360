import { PARTY_FILL } from "@/lib/party-fill";
import { partyById, partyLogo } from "@/lib/party-register";
import { cn } from "@/lib/utils";

/**
 * A party, as a mark.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE SLOT ON EVERY ROW, AND EVERY PARTY FILLS IT
 *
 *  Four of the nineteen parties in the register have a logo file — APC, PDP,
 *  LP and ADC. Those four are named by it: the emblem is what a reader
 *  recognises at arm's length in a feed, and "APC" printed beside the APC
 *  broom is the same word twice. The other fifteen are named by their code, in
 *  type, on a block of their own colour.
 *
 *  The important part is what does *not* vary: the slot. It is one size on
 *  every row, so a card mixing emblems and colour blocks still reads as one
 *  list with its shares in a column, rather than as the parties this product
 *  treats properly and the ones it does not. That distinction is not cosmetic
 *  on an election night, under an organisation's name.
 *
 *  Nothing is lost to a screen reader either way: a logo carries the party's
 *  full name as its alt text, which is more than the three letters it stands
 *  in for.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE COLOUR BLOCK IS FINISHED RATHER THAN EMPTY ─────────────────────
 * The same position public/people/README.md takes about a missing portrait: a
 * party drawn as a solid block of its own colour with its code on it is a
 * complete way to show a party, not a gap where an image should be. Most of
 * this product's charts identify parties exactly that way already. A file
 * arriving later is an improvement, never a repair.
 *
 * ── THE COLOUR IS STILL THE PARTY'S, EVEN BEHIND A LOGO ────────────────────
 * A logo names the party in the label; it does not take over the encoding.
 * The bar beside it is still drawn in that party's own colour, bound to the
 * party and never to its rank — so a reader who learned APC is blue is not
 * misled the night ADC leads it. See lib/party-fill.js.
 *
 * ── AND WHY IT IS A PLAIN <img> ────────────────────────────────────────────
 * next/image would want a loader, a size and a build step, and this component
 * is drawn inside cards that are rendered to a file on the server for
 * broadcast. A logo is 40KB and the slot is 24 to 44 pixels: there is nothing
 * for an optimiser to win, and a great deal for it to break.
 */
export default function PartyMark({ id, size = 28, className, title = true }) {
  const party = partyById(id);
  const code = party?.id ?? String(id ?? "").toUpperCase();
  const logo = partyLogo(code);
  const fill = PARTY_FILL[code] ?? PARTY_FILL.OTH;

  /* ── THE CODE IS NEVER TRUNCATED, AND SOMETIMES NOT DRAWN ─────────────
     This slotted the code to four characters so it would fit, which turned
     Accord into "ACCO" on a result card. A mangled party name is worse than
     no party name: one is a gap the reader fills correctly from the label
     beside it, the other is a word going out under the organisation's name
     that is not the party's.

     So the type scales to the longest code instead, and below the size at
     which even the smallest step is legible the mark is simply the party's
     colour. That is not a loss — every caller that draws this small prints
     the code in type immediately beside it, which is why it can afford to. */
  const room = Math.floor(size / Math.max(3, code.length));
  const label = room >= 6;
  const type = room >= 11 ? "0.6875rem" : room >= 8 ? "0.625rem" : "0.5rem";

  return (
    <span
      title={title ? (party?.name ?? code) : undefined}
      className={cn(
        /* A hairline and a radius on both branches. Both logo files carry
           their own full-bleed background — APC's green and blue panels, ADC's
           solid green, the PDP's and Labour's white discs — so without a
           boundary they bleed into a white card and stop reading as a
           badge. */
        "flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-black/10",
        className
      )}
      style={{ width: size, height: size, background: logo ? "#ffffff" : fill }}
    >
      {logo ? (
        /* eslint-disable-next-line @next/next/no-img-element -- see the note
           at the head of this file: these are drawn into server-rendered
           broadcast files, where next/image cannot help and can break. */
        <img
          src={logo}
          alt={party?.name ?? code}
          width={size}
          height={size}
          /* Contain, never cover: the files are 300×270, 330×302 and two at
             320×320, and cropping a party's mark to a square cuts the broom
             off the top of one of them. */
          className="size-full object-contain"
        />
      ) : label ? (
        <span
          aria-hidden="true"
          className="px-px font-bold tracking-[-0.02em] text-white"
          style={{ fontSize: type }}
        >
          {code}
        </span>
      ) : null}
    </span>
  );
}
