"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, FileUp, Loader2, TriangleAlert, Upload } from "lucide-react";

import Button from "@/components/ui/Button";
import { uploadDeclared } from "@/app/gap/actions";
import { LEVELS } from "@/lib/declared";
import { formatNumber } from "@/lib/utils";

/**
 * Entering what the commission announced.
 *
 * ── BUILT FOR A COLLATION CENTRE, NOT A DATA TEAM ──────────────────────────
 * Figures arrive in whatever shape the person at the centre had to hand: a
 * spreadsheet exported to CSV, or a block of cells copied out of a browser
 * table and pasted. Both land in the same place, because a screen that
 * supported only files would be a screen somebody works around by opening
 * Excel first, at two in the morning, and that is where the transcription
 * errors come from.
 *
 * ── AND IT SHOWS WHAT IT UNDERSTOOD BEFORE IT MATTERS ──────────────────────
 * After a save it says how many rows landed, at which levels, and every line
 * it could not read with the line number. A parser that silently drops a
 * quarter of a file is worse than one that refuses it, because the count on
 * the dashboard afterwards looks perfectly reasonable.
 */
const EXAMPLE = `Code,Units,Registered,Accredited,Rejected,APC,PDP,LP,NNPP,ADC,NDC,OTH
25/07/04,18,12480,8210,96,2210,3105,2480,190,880,410,129
25/07/05,22,15900,10430,140,3020,3640,3300,220,1140,505,110`;

export default function DeclaredUpload() {
  const [state, formAction] = useActionState(uploadDeclared, {});
  const [filename, setFilename] = useState(null);
  const fileRef = useRef(null);

  return (
    <form action={formAction} className="space-y-5">
      {/* ------------------------------------------------------ a file */}
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-dash-muted">
          A spreadsheet
        </p>

        <input
          ref={fileRef}
          id="file"
          name="file"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
          onChange={(event) => setFilename(event.target.files?.[0]?.name ?? null)}
          className="sr-only"
        />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="dashOutline"
            size="md"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp size={15} strokeWidth={2.5} />
            {filename ? "Choose another" : "Choose a file"}
          </Button>
          {filename && (
            <span className="figure text-[0.8125rem] text-dash-ink">{filename}</span>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------- or paste */}
      <div>
        <label
          htmlFor="pasted"
          className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted"
        >
          Or paste the figures
        </label>
        <textarea
          id="pasted"
          name="pasted"
          rows={6}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="figure mt-2 w-full resize-y rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 py-2 text-[0.8125rem] text-dash-ink placeholder:text-dash-muted focus:border-dash-ink focus:outline-none"
        />
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-muted">
          One row per place. The first column is the code — a polling unit, a ward, a local
          government or a state — and each party has its own column. Commas, semicolons and tabs
          all work.
        </p>
      </div>

      {/* ── THE COLUMN THAT DECIDES WHETHER A COMPARISON CAN HAPPEN ────────
          Said here, plainly, and not left to be discovered later from a
          dashboard that will not compare anything. */}
      <p className="border-l-2 border-dash-line bg-dash-bg px-3 py-2.5 text-[0.8125rem] leading-relaxed text-dash-muted">
        Include a <span className="font-bold text-dash-ink">Units</span> column saying how many
        polling units each place holds, if the sheet gives it. Without it we cannot tell whether our
        agents cover a ward or a tenth of it, so the totals are not compared at all — only figures
        that could not be true at any coverage.
      </p>

      <div>
        <label
          htmlFor="note"
          className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted"
        >
          Where these came from <span className="text-dash-muted">optional</span>
        </label>
        <input
          id="note"
          name="note"
          type="text"
          autoComplete="off"
          placeholder="Read at the state collation centre, 21:40"
          className="mt-2 h-11 w-full rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 text-[0.9375rem] text-dash-ink placeholder:text-dash-muted focus:border-dash-ink focus:outline-none"
        />
      </div>

      {state?.error && (
        <p className="flex gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-[0.875rem] text-dash-ink">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
          {state.error}
        </p>
      )}

      {state?.ok && <Saved state={state} />}

      {/* Lines that could not be read, whether or not the save succeeded. A
          partial upload is the commonest outcome and the one most worth being
          specific about. */}
      {state?.problems?.length > 0 && (
        <div className="border-l-2 border-amber-500 bg-amber-50 px-4 py-3">
          <p className="text-[0.875rem] font-semibold text-dash-ink">
            {formatNumber(state.problems.length)} line
            {state.problems.length === 1 ? "" : "s"} could not be read
            {state.ok ? ". Everything else was saved." : "."}
          </p>
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {state.problems.slice(0, 25).map((problem) => (
              <li key={`${problem.line}:${problem.says}`} className="text-[0.8125rem] text-dash-ink">
                <span className="figure font-bold">Line {problem.line}</span> — {problem.says}{" "}
                <span className="text-dash-muted">{problem.why}</span>
              </li>
            ))}
          </ul>
          {state.problems.length > 25 && (
            <p className="mt-2 text-[0.8125rem] text-dash-muted">
              and {formatNumber(state.problems.length - 25)} more.
            </p>
          )}
        </div>
      )}

      <Submit />
    </form>
  );
}

function Saved({ state }) {
  const levels = Object.entries(state.totals?.byLevel ?? {});

  return (
    <div className="border-l-2 border-emerald-400 bg-emerald-50 px-4 py-3">
      <p className="flex gap-2 text-[0.875rem] font-semibold text-dash-ink">
        <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-emerald-600" />
        {formatNumber(state.written)} declared figure{state.written === 1 ? "" : "s"} saved
      </p>

      <p className="figure mt-1.5 pl-6 text-[0.8125rem] text-dash-muted">
        {levels.map(([level, count]) => `${formatNumber(count)} ${LEVELS[level]?.plural ?? level}`).join(" · ")}
        {" · "}
        {formatNumber(state.totals?.votes ?? 0)} votes
      </p>

      {/* ── ROWS THAT CONTRADICT THEMSELVES ────────────────────────────────
          A stated total that its own party figures do not add up to. Raised
          at entry rather than folded into the comparison, because it is a
          fault in the source sheet and not a difference between two counts —
          and this product has met it before, in the Kwara and Yobe rows of
          the 2023 record. */}
      {state.totals?.disagreeing?.length > 0 && (
        <div className="mt-2.5 pl-6">
          <p className="text-[0.8125rem] font-semibold text-dash-ink">
            {state.totals.disagreeing.length} of these do not add up to their own stated total:
          </p>
          <ul className="figure mt-1 space-y-0.5">
            {state.totals.disagreeing.slice(0, 8).map((row) => (
              <li key={row.key} className="text-[0.8125rem] text-dash-muted">
                {row.key} — states {formatNumber(row.stated)}, parties add to{" "}
                {formatNumber(row.adds)}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-dash-muted">
            The party figures are what gets compared. The stated total is kept beside them rather
            than replacing them, so the difference stays visible.
          </p>
        </div>
      )}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="lg" disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
          Reading
        </>
      ) : (
        <>
          <Upload size={16} strokeWidth={2.5} />
          Save these figures
        </>
      )}
    </Button>
  );
}
