"use client";

import { PARTY_FILL } from "@/components/dash/Charts";
import PartyMark from "@/components/dash/PartyMark";
import { partyLogo } from "@/lib/party-register";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The post itself, drawn.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A PREVIEW THAT IS NOT THE POST IS A PREVIEW NOBODY TRUSTS
 *
 *  This was a black rectangle with the leader's name and a percentage on it,
 *  captioned "a sketch of the layout, not the file". A producer cannot clear a
 *  sketch. They have to see the thing that is going out — because the whole
 *  job of this desk is catching the post where the coverage figure fell off
 *  the bottom, or the party colour is wrong, or the share reads 61% next to a
 *  denominator that makes it meaningless.
 *
 *  So this draws the real card from the real figures: the parties in their own
 *  colours at their own shares, the coverage the claim rests on, the turnout,
 *  and the stamp. What you clear is what you send.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY IT IS WHITE ────────────────────────────────────────────────────────
 * The dark version looked better in the dashboard and worse everywhere it was
 * actually going. A feed is a white column on nearly every platform and in
 * light mode on all of them; a black card in that column reads as an
 * advertisement, and an election result that reads as an advertisement is one
 * people scroll past. White also survives the thing that happens to every
 * successful post — somebody screenshots it, crops it, and prints it.
 *
 * ── THE COLOUR RULES, WHICH ARE THE PRODUCT'S AND NOT THIS FILE'S ──────────
 * A party's colour follows the party and never its position: the leader is not
 * "the dark one", or the card repaints itself every time the order changes and
 * a reader who learned APC is blue is misled at the worst possible moment. Two
 * pixels of surface separate adjacent fills rather than an outline. Everything
 * carries its figure in type, so the card survives greyscale and a photocopy.
 */

/* The three shapes a platform will take, and what each one is for. Aspect is
   held by CSS rather than by a fixed pixel size so the same component draws
   the preview at 18rem and the export at 1080. */
const ASPECT = {
  wide: "aspect-[1200/675]",
  square: "aspect-square",
  story: "aspect-[1080/1920]",
};

/**
 * @param figures  a place from lib/broadcast.js: name, filed, expected,
 *                 verified, reporting, turnout, parties [{id, votes, share}]
 * @param shape    wide | square | story
 * @param format   which of the desk's formats this is standing in for
 * @param at       the moment the figures were read. Never `new Date()` in
 *                 here: a card that stamps itself at render time claims to be
 *                 current every time React happens to redraw it.
 */
