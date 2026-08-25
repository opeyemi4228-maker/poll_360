"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Check, Crosshair, Loader2, ScanLine, Sparkles, TriangleAlert, X } from "lucide-react";

import Button from "@/components/ui/Button";
import { fileResult, readSheetPhoto } from "@/app/field/actions";
import { validateReturn, auditSheet, EC8A_BOXES } from "@/lib/results";
import { ballotFor, raceLabel } from "@/lib/races";
import { shrinkImage, putOnInput, RESULT_SHEET } from "@/lib/shrink";
import { formatNumber } from "@/lib/utils";

/**
 * The form the whole product depends on.
 *
 * Designed for the conditions it will actually be used in: standing up, one
 * hand free, at night, on a connection that may not hold.
 *
 *   · The booth is printed, never chosen. It is not a field in this form —
 *     except on a desk account with no booth of its own, which is the one case
 *     where somebody has to be able to name one. See app/field/actions.js.
 *   · One position at a time. An agent counts five ballot papers and files
 *     five returns, and a single form with fifty boxes on it would be a form
 *     nobody finishes at 9pm with a queue still outside.
 *   · Numeric keypads on every input, and targets big enough to hit in a hurry.
 *   · The arithmetic is checked as they type, so a mistyped figure is caught
 *     while the sheet is still in their hand rather than after a round trip.
 *   · The draft is kept in the browser on every keystroke, so a dropped
 *     connection costs a retry and not the figures.
 *   · The sheet is photographed here, and the figures are checked against it
 *     on the server. Where the picture can be read confidently and disagrees,
 *     the return does not file — see app/field/actions.js. The photograph is
 *     optional; agreeing with it, once attached, is not.
 */
const DRAFT = "poll360:draft";

