import { Camera, Check, PenLine, Stamp, TriangleAlert, User } from "lucide-react";

import { OBSERVED, certification } from "@/lib/certification";
import { cn } from "@/lib/utils";

/**
 * Who certified this sheet, and what the photograph could show of it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE OFFICER'S NAME WAS BEING READ AND NOT SHOWN
 *
 *  The reader has extracted the presiding officer's name for a long time. The
 *  agent's screen printed it appended to the unit code after a middle dot,
 *  with no label — "Sheet says unit 01/01/04/006 · A. Bello" — so it read as
 *  part of the code and nobody could find it. Signature and stamp were not
 *  drawn at all.
 *
 *  This is the block that shows all four: the name, the signature, the stamp,
 *  and whether any figure was altered. It is the certification, which is the
 *  thing that makes a result sheet evidence rather than a photograph of some
 *  numbers.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THREE STATES, DRAWN AS THREE THINGS ────────────────────────────────────
 * Present, absent and unclear are not two states and a fallback. They are
 * three different sentences:
 *
 *   present   the sheet carries it
 *   absent    the sheet plainly does not — a finding about a document
 *   unclear   this photograph could not show it — a finding about a camera
 *
 * The third is drawn in the muted tone with a camera on it, never in a warning
 * colour, and its words ask for another picture rather than reporting a
 * failure. An agent whose thumb covered the corner of the sheet must not be
 * shown something that looks like an accusation against the officer who signed
 * it — see the head of lib/certification.js.
 */

const TONE = {
  [OBSERVED.PRESENT]: {
    icon: Check,
    className: "text-ok-700",
    dot: "bg-ok-500",
  },
  [OBSERVED.ABSENT]: {
    icon: TriangleAlert,
    className: "text-red-700",
    dot: "bg-red-500",
  },
  [OBSERVED.UNCLEAR]: {
    /* A camera, not a warning triangle. This is a fact about the picture. */
    icon: Camera,
    className: "text-dash-muted",
    dot: "bg-dash-line",
  },
};

/** What each observation is called, in each of its states. */
const WORDS = {
  signature: {
    icon: PenLine,
    label: "Signature",
    [OBSERVED.PRESENT]: "signed",
    [OBSERVED.ABSENT]: "no signature on the sheet",
    [OBSERVED.UNCLEAR]: "not visible in this photograph",
  },
  stamp: {
    icon: Stamp,
    label: "Official stamp",
    [OBSERVED.PRESENT]: "stamped",
    [OBSERVED.ABSENT]: "no stamp on the sheet",
    [OBSERVED.UNCLEAR]: "not visible in this photograph",
  },
};

/* Alteration reads the other way round — "none" is the good state — so it gets
   its own table rather than being bent into the one above. */
const ALTERED = {
  none: { state: OBSERVED.PRESENT, says: "no figure altered" },
  altered: { state: OBSERVED.ABSENT, says: "a figure was written over or struck through" },
  unclear: { state: OBSERVED.UNCLEAR, says: "could not be judged from this photograph" },
};

/**
 * @param reading  anything carrying `certification` and `repName` — a reading
 *                 straight off the reader, or a stored result row.
 * @param compact  one line rather than a block, for a list.
 */