export default function PostCard({
  figures,
  shape = "square",
  format = "result-card",
  headline = null,
  at = null,
  className,
}) {
  /* One layout, three densities — not three layouts, which is how the
     coverage line comes to exist on two of them and not the third. */
  const tall = shape === "story";
  const wide = shape === "wide";

  /* ── THE SAME PARTIES ON EVERY SHAPE ──────────────────────────────────
     This varied by shape at first — four bars on a square, three on a wide —
     and the wide card silently dropped a party polling 6.8%. A results card
     that omits a party because of its aspect ratio is publishing a different
     result on Facebook from the one on X, and there is no honest version of
     that. Four everywhere, and anything past four is stated as a remainder
     with its share rather than disappearing. */
  const all = figures?.parties ?? [];
  const parties = all.slice(0, 4);
  const rest = all.slice(4);
  const restShare = rest.reduce((sum, party) => sum + (party.share ?? 0), 0);
  const leader = parties[0] ?? null;
  const runnerUp = parties[1] ?? null;
  /* The margin is the story on most nights, and it is the one figure a reader
     cannot compute from two percentages without doing arithmetic in a feed. */
  const margin = leader && runnerUp ? leader.share - runnerUp.share : null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-dash-sm border border-dash-line bg-white text-dash-ink",
        ASPECT[shape] ?? ASPECT.square,
        className
      )}
    >
      {/* ─────────────────────────────────────────────────────────── the mark */}
      <div className="flex items-center justify-between gap-2 border-b border-dash-line px-[4.5%] py-[3%]">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-red-500" />
          <span className="text-[0.5rem] font-bold tracking-[0.16em] text-dash-muted uppercase sm:text-[0.5625rem]">
            Poll360 · parallel count
          </span>
        </span>
        {at && (
          <span className="figure text-[0.5rem] text-dash-muted tabular-nums sm:text-[0.5625rem]">
            {new Date(at).toLocaleTimeString("en-NG", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between px-[4.5%] py-[4%]">
        {/* ──────────────────────────────────────────────────────── the place */}
        <div>
          <p
            className={cn(
              "font-display leading-[1.05] font-extrabold tracking-[-0.03em]",
              tall ? "text-[1.5rem]" : wide ? "text-[1.75rem]" : "text-[1.375rem]"
            )}
          >
            {headline || figures?.name || "No returns yet"}
          </p>

          {/* The margin, where there is one to state. It is the sentence a
              newsroom writes anyway, so the card writes it. */}
          {margin !== null && (
            <p className="mt-0.5 text-[0.625rem] font-semibold text-dash-muted sm:text-[0.6875rem]">
              {leader.id} leads {runnerUp.id} by {formatShare(margin)}
            </p>

          )}
        </div>

        {/* ───────────────────────────────────────────────────── the standings
            Ranked horizontal bars: the form for "which of these is biggest",
            with each party in its own colour and its figure in type beside it.
            Scaled to the leader rather than to the total, so a field of small
            shares still has a shape. */}
        {parties.length > 0 ? (
          <ul className={cn("flex flex-col", tall ? "gap-2.5" : "gap-1.5")}>
            {parties.map((party) => (
              <li key={party.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {/* ── THE LOGO IS THE LABEL, WHERE THERE IS ONE ───────
                        A party with its own mark is named by it and the code
                        is dropped: "APC" beside the APC broom is the same
                        word twice, and on a card read at arm's length in a
                        feed the emblem is what people actually recognise.

                        A party with no file keeps its code in type beside its
                        colour, because a colour alone names nothing. So the
                        rows differ in what fills the label — never in whether
                        the party is identified. The slot is one height either
                        way, so the shares stay in a column.

                        Nothing is lost to a screen reader: the image carries
                        the party's full name as its alt text, which is more
                        than the three letters it replaced. */}
                    <PartyMark
                      id={party.id}
                      size={tall ? 34 : 28}
                      title={Boolean(partyLogo(party.id))}
                    />
                    {!partyLogo(party.id) && (
                      <span
                        className={cn(
                          "truncate font-bold tracking-[-0.01em]",
                          tall ? "text-[0.9375rem]" : "text-[0.8125rem]"
                        )}
                      >
                        {party.id}
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "figure leading-none font-bold tabular-nums",
                        tall ? "text-[1.25rem]" : wide ? "text-[1.125rem]" : "text-[1rem]"
                      )}
                    >
                      {formatShare(party.share)}
                    </span>
                    <span className="figure text-[0.5625rem] text-dash-muted tabular-nums">
                      {formatNumber(party.votes)}
                    </span>
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="mt-1 block h-[5px] overflow-hidden rounded-full bg-dash-bg"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${leader.share ? (party.share / leader.share) * 100 : 0}%`,
                      /* By party, never by rank. See the head of this file. */
                      background: PARTY_FILL[party.id] ?? PARTY_FILL.OTH,
                    }}
                  />
                </span>
              </li>
            ))}

            {/* Everything the card did not have room to name, named. */}
            {rest.length > 0 && (
              <li className="flex items-baseline justify-between gap-2 pt-0.5">
                <span className="text-[0.6875rem] font-semibold text-dash-muted">
                  {rest.length} {rest.length === 1 ? "other" : "others"}
                </span>
                <span className="figure text-[0.6875rem] font-bold text-dash-muted tabular-nums">
                  {formatShare(restShare)}
                </span>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-[0.75rem] text-dash-muted">
            Nothing has been filed for this contest yet.
          </p>
        )}

        {/* ────────────────────────────────────────────────────── the footing
            ── THE PART THAT MUST NEVER BE CROPPED ───────────────────────────
            A share without its denominator is a different claim from the one
            the count supports, and the failure mode this desk exists to catch
            is exactly that line falling off the bottom of a card. So it is not
            an afterthought at the foot of the flow: it sits on its own rule,
            with the coverage drawn as well as printed, and it is the last
            thing laid out rather than the first thing squeezed. */}
        <div className="mt-2 border-t border-dash-line pt-2">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.5rem] font-bold tracking-[0.12em] text-dash-muted uppercase sm:text-[0.5625rem]">
                  Booths reporting
                </span>
                <span className="figure text-[0.625rem] font-bold tabular-nums sm:text-[0.6875rem]">
                  {figures?.reporting === null || figures?.reporting === undefined
                    ? "—"
                    : formatShare(figures.reporting)}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="mt-1 block h-[4px] overflow-hidden rounded-full bg-dash-bg"
              >
                <span
                  className="block h-full rounded-full bg-dash-ink"
                  style={{ width: `${Math.min(100, figures?.reporting ?? 0)}%` }}
                />
              </span>
              <p className="figure mt-1 text-[0.5rem] text-dash-muted tabular-nums sm:text-[0.5625rem]">
                {formatNumber(figures?.filed ?? 0)}
                {figures?.expected ? ` of ${formatNumber(figures.expected)}` : ""} returns
                {figures?.verified != null ? ` · ${formatNumber(figures.verified)} verified` : ""}
              </p>
            </div>

            {/* Turnout, where the register supports one. Omitted rather than
                zeroed: a card printing 0% turnout because no register was
                captured is a card making a claim nobody made. */}
            {figures?.turnout != null && (
              <div className="shrink-0 text-right">
                <span className="block text-[0.5rem] font-bold tracking-[0.12em] text-dash-muted uppercase sm:text-[0.5625rem]">
                  Turnout
                </span>
                <span
                  className={cn(
                    "figure block leading-none font-bold tabular-nums",
                    tall ? "text-[1.125rem]" : "text-[0.9375rem]"
                  )}
                >
                  {formatShare(figures.turnout)}
                </span>
              </div>
            )}
          </div>

          <p className="mt-1.5 text-[0.5rem] leading-snug font-semibold text-dash-muted sm:text-[0.5625rem]">
            A parallel count from our own agents. Not a declaration.
          </p>
        </div>
      </div>
    </div>
  );
}