export default function FileResultForm({
  /* ── WHY THE ACTION IS A PROP ─────────────────────────────────────────────
     This form is now filled in by two populations who are not the same kind
     of account. A staff account files through app/field/actions.js against
     `users`; a polling unit coordinator files through app/agent/actions.js
     against their own table and their own session. The form itself is
     identical for both — same boxes, same arithmetic, same sheet check — and
     duplicating it would guarantee the two copies drifted, with the divergence
     showing up as one population quietly filing under weaker checks.

     So the action is passed in and the staff one is the default, which keeps
     every existing caller working untouched. */
  action = fileResult,
  /* ── AND SO IS THE READ ACTION, FOR THE SAME REASON ─────────────────────
     It authenticates too, against the same two different populations. The
     staff one was hardcoded here and it authenticated against `users`, so a
     polling unit coordinator — who has a session of its own and no row in
     that table — was told it was signed out and redirected to a login page,
     losing the photograph and every figure already typed. Passed in, like
     the action above, and defaulting to the staff one so existing callers
     keep working untouched. */
  readAction = readSheetPhoto,
  unitCode,
  existing,
  /* Which ballot paper these figures came off. Not a default: a form that
     guessed would file a governorship return into the presidential count and
     look entirely normal doing it. */
  race,
  /* A desk account with no booth of its own types the unit code. An agent
     never sees this field, and the server ignores it for them regardless. */
  canNameUnit = false,
  onFiled,
}) {
  /* Stable across renders: it is a dependency of the figures below, and a
     fresh array every render would recompute them every keystroke twice. */
  const ballot = useMemo(() => ballotFor(race), [race]);
  const [state, formAction] = useActionState(action, {});
  const [unit, setUnit] = useState(unitCode ?? "");
  const [figures, setFigures] = useState(() => ({
    registered: existing?.registered ?? "",
    accredited: existing?.accredited ?? "",
    rejected: existing?.rejected ?? "",
    /* The four boxes on Form EC8A that nothing used to capture. They are what
       make the sheet checkable against itself — see auditSheet in
       lib/results.js — and a return without them can only ever be taken on
       trust. */
    ballotsIssued: existing?.ballotsIssued ?? "",
    unusedBallots: existing?.unusedBallots ?? "",
    spoiled: existing?.spoiled ?? "",
    statedValid: existing?.statedValid ?? "",
    usedBallots: existing?.usedBallots ?? "",
    ...Object.fromEntries(ballot.map((p) => [p.id, existing?.votes?.[p.id] ?? ""])),
  }));

  /* Everything on the sheet that is not a number. The serial is the only field
     on the paper that can tell two booths' returns from one sheet
     photographed twice, so it is captured even though nothing counts it. */
  const [serial, setSerial] = useState(existing?.formSerial ?? "");
  const [sheetDate, setSheetDate] = useState(existing?.sheetDate ?? "");
  const [contested, setContested] = useState(
    existing?.contested === true ? "yes" : existing?.contested === false ? "no" : ""
  );
  /* Who signed, by party. Optional and folded away by default: this is the
     witness record and it matters, but an agent at 2am should not have to walk
     past eighteen name fields to reach the figures. */
  const [agents, setAgents] = useState(() => existing?.agents ?? {});
  const [showAgents, setShowAgents] = useState(false);
  const [position, setPosition] = useState({ status: "asking" });
  const [sheet, setSheet] = useState(null);
  const [shrinking, setShrinking] = useState(false);
  const sheetRef = useRef(null);

  /* What the reader made of the photograph: null before one is taken,
     `{ status: "reading" }` while it works, then the whole reading. */
  const [reading, setReading] = useState(null);

  /* Which boxes the reader filled and the agent has not since altered. Held
     apart from the figures themselves because the figures are just numbers,
     and the useful question on this screen is which of them nobody has
     checked yet. Any keystroke in a box takes it out of this set. */
  const [fromSheet, setFromSheet] = useState(() => new Set());

  /* Every edit is a human overriding a machine, so the box stops claiming to
     have been read and starts being the agent's own figure. */
  function setFigure(key, value) {
    setFigures((f) => ({ ...f, [key]: value }));
    setFromSheet((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  /* ── ONE DRAFT PER BOOTH PER POSITION ──────────────────────────────────
     Keyed by both, because an agent half way through the senate figures who
     switches to the presidential tab and back must find the senate figures
     still there. Keyed by booth alone, the second position opened would have
     restored the first one's numbers into it — a form that fills itself in
     with somebody else's count is worse than one that forgets. */
  const draftKey = `${DRAFT}:${unitCode ?? "unassigned"}:${race}`;

  /* Restore a draft left by a submission that never made it. Scheduled on the
     next frame rather than set in the effect body, so it lands as one
     asynchronous update instead of a synchronous cascading re-render. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) setFigures((current) => ({ ...current, ...JSON.parse(saved) }));
      } catch {
        /* A corrupt draft is not worth failing over; the form still works. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey]);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(figures));
    } catch {
      /* Private mode, or a full quota. The form still works. */
    }
  }, [figures, draftKey]);

  useEffect(() => {
    if (state?.ok) localStorage.removeItem(draftKey);
  }, [state, draftKey]);

  /* The filed return has to reach the screen above this one, which draws the
     five positions and which of them are in. Announced from an effect rather
     than from the action's return value directly, so it runs once per filing
     and not on every re-render that happens to still be holding it. */
  useEffect(() => {
    if (state?.ok && onFiled) onFiled(state);
  }, [state, onFiled]);

  /* Position is read once, on open, and recorded as corroboration. It never
     decides which booth this is, and refusing it never blocks the filing. */
  useEffect(() => {
    if (!navigator.geolocation) {
      const frame = requestAnimationFrame(() => setPosition({ status: "unavailable" }));
      return () => cancelAnimationFrame(frame);
    }
    navigator.geolocation.getCurrentPosition(
      (fix) =>
        setPosition({
          status: "fixed",
          lat: fix.coords.latitude,
          lon: fix.coords.longitude,
          accuracy: Math.round(fix.coords.accuracy),
        }),
      () => setPosition({ status: "refused" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  /* Object URLs are a handle on a blob the browser will otherwise keep for
     the life of the document. A form somebody re-photographs four times in bad
     light would hold four full-size bitmaps. */
  useEffect(() => {
    const url = sheet?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sheet?.url]);

  /**
   * Take the sheet, shrink it, and put it back on the input.
   *
   * Shrinking on the phone is what makes this arrive at all over a rural
   * signal at close of poll — see lib/shrink.js. Where the browser cannot
   * write to the input, the original is submitted instead: a large upload
   * beats a lost one.
   */
  async function attachSheet(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;

    setShrinking(true);
    let toRead = chosen;
    try {
      /* Kept at reading resolution, not viewing resolution. A result sheet
         is photographed so a machine can read six-digit figures off it, and
         at the size an incident photograph is sent those figures are twenty
         pixels tall and come back blank. See lib/shrink.js. */
      const shrunk = await shrinkImage(chosen, RESULT_SHEET);
      if (shrunk) {
        putOnInput(sheetRef.current, shrunk.file);
        setSheet({ url: shrunk.url, kb: shrunk.kb });
        toRead = shrunk.file;
      }
    } finally {
      setShrinking(false);
    }

    await readTheSheet(toRead);
  }

  /**
   * Send the photograph to be read and put the figures in the boxes.
   *
   * ── IT FILLS BOXES. IT DOES NOT FILE. ────────────────────────────────────
   * Everything it writes lands in an editable field above an unpressed
   * button. The agent is holding the sheet; their job is to read the figures
   * back against it and disagree where it is wrong, which is one act of
   * checking instead of eleven of transcription.
   *
   * A failure here is quiet on purpose. The boxes stay as they were, the
   * reason is shown once, and the form is exactly the form it always was —
   * a reader that cannot read must never be a reason somebody cannot file.
   */
  /** Put a reading into the boxes and remember which ones it filled. */
  function applyReading(result) {
    const filled = new Set();
    setFigures((current) => {
      const next = { ...current };
      const put = (key, value) => {
        if (value === null || value === undefined) return;
        next[key] = String(value);
        filled.add(key);
      };

      put("registered", result.figures.registered);
      put("accredited", result.figures.accredited);
      put("rejected", result.figures.rejected);
      /* The four boxes that make the sheet checkable, and the stated total
         beside the one the party rows add up to. A reader that fills the
         figures and leaves these blank hands back a return nobody can audit. */
      put("ballotsIssued", result.figures.ballotsIssued);
      put("unusedBallots", result.figures.unusedBallots);
      put("spoiled", result.figures.spoiled);
      put("statedValid", result.figures.statedValid);
      put("usedBallots", result.figures.usedBallots);
      for (const party of ballot) put(party.id, result.figures.votes?.[party.id]);
      return next;
    });

    /* Not figures, so they live outside `figures` and are set alongside it. */
    if (result.figures.formSerial) {
      setSerial(String(result.figures.formSerial));
      filled.add("formSerial");
    }
    if (result.figures.sheetDate) {
      setSheetDate(String(result.figures.sheetDate));
      filled.add("sheetDate");
    }
    if (result.figures.contested !== null && result.figures.contested !== undefined) {
      setContested(result.figures.contested ? "yes" : "no");
    }
    if (result.figures.agents && Object.keys(result.figures.agents).length) {
      setAgents((current) => ({ ...result.figures.agents, ...current }));
      /* Opened, not left folded: names the reader found are the ones most
         worth a glance before they are filed under somebody's signature. */
      setShowAgents(true);
    }

    setFromSheet(filled);
  }

  async function readTheSheet(file) {
    setReading({ status: "reading" });
    try {
      const payload = new FormData();
      payload.set("sheet", file);
      payload.set("race", race);

      const result = await readAction(null, payload);
      if (!result?.ok) {
        setReading({ status: "failed", reason: result?.reason ?? "The sheet could not be read." });
        return;
      }

      /* ── EVERY READING FILLS THE BOXES ──────────────────────────────────
         An earlier version withheld figures the server would not vouch for,
         on the reasoning that nobody re-reads a filled box as carefully as an
         empty one. That reasoning still holds and the flag that measures it —
         `result.trusted` — is still computed and still shown, because the day
         this counts a real election it should probably come back.

         It does not hold today. This is being run as a test, where a reader
         that puts nothing in the boxes is indistinguishable from a reader
         that does not work, and the figures being on screen is the entire
         thing being demonstrated. So everything read goes in, every box the
         reader filled is marked as its work rather than the agent's, and an
         untrusted reading says so in one line above the form instead of
         holding its figures back.

         To tighten it again, restore the early return here — nothing else has
         to change, because `trusted` never stopped being calculated. */
      applyReading(result);
      setReading({ status: "read", ...result });
    } catch {
      /* A dropped connection mid-read. The form still works; say so plainly. */
      setReading({ status: "failed", reason: "The sheet could not be read just now." });
    }
  }

  function dropSheet() {
    setSheet(null);
    setReading(null);
    setFromSheet(new Set());
    if (sheetRef.current) sheetRef.current.value = "";
  }

  /* An untyped box is not a zero. `auditSheet` only checks an identity when
     every box in it was actually captured, and passing 0 for a blank would
     manufacture a discrepancy out of a field nobody has reached yet. */
  const blank = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[^\d]/g, "")));

  const numbers = useMemo(() => {
    const toNumber = (v) => (v === "" ? 0 : Number(String(v).replace(/[^\d]/g, "")));
    return {
      registered: toNumber(figures.registered),
      accredited: toNumber(figures.accredited),
      rejected: toNumber(figures.rejected),
      votes: Object.fromEntries(ballot.map((p) => [p.id, toNumber(figures[p.id])])),
    };
  }, [figures, ballot]);

  const live = validateReturn(numbers);

  /* ── THE SHEET CHECKED AGAINST ITSELF, AS THE AGENT TYPES ────────────────
     Not an error and never a block: the arithmetic being checked is the
     presiding officer's, not the agent's, and the agent's job is to transcribe
     what is written even when what is written is wrong. Refusing here would
     teach them to type figures that reconcile instead of figures that are on
     the paper, which destroys the only evidence there was.

     Shown while they type because that is when the sheet is still in their
     hand: "box #8 says 556 and everything else on the page says 557" is worth
     a second look at the paper before it is put down, and worth nothing at
     all a week later. */
  const audit = useMemo(
    () =>
      auditSheet({
        ...numbers,
        spoiled: blank(figures.spoiled),
        ballotsIssued: blank(figures.ballotsIssued),
        unusedBallots: blank(figures.unusedBallots),
        usedBallots: blank(figures.usedBallots),
        statedValid: blank(figures.statedValid),
      }),
    [numbers, figures]
  );
  const touched = figures.registered !== "" || figures.accredited !== "";
  const errors = state?.errors ?? {};

  if (state?.ok) {
    return (
      <div className="border-2 border-emerald-300 bg-emerald-50 p-6">
        <Check size={26} strokeWidth={2.5} className="text-emerald-600" />
        <h3 className="mt-4 text-fluid-xl text-dash-ink">
          {state.amended
            ? `${raceLabel(state.race ?? race)} return amended`
            : `${raceLabel(state.race ?? race)} return filed`}
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-dash-muted">
          {formatNumber(state.cast)} votes recorded for {state.unitCode ?? unitCode}. It is on the
          board now and in the queue for a coordinator to check against your sheet.
          {state.sheet?.agrees && " Your photograph was read and it agrees with these figures."}
          {state.amended && " Because you changed it, it goes back to unchecked."}
        </p>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-dash-muted">
          If you counted another ballot paper at this booth, pick that position above and file it.
          Each one is a separate return.
        </p>
        <Button
          variant="dashOutline"
          size="md"
          className="mt-5"
          onClick={() => window.location.reload()}
        >
          File a correction
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Which ballot paper. Hidden rather than a control, because the control
          is the row of positions above this form: two places to change the
          same thing is how somebody files the senate figures as presidential. */}
      <input type="hidden" name="race" value={race} />

      {/* ── THE ONE CASE WHERE A BOOTH IS TYPED ─────────────────────────────
          A desk account with no booth of its own, entering a return that was
          read down the phone. An agent never sees this, and the server ignores
          anything sent in it for an account that has a booth. */}
      {canNameUnit && (
        <div>
          <label
            htmlFor="unitCode"
            className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted"
          >
            Polling unit code
          </label>
          <input
            id="unitCode"
            name="unitCode"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="01/01/04/006"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className={[
              "figure mt-2 h-14 w-full rounded-dash-sm border-2 bg-dash-card px-4 text-[1.125rem] font-bold text-dash-ink",
              "focus:outline-none",
              errors.unitCode ? "border-red-500" : "border-dash-line focus:border-dash-ink",
            ].join(" ")}
          />
          <p className="mt-2 text-[0.8125rem] text-dash-muted">
            {errors.unitCode ??
              "State, local government, ward, unit — exactly as it is printed on the sheet."}
          </p>
        </div>
      )}

      {/* ------------------------------------------------------ position */}
      <div className="flex items-start gap-3 border border-dash-line bg-dash-bg px-4 py-3">
        <Crosshair
          size={16}
          strokeWidth={2.5}
          className={position.status === "fixed" ? "mt-0.5 text-emerald-600" : "mt-0.5 text-dash-muted"}
        />
        <div className="min-w-0 text-[0.8125rem]">
          <p className="font-semibold text-dash-ink">
            {position.status === "fixed" && "Position recorded with this return"}
            {position.status === "asking" && "Reading your position…"}
            {position.status === "refused" && "Position not shared"}
            {position.status === "unavailable" && "This device cannot report a position"}
          </p>
          <p className="figure mt-1 text-dash-muted">
            {position.status === "fixed"
              ? `±${position.accuracy}m · stored beside the figures, never used to pick your booth`
              : "You can still file. It is recorded as not shared."}
          </p>
        </div>
      </div>

      {position.status === "fixed" && (
        <>
          <input type="hidden" name="lat" value={position.lat} />
          <input type="hidden" name="lon" value={position.lon} />
          <input type="hidden" name="accuracy" value={position.accuracy} />
        </>
      )}

      {/* ─────────────────────────────────────────────── the form itself */}
      {/* ── WHY THE SERIAL NUMBER IS THE FIRST THING ASKED FOR ────────────
          It is pre-printed, it is unique to one piece of paper, and it is the
          only field on an EC8A that can prove two returns came off two sheets
          rather than one sheet photographed twice. Nothing counts it; it is
          the provenance of everything below it. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Text
          name="formSerial"
          label="Form S/N"
          hint="Top right of the sheet"
          value={serial}
          onChange={setSerial}
          read={fromSheet.has("formSerial")}
        />
        <Text
          name="sheetDate"
          label="Date on the form"
          hint="As written"
          value={sheetDate}
          onChange={setSheetDate}
          read={fromSheet.has("sheetDate")}
        />
        <div>
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            The officer struck out
          </span>
          {/* Three states, not a checkbox. "Contested", "not contested" and
              "the officer left it blank" are three different facts about a
              booth, and a two-state control would file the third as the
              second — recording a certification nobody made. */}
          <div className="mt-2 flex h-16 items-stretch gap-2">
            {[
              ["no", "Not contested"],
              ["yes", "Contested"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setContested(contested === value ? "" : value)}
                aria-pressed={contested === value}
                className={[
                  "flex-1 rounded-dash-sm border-2 px-2 text-[0.8125rem] font-bold transition-colors",
                  contested === value
                    ? value === "yes"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-dash-ink bg-dash-ink text-white"
                    : "border-dash-line text-dash-muted hover:border-dash-ink",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="contested" value={contested} />
        </div>
      </div>

      {/* ──────────────────────────────────────────── the ballot papers */}
      {/* ── ALL EIGHT BOXES, IN THE ORDER THE SHEET PRINTS THEM ───────────
          The form used to ask for three of these and the paper has eight.
          The other five are not decoration: issued less unused must equal
          used, and spoiled plus rejected plus valid must equal used too, so
          together they let the sheet be checked against nothing but itself.
          Without them a presiding officer's slip is invisible to everybody
          downstream, which is the one thing this product exists to prevent.

          Read down the screen and you are reading down the paper. That is
          not tidiness — a form in a different order from the sheet in the
          agent's hand is how a figure lands one box from where it belongs. */}
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          Ballot papers · boxes 1 to 8
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Number
            name="registered"
            label="1 · On the register"
            value={figures.registered}
            onChange={(v) => setFigure("registered", v)}
            read={fromSheet.has("registered")}
          />
          <Number
            name="accredited"
            label="2 · Accredited"
            value={figures.accredited}
            onChange={(v) => setFigure("accredited", v)}
            error={live.errors.accredited}
            read={fromSheet.has("accredited")}
          />
          <Number
            name="ballotsIssued"
            label="3 · Papers issued"
            value={figures.ballotsIssued}
            onChange={(v) => setFigure("ballotsIssued", v)}
            read={fromSheet.has("ballotsIssued")}
          />
          <Number
            name="unusedBallots"
            label="4 · Unused"
            value={figures.unusedBallots}
            onChange={(v) => setFigure("unusedBallots", v)}
            read={fromSheet.has("unusedBallots")}
          />
          <Number
            name="spoiled"
            label="5 · Spoiled"
            /* Not the same as rejected, and the sheet keeps them apart for a
               reason: a spoiled paper was mismarked and swapped before it
               went in the box, so it was issued and never cast. It is exactly
               the difference between the used total and the accredited
               count, and folding the two together loses that. */
            hint="Mismarked and replaced"
            value={figures.spoiled}
            onChange={(v) => setFigure("spoiled", v)}
            read={fromSheet.has("spoiled")}
          />
          <Number
            name="rejected"
            label="6 · Rejected"
            hint="Cast, and not counted"
            value={figures.rejected}
            onChange={(v) => setFigure("rejected", v)}
            read={fromSheet.has("rejected")}
          />
          <Number
            name="statedValid"
            label="7 · Total valid"
            hint="As the sheet says"
            value={figures.statedValid}
            onChange={(v) => setFigure("statedValid", v)}
            read={fromSheet.has("statedValid")}
          />
          <Number
            name="usedBallots"
            label="8 · Total used"
            value={figures.usedBallots}
            onChange={(v) => setFigure("usedBallots", v)}
            read={fromSheet.has("usedBallots")}
          />
        </div>
      </div>

      {/* --------------------------------------------------------- votes */}
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-dash-muted">
          Votes by party · {raceLabel(race)}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {ballot.map((party) => (
            <Number
              key={party.id}
              name={`votes_${party.id}`}
              /* The bucket is spelled out. "OTH" on a form somebody is filling
                 in at a booth means nothing; "Other parties" means exactly what
                 it is, and it is the box that keeps the total honest when the
                 contest is fought by parties this product does not draw. */
              label={party.id === "OTH" ? "Other parties" : party.id}
              swatch={party.token}
              value={figures[party.id]}
              onChange={(v) => setFigure(party.id, v)}
              read={fromSheet.has(party.id)}
            />
          ))}
        </div>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          Every party on this ballot paper. Add the ones with no box of their own together into
          Other parties, so the total on the sheet and the total here are the same number.
        </p>
      </div>

      {/* ─────────────────────────────────── does the sheet add up? */}
      {audit.findings.length > 0 && (
        <div className="border-2 border-amber-400 bg-amber-50 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <TriangleAlert size={17} strokeWidth={2.5} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="text-[0.875rem] font-bold text-dash-ink">
                This sheet does not add up against itself.
              </p>
              {/* Where every failing sum points at one box, say which. It
                  turns "the arithmetic is wrong" into a sentence somebody can
                  act on without redoing it themselves. */}
              {audit.culprit && (
                <p className="mt-1 text-[0.8125rem] text-dash-ink">
                  Everything else on the page agrees. Look again at box{" "}
                  <span className="font-bold">
                    {audit.culprit} · {EC8A_BOXES[audit.culprit]}
                  </span>
                  .
                </p>
              )}
              <ul className="mt-2 space-y-1.5">
                {audit.findings.map((finding) => (
                  <li key={finding.boxes.join()} className="text-[0.8125rem] leading-relaxed text-dash-muted">
                    <span className="font-semibold text-dash-ink">{finding.says}</span>{" "}
                    {finding.why}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 border-t border-amber-300 pt-2 text-[0.75rem] leading-relaxed text-dash-muted">
                File it exactly as it is written anyway. Type what the paper
                says, not what balances — this is recorded with the return and
                shown to the desk, and correcting it here would destroy the
                only evidence that anything was wrong.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────── who signed for it */}
      {/* The witness record. Every agent who signs an EC8A is attesting to
          these figures at this booth, and their names are on the paper. A
          count that keeps the figures and throws away who stood behind them
          keeps the weaker half. Folded away because it is not the fast path. */}
      <div className="border border-dash-line bg-dash-bg px-4 py-3">
        <button
          type="button"
          onClick={() => setShowAgents((open) => !open)}
          aria-expanded={showAgents}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-[0.8125rem] font-semibold text-dash-ink">
            Polling agents who signed
            {Object.values(agents).filter(Boolean).length > 0 && (
              <span className="ml-2 font-normal text-dash-muted">
                {Object.values(agents).filter(Boolean).length} recorded
              </span>
            )}
          </span>
          <span className="text-[0.75rem] font-semibold text-dash-muted">
            {showAgents ? "Hide" : "Add"}
          </span>
        </button>

        {showAgents && (
          <div className="mt-3 grid gap-3 border-t border-dash-line pt-3 sm:grid-cols-2">
            {ballot
              .filter((party) => party.id !== "OTH")
              .map((party) => (
                <label key={party.id} className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0"
                    style={{ background: party.token }}
                  />
                  <span className="w-14 shrink-0 text-[0.75rem] font-bold text-dash-ink">
                    {party.sheet ?? party.id}
                  </span>
                  <input
                    type="text"
                    name={`agent_${party.id}`}
                    autoComplete="off"
                    placeholder="Name as signed"
                    value={agents[party.id] ?? ""}
                    onChange={(event) =>
                      setAgents((current) => ({ ...current, [party.id]: event.target.value }))
                    }
                    className="min-w-0 flex-1 rounded-dash-sm border border-dash-line bg-dash-card px-2.5 py-2 text-[0.8125rem] text-dash-ink focus:border-dash-ink focus:outline-none"
                  />
                </label>
              ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------- the result sheet */}
      <div className="border border-dash-line bg-dash-bg px-4 py-3">
        <div className="flex items-start gap-3">
          <Camera
            size={16}
            strokeWidth={2.5}
            className={sheet ? "mt-0.5 text-emerald-600" : "mt-0.5 text-dash-muted"}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-semibold text-dash-ink">
              Photograph of the result sheet
            </p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">
              {reading?.status === "read"
                ? "Read, and the figures are in the boxes above. Check each one against the sheet in your hand and change anything that is wrong."
                : sheet
                  ? "Kept with your return, so a coordinator can check it against these figures."
                  : "Photograph it first and the figures fill themselves in. You check them rather than type them."}
            </p>
          </div>
        </div>

        <input
          ref={sheetRef}
          id="sheet"
          name="sheet"
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={attachSheet}
          className="sr-only"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="dashOutline"
            size="md"
            disabled={shrinking}
            onClick={() => sheetRef.current?.click()}
          >
            {shrinking || reading?.status === "reading" ? (
              <>
                <Loader2 size={15} strokeWidth={3} className="animate-spin" />
                {shrinking ? "Preparing" : "Reading the sheet"}
              </>
            ) : (
              <>
                <Camera size={15} strokeWidth={2.5} />
                {sheet ? "Take another" : "Take a photograph"}
              </>
            )}
          </Button>

          {sheet && (
            <>
              {/* Not next/image: this is an object URL for a blob that exists
                  only in this tab, and the optimiser has no origin to fetch. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sheet.url}
                alt="The result sheet you photographed"
                className="h-14 w-14 border border-dash-line object-cover"
              />
              <span className="figure text-[0.75rem] text-dash-muted">{sheet.kb} KB</span>
              <button
                type="button"
                onClick={dropSheet}
                className="flex items-center gap-1 text-[0.75rem] font-semibold text-dash-muted underline underline-offset-2"
              >
                <X size={13} strokeWidth={2.5} />
                Remove
              </button>
            </>
          )}
        </div>

        {/* ── WHAT THE READER SAW, IN ITS OWN WORDS ──────────────────────
            Shown rather than hidden behind a confidence percentage. An agent
            deciding whether to trust a box needs to know which figures the
            machine was unsure of and what it added together, and neither of
            those is expressible as one number. */}
        <SheetReading reading={reading} />

        {/* Carries the reading the agent was shown into the filing, so what
            lands in the count is held against that and not against a second,
            differently-wrong reading of the same photograph. */}
        {reading?.status === "read" && reading.readId && (
          <input type="hidden" name="sheetReadId" value={reading.readId} />
        )}
      </div>

      {/* The running total, and the arithmetic, checked as they type. */}
      <div
        className={[
          "border-l-2 px-4 py-3",
          touched && !live.ok ? "border-red-500 bg-red-50" : "border-verified bg-dash-bg",
        ].join(" ")}
      >
        <p className="figure text-[0.9375rem] font-bold text-dash-ink">
          {formatNumber(live.cast)} votes cast
        </p>
        {touched && !live.ok ? (
          <ul className="mt-2 space-y-1">
            {Object.values(live.errors).map((message) => (
              <li key={message} className="flex gap-2 text-[0.8125rem] text-dash-ink">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-600" />
                {message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[0.8125rem] text-dash-muted">
            Votes plus rejected must not exceed accredited, and accredited must not exceed
            registered.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="note" className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted">
          Anything the checker should know <span className="text-dash-muted">optional</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          className="mt-2 w-full resize-y rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 py-2 text-[0.9375rem] text-dash-ink focus:border-dash-ink focus:outline-none"
        />
      </div>

      {/* ── WHEN THE PICTURE AND THE FIGURES DISAGREE ──────────────────────
          Given its own block rather than folded into the line below, for two
          reasons. It is the only error here that pressing the button again
          will not clear. And it has something specific to say — which figure,
          what the sheet shows, what they typed — where a red line reading
          "does not match" would send somebody back to a creased form in the
          dark with no idea which of eleven numbers to look at. */}
      {errors.sheet && (
        <div className="border-l-2 border-red-500 bg-red-50 px-4 py-3">
          <p className="flex gap-2 text-[0.875rem] font-semibold text-dash-ink">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
            This return does not match the sheet you photographed
          </p>

          {state?.mismatches?.length > 0 && (
            <ul className="figure mt-2.5 space-y-1 pl-6">
              {state.mismatches.map((item) => (
                <li key={item.field} className="text-[0.8125rem] text-dash-ink">
                  <span className="font-bold">{item.label}</span>: the sheet shows{" "}
                  {formatNumber(item.read)}, you entered {formatNumber(item.typed)}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2.5 pl-6 text-[0.8125rem] leading-relaxed text-dash-muted">
            Check the sheet and correct the figures. If you photographed a different
            unit&rsquo;s sheet, take the right one and try again.
          </p>
        </div>
      )}

      {(state?.error || errors.figures || errors.votes) && (
        <p className="flex gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-[0.875rem] text-dash-ink">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
          {state.error ?? errors.figures ?? errors.votes}
        </p>
      )}

      <Submit disabled={touched && !live.ok} amending={Boolean(existing)} />

      <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
        Saved on this device as you type. If the connection drops, the figures are still here when
        you come back.
      </p>
    </form>
  );
}

/** The reading's own account of itself: what it could not read, what it added. */
function SheetReading({ reading }) {
  if (!reading || reading.status === "reading") return null;

  if (reading.status === "failed") {
    return (
      <p className="mt-3 flex gap-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-[0.8125rem] leading-relaxed text-dash-ink">
        <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-600" />
        <span>
          {reading.reason} Type the figures in yourself — the photograph is still kept with your
          return.
        </span>
      </p>
    );
  }

  const unreadable = reading.unreadable ?? [];
  const folded = reading.folded ?? [];

  /* Whether the sheet's own totals corroborated the reading. The figures are
     in the boxes either way; this is the difference between "these add up"
     and "read them back before you send". */
  const unchecked = reading.trusted === false;

  return (
    <div
      className={[
        "mt-3 border-l-2 px-3 py-2",
        unchecked ? "border-amber-500 bg-amber-50" : "border-sky-400 bg-sky-50",
      ].join(" ")}
    >
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-dash-ink">
        {unchecked ? (
          <TriangleAlert size={14} strokeWidth={2.5} className="shrink-0 text-amber-600" />
        ) : (
          <Sparkles size={14} strokeWidth={2.5} className="shrink-0 text-sky-700" />
        )}
        {unchecked ? "Figures are in the boxes — read them back" : "Read from your photograph"}
        {reading.legibility === "poor" && (
          <span className="font-bold text-amber-700">· the picture was hard to read</span>
        )}
      </p>

      {unchecked && reading.why && (
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-ink">{reading.why}</p>
      )}

      {reading.figures?.unitCode && (
        <p className="figure mt-1 text-[0.75rem] text-dash-muted">
          Sheet says unit {reading.figures.unitCode}
          {reading.figures.repName ? ` · ${reading.figures.repName}` : ""}
        </p>
      )}

      {folded.length > 0 && (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-ink">
          <span className="font-semibold">Other parties</span> is {folded.join(" + ")} added
          together.
        </p>
      )}

      {unreadable.length > 0 && (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-ink">
          <span className="font-semibold">Check these yourself:</span> {unreadable.join(", ")}.
        </p>
      )}

      <p className="mt-2 text-[0.75rem] leading-relaxed text-dash-muted">
        Nothing is filed until you press the button. Change any figure that does not match the sheet
        in your hand.
      </p>
    </div>
  );
}

function Submit({ disabled, amending }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="xl" full disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 size={17} strokeWidth={3} className="animate-spin" />
          Sending
        </>
      ) : amending ? (
        "Amend this return"
      ) : (
        "File this return"
      )}
    </Button>
  );
}

/**
 * `read` means the reader put this number here and nobody has touched it.
 *
 * It is drawn on the box rather than announced once at the top, because the
 * question an agent has at 9pm is not "was the sheet read" but "is *this*
 * figure mine or the machine's". A colour and a word on the box answers that
 * where they are already looking; a banner does not.
 */
/** A written field: a serial number, a date as the officer wrote it. */
function Text({ name, label, hint, value, onChange, read = false }) {
  return (
    <div>
      <label htmlFor={name} className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
        {read && (
          <span className="flex items-center gap-1 font-bold tracking-normal text-sky-700 normal-case">
            <ScanLine size={11} strokeWidth={2.75} aria-hidden="true" />
            from your sheet
          </span>
        )}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        autoComplete="off"
        placeholder={hint}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          "figure mt-2 h-16 w-full rounded-dash-sm border-2 px-4 text-[1.05rem] font-bold text-dash-ink",
          "placeholder:text-[0.8125rem] placeholder:font-normal placeholder:tracking-normal",
          "focus:outline-none",
          read ? "border-sky-400 bg-sky-50 focus:border-dash-ink" : "border-dash-line bg-dash-card focus:border-dash-ink",
        ].join(" ")}
      />
    </div>
  );
}

function Number({ name, label, hint, value, onChange, error, swatch, read = false }) {
  return (
    <div>
      <label htmlFor={name} className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase flex items-center gap-2 text-dash-muted">
        {swatch && (
          <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: swatch }} />
        )}
        {label}
        {read && (
          <span className="flex items-center gap-1 font-bold text-sky-700 normal-case tracking-normal">
            <ScanLine size={11} strokeWidth={2.75} aria-hidden="true" />
            from your sheet
          </span>
        )}
      </label>
      {hint && <p className="mt-0.5 text-[0.6875rem] text-dash-muted">{hint}</p>}
      <input
        id={name}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        /* Big, monospaced and tall: this is typed with a thumb, in the dark. */
        className={[
          "figure mt-2 h-16 w-full rounded-dash-sm border-2 px-4 text-fluid-xl font-bold text-dash-ink",
          "focus:outline-none",
          error
            ? "border-red-500 bg-dash-card"
            : read
              ? "border-sky-400 bg-sky-50 focus:border-dash-ink"
              : "border-dash-line bg-dash-card focus:border-dash-ink",
        ].join(" ")}
      />
    </div>
  );
}
