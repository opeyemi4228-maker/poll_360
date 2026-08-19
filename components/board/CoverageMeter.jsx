"use client";

import { formatNumber, formatShare } from "@/lib/utils";

/**
 * Coverage, the most important number on the board, and the one a results
 * page most often hides.
 *
 * It is set larger than the party shares beside it on purpose. A total without
 * it is not a smaller truth, it is a different claim: 38% of the vote on 9% of
 * booths and 38% on 82% of booths are not the same sentence, and a board that
 * prints only the first half has decided which one you will read.
 *
 * The second figure is states *complete*, not states leading. A place is only
 * finished when every booth in it has reported, and a room that can see how
 * many places are finished can tell the difference between a night that is
 * nearly over and a night that merely looks decided.
 */
export default function CoverageMeter({
  coverage,
  unitsReported,
  booths,
  statesComplete,
  statesTotal,
  turnout,
  className,
}) {
  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="tag text-white/55">Booths reporting</p>
          <p className="figure mt-1 text-fluid-3xl leading-none font-bold text-white">
            {formatShare(coverage)}
          </p>
        </div>
        <div className="text-right">
          <p className="tag text-white/55">States complete</p>
          <p className="figure mt-1 text-fluid-xl leading-none font-bold text-white">
            {statesComplete}
            <span className="text-white/40">/{statesTotal}</span>
          </p>
        </div>
      </div>

      {/* The track is the whole country; the fill is what has actually spoken. */}
      <div className="relative mt-4 h-3 w-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 bg-white transition-[width] duration-500 ease-out-quart"
          style={{ width: `${Math.min(100, coverage)}%` }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.75rem]">
        <div className="col-span-2 flex items-center gap-2">
          <dt className="text-white/55">Booths in</dt>
          <dd className="figure ml-auto font-bold text-white">
            {formatNumber(unitsReported)} of {formatNumber(booths)}
          </dd>
        </div>
        <div className="col-span-2 flex items-center gap-2 border-t border-white/10 pt-2">
          <dt className="text-white/55">Valid votes ÷ register so far</dt>
          <dd className="figure ml-auto font-bold text-white">{formatShare(turnout)}</dd>
        </div>
      </dl>
    </div>
  );
}
