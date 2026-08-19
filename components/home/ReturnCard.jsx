import { Check, Crosshair, FileImage, Lock } from "lucide-react";
import { formatNumber } from "@/lib/utils";

/**
 * One filed return, drawn as the agent's dashboard renders it.
 *
 * The hero says "from the booth to the broadcast"; this is the booth. It is
 * deliberately the *atomic* object, one sheet, one unit, one person, because
 * everything else on this page is an aggregate of it, and an aggregate is only
 * as good as the thing it aggregates.
 *
 * Illustrative: the figures are made up and the unit code is synthetic. The
 * fields, their order and the affirmations are exactly what the real form
 * captures.
 */
const VOTES = [
  { code: "APC", votes: 214, token: "var(--color-apc)" },
  { code: "PDP", votes: 168, token: "var(--color-pdp)" },
  { code: "LP", votes: 96, token: "var(--color-lp)" },
  { code: "NNPP", votes: 31, token: "var(--color-nnpp)" },
];

const CAST = VOTES.reduce((sum, row) => sum + row.votes, 0);

export default function ReturnCard({ className }) {
  return (
    <figure className={className}>
      <div className="on-board border border-board-line bg-board">
        {/* -------------------------------------------------------- header */}
        <div className="flex items-center justify-between gap-3 border-b border-board-line px-4 py-3">
          <div className="min-w-0">
            <p className="figure text-[0.8125rem] font-bold text-white">25/07/04/019</p>
            <p className="mt-0.5 truncate text-[0.75rem] text-white/50">
              Model Primary School II · Ward 04
            </p>
          </div>
          <p className="tag shrink-0 border border-white/20 px-2 py-1 text-white/70">Submitted</p>
        </div>

        {/* ------------------------------------------------------ position
            The step the whole chain of custody turns on: the booth was not
            chosen, it was resolved from the appointment, and the device's
            position is recorded as corroboration rather than as the control. */}
        <div className="flex items-start gap-3 border-b border-board-line bg-white/3 px-4 py-3">
          <Crosshair size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-verified" />
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-white">
              Position matched to the appointed unit
            </p>
            <p className="figure mt-1 text-[0.75rem] text-white/50">
              41m from the unit on file · accuracy ±8m · 18:42:07
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------- figures */}
        <dl className="grid grid-cols-3 gap-px border-b border-board-line bg-board-line">
          {[
            ["Registered", 1204],
            ["Accredited", 542],
            ["Rejected", 9],
          ].map(([label, value]) => (
            <div key={label} className="bg-board px-4 py-3">
              <dt className="tag text-white/45">{label}</dt>
              <dd className="figure mt-1 text-fluid-lg font-bold text-white">
                {formatNumber(value)}
              </dd>
            </div>
          ))}
        </dl>

        {/* --------------------------------------------------------- votes */}
        <ul className="divide-y divide-board-line">
          {VOTES.map((row) => (
            <li key={row.code} className="flex items-center gap-3 px-4 py-2.5">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0"
                style={{ background: row.token }}
              />
              <span className="figure flex-1 text-[0.8125rem] font-bold text-white">
                {row.code}
              </span>
              <span className="figure text-[0.8125rem] text-white/70">
                {formatNumber(row.votes)}
              </span>
            </li>
          ))}
        </ul>

        {/* The arithmetic, checked in the browser before it is checked again
            on the server. Cast + rejected must not exceed accredited. */}
        <div className="flex items-center gap-2 border-y border-board-line bg-white/3 px-4 py-2.5">
          <Check size={14} strokeWidth={3} className="shrink-0 text-verified" />
          <p className="text-[0.75rem] text-white/70">
            <span className="figure font-bold text-white">{formatNumber(CAST)}</span> cast +{" "}
            <span className="figure font-bold text-white">9</span> rejected ≤{" "}
            <span className="figure font-bold text-white">542</span> accredited
          </p>
        </div>

        {/* ------------------------------------------------------ evidence */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-10 shrink-0 items-center justify-center border border-white/15 bg-white/4">
            <FileImage size={16} strokeWidth={2} className="text-white/70" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-semibold text-white">Result sheet attached</p>
            <p className="figure mt-0.5 truncate text-[0.6875rem] text-white/45">
              sha256 · 9f2c41e8… · 1600px · 214KB
            </p>
          </div>
          <Lock size={13} strokeWidth={2.5} className="ml-auto shrink-0 text-white/35" />
        </div>
      </div>

      <figcaption className="mt-3 text-[0.75rem] leading-relaxed text-white/45">
        One result, as an agent files it from the booth. The figures here are made up; the fields
        and the checks are the real ones.
      </figcaption>
    </figure>
  );
}
