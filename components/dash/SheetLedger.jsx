import { AlertTriangle, FileWarning, Gavel, Copy } from "lucide-react";

import { auditSheet, EC8A_BOXES } from "@/lib/results";
import { formatNumber } from "@/lib/utils";

/**
 * What the result sheets themselves say.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIGURES ARE NOT THE ONLY EVIDENCE ON THE PAPER
 *
 *  A return is eighteen party rows and a total. Form EC8A is that plus eight
 *  numbered boxes that account for every piece of paper issued to the booth,
 *  a serial number, a date, the presiding officer's certification and the
 *  signatures of whoever stood there. The count needs the first part. Deciding
 *  whether to *trust* the count needs the second, and until those boxes were
 *  captured there was nothing on this screen to decide it with.
 *
 *  Three questions, and each one is answerable from the paper alone:
 *
 *    · Does the sheet add up against itself? Issued less unused must equal
 *      used; spoiled plus rejected plus valid must equal used too. A sheet
 *      that fails those has a transcription error on its face, and it is
 *      almost never in the party rows — it is in a total somebody copied.
 *
 *    · Did anyone dispute it at the booth? The officer strikes out one of
 *      "CONTESTED / NOT CONTESTED", and a contested unit is a fact no figure
 *      on the sheet carries.
 *
 *    · Has one serial number arrived twice? Serials are pre-printed and
 *      unique to a single piece of paper. Two returns quoting one serial are
 *      two booths reading the same sheet, or one sheet filed twice.
 *
 * ── WHY NONE OF THIS BLOCKS ANYTHING ──────────────────────────────────────
 *  These returns are counted. They are in every total on every other screen,
 *  and they should be: the arithmetic that failed is the presiding officer's,
 *  the agent transcribed it faithfully, and a product that drops a booth for
 *  having a slip on its form is a product that loses the booths most worth
 *  looking at. This is a reading list for a human, not a filter.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function SheetLedger({ rows = [] }) {
  /* Audited here rather than stored: the findings are a pure function of the
     boxes, and a stored copy is one that goes stale the moment a return is
     amended. Cheap enough — it is arithmetic over eight integers. */
  const audited = rows
    .map((row) => ({ row, audit: auditSheet(row) }))
    .filter(({ audit }) => !audit.balances);

  const contested = rows.filter((row) => row.contested === true);

  /* One serial, two returns. Counted across whatever was passed in, which is
     the recent window rather than the whole election — a duplicate that only
     shows up against a return filed last week is a question for the export,
     not for a card on a dashboard. */
  const serials = new Map();
  for (const row of rows) {
    if (!row.formSerial) continue;
    const seen = serials.get(row.formSerial) ?? [];
    seen.push(row);
    serials.set(row.formSerial, seen);
  }
  const repeated = [...serials.entries()].filter(([, seen]) => seen.length > 1);

  /* How much of what is on screen could be checked at all. A clean card over
     a hundred returns that carry none of these boxes is not good news, and
     saying "nothing to report" would be the wrong sentence entirely. */
  const checkable = rows.filter((row) => auditSheet(row).findings.length > 0 || hasBoxes(row)).length;

  if (rows.length === 0) {
    return (
      <p className="px-5 py-4 text-[0.875rem] text-dash-muted">
        No returns yet. Once sheets start arriving this reads their eight numbered
        boxes back against each other.
      </p>
    );
  }

  return (
    <div className="divide-y divide-dash-line">
      {/* The headline is the proportion that could be checked, not the number
          of problems. A sheet with no boxes captured produces no findings, and
          "0 findings" would read as "all well" when it means "nothing was
          looked at". */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-5 py-3.5">
        <span className="figure text-fluid-xl font-bold text-dash-ink">
          {formatNumber(checkable)}
          <span className="text-[0.875rem] font-semibold text-dash-muted">
            {" "}
            of {formatNumber(rows.length)}
          </span>
        </span>
        <span className="text-[0.8125rem] text-dash-muted">
          carry enough of Form EC8A to be checked against themselves
        </span>
      </div>

      {audited.length > 0 && (
        <Section
          icon={AlertTriangle}
          tone="amber"
          title={`${audited.length} sheet${audited.length === 1 ? "" : "s"} that do not add up`}
          lead="The figures are counted. The paper disagrees with itself, which is a question for whoever collated it."
        >
          {audited.slice(0, 8).map(({ row, audit }) => (
            <li key={row.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="figure text-[0.8125rem] font-bold text-dash-ink">
                  {row.unitCode}
                  {row.formSerial && (
                    <span className="ml-2 font-normal text-dash-muted">S/N {row.formSerial}</span>
                  )}
                </span>
                {/* Where every failing sum points at one box, name it. That is
                    the difference between "check this sheet" and "box #8 says
                    556 and the rest of the page says 557". */}
                {audit.culprit && (
                  <span className="text-[0.75rem] font-bold text-amber-700">
                    Look at {audit.culprit} · {EC8A_BOXES[audit.culprit]}
                  </span>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {audit.findings.map((finding) => (
                  <li key={finding.boxes.join()} className="text-[0.75rem] leading-relaxed text-dash-muted">
                    {finding.why}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </Section>
      )}

      {contested.length > 0 && (
        <Section
          icon={Gavel}
          tone="red"
          title={`${contested.length} booth${contested.length === 1 ? "" : "s"} certified as contested`}
          lead="The presiding officer struck out “not contested”. Somebody disputed the result where it was counted."
        >
          {contested.slice(0, 8).map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2.5">
              <span className="figure text-[0.8125rem] font-bold text-dash-ink">{row.unitCode}</span>
              <span className="text-[0.75rem] text-dash-muted">
                {row.repName ? `Presided by ${row.repName}` : "No presiding officer recorded"}
                {row.sheetDate ? ` · ${row.sheetDate}` : ""}
              </span>
            </li>
          ))}
        </Section>
      )}

      {repeated.length > 0 && (
        <Section
          icon={Copy}
          tone="red"
          title={`${repeated.length} serial number${repeated.length === 1 ? "" : "s"} filed more than once`}
          lead="A serial is pre-printed on one sheet. Two returns quoting it are two booths reading one piece of paper, or one sheet filed twice."
        >
          {repeated.slice(0, 6).map(([serial, seen]) => (
            <li key={serial} className="px-5 py-2.5">
              <span className="figure text-[0.8125rem] font-bold text-dash-ink">S/N {serial}</span>
              <span className="ml-2 text-[0.75rem] text-dash-muted">
                {seen.map((row) => row.unitCode).join(" · ")}
              </span>
            </li>
          ))}
        </Section>
      )}

      {audited.length === 0 && contested.length === 0 && repeated.length === 0 && (
        <p className="px-5 py-4 text-[0.875rem] text-dash-muted">
          {checkable === 0 ? (
            <>
              Nothing to check yet. These findings come from boxes 3, 4, 5, 7 and 8
              of Form EC8A — capture them when filing and every sheet is checked
              against itself automatically.
            </>
          ) : (
            <>
              Every sheet that could be checked adds up, none was certified as
              contested, and no serial number has arrived twice.
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** Did this return capture enough of the sheet for the arithmetic to run? */
function hasBoxes(row) {
  return (
    row.ballotsIssued !== null ||
    row.unusedBallots !== null ||
    row.usedBallots !== null ||
    row.statedValid !== null
  );
}

function Section({ icon: Icon, tone, title, lead, children }) {
  const colour = tone === "red" ? "text-red-600" : "text-amber-600";

  return (
    <div>
      <div className="flex items-start gap-2.5 px-5 pt-3.5 pb-2">
        <Icon size={15} strokeWidth={2.5} className={`mt-0.5 shrink-0 ${colour}`} aria-hidden="true" />
        <div>
          <p className="text-[0.8125rem] font-bold text-dash-ink">{title}</p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-dash-muted">{lead}</p>
        </div>
      </div>
      <ul className="divide-y divide-dash-line border-t border-dash-line">{children}</ul>
    </div>
  );
}

export { FileWarning };