export default function Certification({ reading, compact = false, className }) {
  const seen = certification(reading ?? {});

  /* ── THE NAME, AND WHAT ITS ABSENCE MEANS ───────────────────────────────
     Three different sentences again, and the middle one is the only finding.
     A name nobody could read is a photograph problem; an empty box is a sheet
     that identifies nobody as answerable for its figures. */
  const officer =
    seen.officerName === "written" && seen.officer
      ? seen.officer
      : seen.officerName === "blank"
        ? "name box is empty on this sheet"
        : "could not be read from this photograph";

  const named = seen.officerName === "written" && Boolean(seen.officer);

  if (compact) {
    return (
      <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
        <span className="flex items-center gap-1.5">
          <User size={13} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
          <span
            className={cn(
              "text-[0.75rem]",
              named ? "font-semibold text-dash-ink" : "text-dash-muted italic"
            )}
          >
            {officer}
          </span>
        </span>
        <Pip what="signature" state={seen.signature} />
        <Pip what="stamp" state={seen.stamp} />
      </span>
    );
  }

  return (
    <section
      className={cn("rounded-dash-sm border border-dash-line bg-dash-card p-3", className)}
    >
      <h4 className="text-[0.625rem] font-bold tracking-[0.12em] text-dash-muted uppercase">
        Certification
      </h4>

      {/* ── THE NAME, WITH A LABEL ────────────────────────────────────────
          Labelled "Presiding officer" in full. The version this replaces
          appended it to the unit code after a middle dot and it read as part
          of the code — which is why nobody could find it. */}
      <div className="mt-2 flex items-start gap-2">
        <User size={15} strokeWidth={2.25} className="mt-0.5 shrink-0 text-dash-muted" />
        <div className="min-w-0">
          <p className="text-[0.625rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
            Presiding officer
          </p>
          <p
            className={cn(
              "text-[0.9375rem] leading-tight",
              named ? "font-bold text-dash-ink" : "text-dash-muted italic"
            )}
          >
            {officer}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-dash-line pt-2.5">
        <Row what="signature" state={seen.signature} />
        <Row what="stamp" state={seen.stamp} />
        <Row
          what="alteration"
          state={ALTERED[seen.alteration]?.state ?? OBSERVED.UNCLEAR}
          label="Figures"
          says={ALTERED[seen.alteration]?.says ?? ALTERED.unclear.says}
        />
      </ul>

      {/* ── THE ONE SENTENCE THIS BLOCK MUST NEVER LEAVE OUT ──────────────
          Shown only where there is actually a finding to caveat. A sheet that
          is signed, stamped and unaltered needs no note about coercion, and
          printing one on every reading is how a caveat stops being read.

          Where there is a finding, it is not optional: the paper cannot
          distinguish an officer who did something from one who was made to,
          and a screen that shows the first without saying so is inviting a
          conclusion the evidence does not support. */}
      {!seen.certified && seen.legible && (
        <p className="mt-2.5 border-t border-dash-line pt-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          This describes the document, not the officer. Nothing on a sheet shows
          whether something was done deliberately, under pressure, or under threat.
        </p>
      )}

      {!seen.legible && (
        <p className="mt-2.5 border-t border-dash-line pt-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          Photograph the whole sheet, including the foot, if you can. Nothing here is a
          finding about the officer — only about what this picture could show.
        </p>
      )}
    </section>
  );
}

/** One observation, as a row. */
function Row({ what, state, label = null, says = null }) {
  const words = WORDS[what];
  const tone = TONE[state] ?? TONE[OBSERVED.UNCLEAR];
  const Icon = words?.icon ?? tone.icon;
  const Mark = tone.icon;

  return (
    <li className="flex items-center gap-2">
      <Icon size={14} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
      <span className="text-[0.75rem] font-semibold text-dash-ink">
        {label ?? words.label}
      </span>
      <span className={cn("ml-auto flex items-center gap-1.5 text-[0.75rem]", tone.className)}>
        <Mark size={13} strokeWidth={2.5} className="shrink-0" />
        {says ?? words[state]}
      </span>
    </li>
  );
}

/** The same thing at a glance, for a list row. */
function Pip({ what, state }) {
  const words = WORDS[what];
  const tone = TONE[state] ?? TONE[OBSERVED.UNCLEAR];

  return (
    <span
      title={`${words.label}: ${words[state]}`}
      className={cn("flex items-center gap-1 text-[0.6875rem]", tone.className)}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone.dot)} />
      {words.label.toLowerCase()}
      <span className="sr-only">: {words[state]}</span>
    </span>
  );
}
