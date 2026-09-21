"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Camera,
  Check,
  Crosshair,
  Loader2,
  PenLine,
  ScanLine,
  Sparkles,
  Stamp,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";

import Button from "@/components/ui/Button";
import { fileResult, readSheetPhoto } from "@/app/field/actions";
import { OBSERVED, certification } from "@/lib/certification";
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
 * ══════════════════════════════════════════════════════════════════════════
 *  UPLOAD FIRST, THEN CONFIRM
 *
 *  The screen opens on one thing: the upload box. The sheet is photographed,
 *  read, and only then do the boxes appear — party votes, the eight ballot
 *  paper boxes, the presiding officer with the signature and stamp, and the
 *  party agents who signed — already filled from the photograph, each marked
 *  as the reader's work until the agent touches it. The agent's job becomes
 *  one act of checking against the paper in their hand instead of thirty of
 *  transcription.
 *
 *  A reader that cannot read must never be a reason somebody cannot file, so
 *  "type the figures in yourself" is always one tap away, and a failed read
 *  offers it straight away.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   · The booth is printed, never chosen — except on a desk account with no
 *     booth of its own. See app/field/actions.js.
 *   · One position at a time; the position is chosen on the screen above.
 *   · Numeric keypads on every input, and targets big enough to hit in a hurry.
 *   · The arithmetic is checked as they type.
 *   · The draft is kept in the browser on every keystroke, so a dropped
 *     connection costs a retry and not the figures.
 *   · The figures are checked against the photograph on the server. Where the
 *     picture can be read confidently and disagrees, the return does not file.
 */
const DRAFT = "poll360:draft";

export default function FileResultForm({
  /* ── WHY THE ACTIONS ARE PROPS ────────────────────────────────────────────
     Two populations fill this in: staff accounts through app/field/actions.js
     against `users`, and polling unit agents through app/agent/actions.js
     against their own table and session. The form is identical for both, so
     it is shared, and each passes the actions that authenticate it. The staff
     ones are the defaults, which keeps every existing caller working. */
  action = fileResult,
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
  const ballot = useMemo(() => ballotFor(race), [race]);
  const [state, formAction] = useActionState(action, {});
  const [unit, setUnit] = useState(unitCode ?? "");
  const [figures, setFigures] = useState(() => ({
    registered: existing?.registered ?? "",
    accredited: existing?.accredited ?? "",
    rejected: existing?.rejected ?? "",
    /* The boxes on Form EC8A that make the sheet checkable against itself —
       see auditSheet in lib/results.js. */
    ballotsIssued: existing?.ballotsIssued ?? "",
    unusedBallots: existing?.unusedBallots ?? "",
    spoiled: existing?.spoiled ?? "",
    statedValid: existing?.statedValid ?? "",
    usedBallots: existing?.usedBallots ?? "",
    ...Object.fromEntries(ballot.map((p) => [p.id, existing?.votes?.[p.id] ?? ""])),
  }));

  /* Everything on the sheet that is not a number. */
  const [serial, setSerial] = useState(existing?.formSerial ?? "");
  const [sheetDate, setSheetDate] = useState(existing?.sheetDate ?? "");
  const [repName, setRepName] = useState(existing?.repName ?? "");
  const [contested, setContested] = useState(
    existing?.contested === true ? "yes" : existing?.contested === false ? "no" : ""
  );
  const [agents, setAgents] = useState(() => existing?.agents ?? {});
  const [showAgents, setShowAgents] = useState(false);
  const [position, setPosition] = useState({ status: "asking" });
  const [sheet, setSheet] = useState(null);
  const [shrinking, setShrinking] = useState(false);
  const sheetRef = useRef(null);

  /* What the reader made of the photograph: null before one is taken,
     `{ status: "reading" }` while it works, then the whole reading. */
  const [reading, setReading] = useState(null);

  /* The agent chose to type the figures rather than photograph the sheet, or
     a draft with figures in it was restored. Either way the boxes show. */
  const [manual, setManual] = useState(false);

  /* Which boxes the reader filled and the agent has not since altered. Any
     keystroke in a box takes it out of this set. */
  const [fromSheet, setFromSheet] = useState(() => new Set());

  function setFigure(key, value) {
    setFigures((f) => ({ ...f, [key]: value }));
    untouch(key);
  }

  function untouch(key) {
    setFromSheet((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  /* ── ONE DRAFT PER BOOTH PER POSITION ──────────────────────────────────
     Keyed by both, so an agent half way through the senate figures who
     switches to the presidential and back finds the senate figures still
     there, and never finds them in the presidential boxes. */
  const draftKey = `${DRAFT}:${unitCode ?? "unassigned"}:${race}`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(draftKey);
        if (!saved) return;
        const draft = JSON.parse(saved);
        setFigures((current) => ({ ...current, ...draft }));
        /* A draft with figures in it is work somebody started. Hiding it
           behind the upload box would look like it had been lost. */
        if (Object.values(draft).some((value) => value !== "" && value !== null && value !== undefined)) {
          setManual(true);
        }
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

  /* The filed return reaches the screen above, which ticks the position. */
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

  /* Object URLs hold a blob for the life of the document unless released. */
  useEffect(() => {
    const url = sheet?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sheet?.url]);

  /**
   * Take the sheet, shrink it, put it back on the input, and read it.
   *
   * Kept at reading resolution, not viewing resolution: a result sheet is
   * photographed so a machine can read six-digit figures off it. See
   * lib/shrink.js. Where the browser cannot write to the input, the original
   * is submitted instead: a large upload beats a lost one.
   */
  async function attachSheet(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;

    setShrinking(true);
    let toRead = chosen;
    try {
      const shrunk = await shrinkImage(chosen, RESULT_SHEET);
      if (shrunk) {
        putOnInput(sheetRef.current, shrunk.file);
        setSheet({ url: shrunk.url, kb: shrunk.kb });
        toRead = shrunk.file;
      } else {
        setSheet({ url: URL.createObjectURL(chosen), kb: Math.round(chosen.size / 1024) });
      }
    } finally {
      setShrinking(false);
    }

    await readTheSheet(toRead);
  }

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
      put("ballotsIssued", result.figures.ballotsIssued);
      put("unusedBallots", result.figures.unusedBallots);
      put("spoiled", result.figures.spoiled);
      put("statedValid", result.figures.statedValid);
      put("usedBallots", result.figures.usedBallots);
      for (const party of ballot) put(party.id, result.figures.votes?.[party.id]);
      return next;
    });

    if (result.figures.formSerial) {
      setSerial(String(result.figures.formSerial));
      filled.add("formSerial");
    }
    if (result.figures.sheetDate) {
      setSheetDate(String(result.figures.sheetDate));
      filled.add("sheetDate");
    }
    if (result.figures.repName) {
      setRepName(String(result.figures.repName));
      filled.add("repName");
    }
    if (result.figures.contested !== null && result.figures.contested !== undefined) {
      setContested(result.figures.contested ? "yes" : "no");
    }
    if (result.figures.agents && Object.keys(result.figures.agents).length) {
      setAgents((current) => ({ ...result.figures.agents, ...current }));
      /* Opened, not folded: names the reader found are the ones most worth a
         glance before they are filed under somebody's signature. */
      setShowAgents(true);
      for (const id of Object.keys(result.figures.agents)) filled.add(`agent_${id}`);
    }

    setFromSheet(filled);
  }

  /**
   * Send the photograph to be read and put what it says in the boxes.
   *
   * ── IT FILLS BOXES. IT DOES NOT FILE. ────────────────────────────────────
   * Everything it writes lands in an editable field above an unpressed
   * button. Every reading fills the boxes — the `trusted` flag is still
   * computed and shown, so a reading the sheet's own arithmetic does not
   * corroborate says so in one line above the figures.
   */
  async function readTheSheet(file) {
    setReading({ status: "reading" });
    try {
      const payload = new FormData();
      payload.set("sheet", file);
      payload.set("race", race);
      /* Where the photograph was taken, so the sheet's custody carries it. */
      if (position.status === "fixed") {
        payload.set("lat", String(position.lat));
        payload.set("lon", String(position.lon));
        payload.set("accuracy", String(position.accuracy));
      }

      const result = await readAction(null, payload);
      if (!result?.ok) {
        setReading({ status: "failed", reason: result?.reason ?? "The sheet could not be read." });
        return;
      }

      applyReading(result);
      setReading({ status: "read", ...result });
    } catch {
      setReading({ status: "failed", reason: "The sheet could not be read just now." });
    }
  }

  function dropSheet() {
    setSheet(null);
    setReading(null);
    setFromSheet(new Set());
    /* The boxes stay open with whatever is in them. Removing a photo is not a
       request to throw the figures away. */
    setManual(true);
    if (sheetRef.current) sheetRef.current.value = "";
  }

  /* An untyped box is not a zero. */
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
     Never a block: the arithmetic being checked is the presiding officer's,
     and the agent's job is to transcribe what is written even when what is
     written is wrong. */
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

  const busy = shrinking || reading?.status === "reading";
  const read = reading?.status === "read";
  /* The boxes appear once there is something to confirm. */
  const open = read || manual || Boolean(existing);
  const seen = read ? certification(reading.figures ?? {}) : null;
  const signedAgents = Object.values(agents).filter((name) => String(name ?? "").trim()).length;

  if (state?.ok) {
    return (
      <div className="border-2 border-ok-300 bg-ok-50 p-6">
        <Check size={26} strokeWidth={2.5} className="text-ok-600" />
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
        <Button variant="dashOutline" size="md" className="mt-5" onClick={() => window.location.reload()}>
          File a correction
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Which ballot paper. Hidden, because the control is the row of
          positions above this form. */}
      <input type="hidden" name="race" value={race} />

      {/* The photograph travels with the return, so its input lives outside
          both steps and survives the switch from one to the other. */}
      <input
        ref={sheetRef}
        id={`sheet-${race}`}
        name="sheet"
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={attachSheet}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {canNameUnit && (
        <div>
          <label
            htmlFor="unitCode"
            className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
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
            {errors.unitCode ?? "State, local government, ward, unit — exactly as it is printed on the sheet."}
          </p>
        </div>
      )}

      {!open ? (
        /* ══════════════════════════════════════════════ STEP 1 · UPLOAD */
        <div className="rounded-dash border-2 border-dashed border-dash-line bg-dash-bg px-5 py-8 text-center sm:px-8">
          {busy ? (
            <div aria-live="polite">
              {sheet && (
                /* eslint-disable-next-line @next/next/no-img-element --
                   An object URL for a blob in this tab; nothing to optimise. */
                <img
                  src={sheet.url}
                  alt="The result sheet you photographed"
                  className="mx-auto h-44 w-auto max-w-full rounded-dash-sm border border-dash-line object-contain"
                />
              )}
              <p className="mt-4 flex items-center justify-center gap-2 text-[1rem] font-bold text-dash-ink">
                <Loader2 size={18} strokeWidth={3} className="animate-spin" aria-hidden="true" />
                {shrinking ? "Preparing your photo" : "Reading the sheet"}
              </p>
              <p className="mt-1 text-[0.875rem] text-dash-muted">
                This takes a few seconds. Keep this screen open.
              </p>
            </div>
          ) : (
            <>
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-dash-ink text-white">
                <ScanLine size={26} strokeWidth={2.25} aria-hidden="true" />
              </span>
              <h4 className="mt-4 text-fluid-lg font-bold text-dash-ink">
                Upload the {raceLabel(race)} result sheet
              </h4>
              <p className="mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed text-dash-muted">
                Lay the sheet flat in good light and fit the whole page in the photo. The votes, the
                presiding officer and the party agents are read off it for you to check.
              </p>

              {reading?.status === "failed" && (
                <p
                  role="alert"
                  className="mx-auto mt-4 flex max-w-md gap-2 border-l-2 border-flag-500 bg-flag-50 px-3 py-2.5 text-left text-[0.875rem] leading-relaxed text-dash-ink"
                >
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-flag-600" aria-hidden="true" />
                  <span>
                    {reading.reason} Try a clearer photo, or type the figures in yourself.
                  </span>
                </p>
              )}

              <div className="mt-6 flex flex-col items-center gap-3">
                <Button type="button" variant="dash" size="xl" onClick={() => sheetRef.current?.click()}>
                  <Camera size={18} strokeWidth={2.5} />
                  {reading?.status === "failed" ? "Take another photo" : "Take a photo of the sheet"}
                </Button>
                <button
                  type="button"
                  onClick={() => setManual(true)}
                  className="min-h-11 px-2 text-[0.875rem] font-semibold text-dash-muted underline underline-offset-4 hover:text-dash-ink"
                >
                  {reading?.status === "failed" ? "Type the figures in yourself" : "No photo? Type the figures in yourself"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ═════════════════════════════════════════════ STEP 2 · CONFIRM */
        <>
          {/* ── THE PHOTOGRAPH, AND WHAT THE READER MADE OF IT ───────────── */}
          <section className="border border-dash-line bg-dash-bg p-4">
            <div className="flex items-start gap-4">
              {sheet ? (
                /* eslint-disable-next-line @next/next/no-img-element --
                   An object URL for a blob in this tab; nothing to optimise. */
                <img
                  src={sheet.url}
                  alt="The result sheet you photographed"
                  className="h-24 w-[4.5rem] shrink-0 border border-dash-line object-cover"
                />
              ) : (
                <span className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center border border-dashed border-dash-line text-dash-muted">
                  <Camera size={20} aria-hidden="true" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-dash-ink">
                  {read && <Sparkles size={15} strokeWidth={2.5} className="shrink-0 text-blue-700" aria-hidden="true" />}
                  {busy ? "Reading the sheet…" : read ? "Read from your photo" : sheet ? "Photo attached" : "No photo attached"}
                </p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">
                  {read
                    ? "Every blue box was filled from the sheet. Check each one against the paper in your hand and change anything that is wrong."
                    : sheet
                      ? "Kept with your return, so a coordinator can check it against these figures."
                      : "Add a photo of the sheet so these figures can be checked against it."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="dashOutline"
                    size="md"
                    disabled={busy}
                    onClick={() => sheetRef.current?.click()}
                  >
                    {busy ? (
                      <>
                        <Loader2 size={15} strokeWidth={3} className="animate-spin" />
                        {shrinking ? "Preparing" : "Reading"}
                      </>
                    ) : (
                      <>
                        <Camera size={15} strokeWidth={2.5} />
                        {sheet ? "Take another" : "Take a photo"}
                      </>
                    )}
                  </Button>
                  {sheet && (
                    <button
                      type="button"
                      onClick={dropSheet}
                      className="flex min-h-10 items-center gap-1 px-2 text-[0.8125rem] font-semibold text-dash-muted underline underline-offset-2"
                    >
                      <X size={13} strokeWidth={2.5} />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <SheetReading reading={reading} />

            {/* Carries the reading the agent was shown into the filing, so the
                count is held against that and not a second reading. */}
            {read && reading.readId && <input type="hidden" name="sheetReadId" value={reading.readId} />}
          </section>

          {/* ── VOTES BY PARTY ────────────────────────────────────────────── */}
          <section>
            <Heading
              title={`Votes by party · ${raceLabel(race)}`}
              aside={`${formatNumber(live.cast)} votes`}
            />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {ballot.map((party) => (
                <Number
                  key={party.id}
                  name={`votes_${party.id}`}
                  label={party.id === "OTH" ? "Other parties" : party.id}
                  swatch={party.token}
                  value={figures[party.id]}
                  onChange={(v) => setFigure(party.id, v)}
                  read={fromSheet.has(party.id)}
                />
              ))}
            </div>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
              Every party on this ballot paper. Add the ones with no box of their own together into Other
              parties, so the total on the sheet and the total here are the same number.
            </p>
          </section>

          {/* ── THE EIGHT BOXES, IN THE ORDER THE SHEET PRINTS THEM ───────── */}
          <section>
            <Heading title="Ballot papers · boxes 1 to 8" />
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Number name="registered" label="1 · On the register" value={figures.registered} onChange={(v) => setFigure("registered", v)} read={fromSheet.has("registered")} />
              <Number name="accredited" label="2 · Accredited" value={figures.accredited} onChange={(v) => setFigure("accredited", v)} error={live.errors.accredited} read={fromSheet.has("accredited")} />
              <Number name="ballotsIssued" label="3 · Papers issued" value={figures.ballotsIssued} onChange={(v) => setFigure("ballotsIssued", v)} read={fromSheet.has("ballotsIssued")} />
              <Number name="unusedBallots" label="4 · Unused" value={figures.unusedBallots} onChange={(v) => setFigure("unusedBallots", v)} read={fromSheet.has("unusedBallots")} />
              <Number name="spoiled" label="5 · Spoiled" hint="Mismarked and replaced" value={figures.spoiled} onChange={(v) => setFigure("spoiled", v)} read={fromSheet.has("spoiled")} />
              <Number name="rejected" label="6 · Rejected" hint="Cast, and not counted" value={figures.rejected} onChange={(v) => setFigure("rejected", v)} read={fromSheet.has("rejected")} />
              <Number name="statedValid" label="7 · Total valid" hint="As the sheet says" value={figures.statedValid} onChange={(v) => setFigure("statedValid", v)} read={fromSheet.has("statedValid")} />
              <Number name="usedBallots" label="8 · Total used" value={figures.usedBallots} onChange={(v) => setFigure("usedBallots", v)} read={fromSheet.has("usedBallots")} />
            </div>
          </section>

          {/* ── DOES THE SHEET ADD UP? ────────────────────────────────────── */}
          {audit.findings.length > 0 && (
            <div className="border-2 border-flag-400 bg-flag-50 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <TriangleAlert size={17} strokeWidth={2.5} className="mt-0.5 shrink-0 text-flag-700" />
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-bold text-dash-ink">This sheet does not add up against itself.</p>
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
                        <span className="font-semibold text-dash-ink">{finding.says}</span> {finding.why}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 border-t border-flag-300 pt-2 text-[0.75rem] leading-relaxed text-dash-muted">
                    File it exactly as it is written anyway. Type what the paper says, not what balances —
                    correcting it here would destroy the only evidence that anything was wrong.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── THE PRESIDING OFFICER, AND WHAT CERTIFIES THE SHEET ───────── */}
          <section className="border border-dash-line bg-dash-card p-4">
            <Heading icon={UserRound} title="Presiding officer" />

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Text
                name="repName"
                label="Name as written"
                hint="At the foot of the sheet"
                value={repName}
                onChange={(v) => {
                  setRepName(v);
                  untouch("repName");
                }}
                read={fromSheet.has("repName")}
                plain
              />
              <div>
                <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                  What the photo shows
                </span>
                {seen ? (
                  <ul className="mt-2 space-y-2">
                    <Mark icon={PenLine} state={seen.signature} present="Signed by the presiding officer" absent="No signature on the sheet" />
                    <Mark icon={Stamp} state={seen.stamp} present="Official stamp on the sheet" absent="No stamp on the sheet" />
                  </ul>
                ) : (
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-muted">
                    The signature and stamp are checked when a photo of the sheet is read.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 border-t border-dash-line pt-4 sm:grid-cols-3">
              <Text name="formSerial" label="Form S/N" hint="Top right of the sheet" value={serial} onChange={(v) => { setSerial(v); untouch("formSerial"); }} read={fromSheet.has("formSerial")} />
              <Text name="sheetDate" label="Date on the form" hint="As written" value={sheetDate} onChange={(v) => { setSheetDate(v); untouch("sheetDate"); }} read={fromSheet.has("sheetDate")} />
              <div>
                <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                  The officer struck out
                </span>
                {/* Three states, not a checkbox: contested, not contested, and
                    left blank are three different facts about a booth. */}
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
          </section>

          {/* ── THE PARTY AGENTS WHO SIGNED ───────────────────────────────── */}
          <section className="border border-dash-line bg-dash-bg px-4 py-3">
            <button
              type="button"
              onClick={() => setShowAgents((isOpen) => !isOpen)}
              aria-expanded={showAgents}
              className="flex min-h-10 w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2 text-[0.875rem] font-bold text-dash-ink">
                <Users size={16} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                Party agents who signed
                {signedAgents > 0 && (
                  <span className="font-semibold text-dash-muted">· {signedAgents} recorded</span>
                )}
              </span>
              <span className="text-[0.8125rem] font-semibold text-dash-muted">{showAgents ? "Hide" : "Show"}</span>
            </button>

            {showAgents && (
              <div className="mt-3 grid gap-3 border-t border-dash-line pt-3 sm:grid-cols-2">
                {ballot
                  .filter((party) => party.id !== "OTH")
                  .map((party) => {
                    const fromPhoto = fromSheet.has(`agent_${party.id}`);
                    return (
                      <label key={party.id} className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: party.token }} />
                        <span className="w-14 shrink-0 text-[0.75rem] font-bold text-dash-ink">{party.sheet ?? party.id}</span>
                        <input
                          type="text"
                          name={`agent_${party.id}`}
                          autoComplete="off"
                          placeholder="Name as signed"
                          value={agents[party.id] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setAgents((current) => ({ ...current, [party.id]: value }));
                            untouch(`agent_${party.id}`);
                          }}
                          className={[
                            "min-h-11 min-w-0 flex-1 rounded-dash-sm border px-2.5 py-2 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none",
                            fromPhoto ? "border-blue-400 bg-blue-50" : "border-dash-line bg-dash-card",
                          ].join(" ")}
                        />
                      </label>
                    );
                  })}
              </div>
            )}
          </section>

          {/* ── WHERE THE AGENT IS ────────────────────────────────────────── */}
          <div className="flex items-start gap-3 border border-dash-line bg-dash-bg px-4 py-3">
            <Crosshair
              size={16}
              strokeWidth={2.5}
              className={position.status === "fixed" ? "mt-0.5 text-ok-600" : "mt-0.5 text-dash-muted"}
            />
            <div className="min-w-0 text-[0.8125rem]">
              <p className="font-semibold text-dash-ink">
                {position.status === "fixed" && "Your location is recorded with this return"}
                {position.status === "asking" && "Finding your location…"}
                {position.status === "refused" && "Location not shared"}
                {position.status === "unavailable" && "This device cannot report a location"}
              </p>
              <p className="figure mt-1 text-dash-muted">
                {position.status === "fixed"
                  ? `±${position.accuracy}m · kept beside the figures, never used to pick your unit`
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

          {/* The running total, and the arithmetic, checked as they type. */}
          <div
            className={[
              "border-l-2 px-4 py-3",
              touched && !live.ok ? "border-red-500 bg-red-50" : "border-verified bg-dash-bg",
            ].join(" ")}
          >
            <p className="figure text-[0.9375rem] font-bold text-dash-ink">{formatNumber(live.cast)} votes cast</p>
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
                Votes plus rejected must not exceed accredited, and accredited must not exceed registered.
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`note-${race}`} className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              Anything the checker should know <span className="text-dash-muted">optional</span>
            </label>
            <textarea
              id={`note-${race}`}
              name="note"
              rows={2}
              className="mt-2 w-full resize-y rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 py-2 text-[0.9375rem] text-dash-ink focus:border-dash-ink focus:outline-none"
            />
          </div>

          {/* ── WHEN THE PICTURE AND THE FIGURES DISAGREE ──────────────────
              Its own block: the only error here that pressing the button again
              will not clear, and it says which figure, what the sheet shows
              and what was typed. */}
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
                      <span className="font-bold">{item.label}</span>: the sheet shows {formatNumber(item.read)}, you
                      entered {formatNumber(item.typed)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2.5 pl-6 text-[0.8125rem] leading-relaxed text-dash-muted">
                Check the sheet and correct the figures. If you photographed a different unit&rsquo;s sheet, take
                the right one and try again.
              </p>
            </div>
          )}

          {(state?.error || errors.figures || errors.votes) && (
            <p className="flex gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-[0.875rem] text-dash-ink">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
              {state.error ?? errors.figures ?? errors.votes}
            </p>
          )}

          <Submit disabled={busy || (touched && !live.ok)} amending={Boolean(existing)} />

          <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
            Saved on this device as you type. If the connection drops, the figures are still here when you come
            back.
          </p>
        </>
      )}
    </form>
  );
}

/** A section title, with an optional figure on the right. */
function Heading({ icon: Icon, title, aside }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {Icon && <Icon size={14} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />}
        {title}
      </p>
      {aside && <p className="figure text-[0.8125rem] font-bold text-dash-ink">{aside}</p>}
    </div>
  );
}

/**
 * A signature or a stamp, in the three states a photograph can support.
 *
 * "Absent" is shown only when the reader said so of a clearly visible sheet —
 * see lib/certification.js — because it is a finding about a named official.
 * Everything short of that is a finding about the camera.
 */
function Mark({ icon: Icon, state, present, absent }) {
  const tone =
    state === OBSERVED.PRESENT ? "text-ok-700" : state === OBSERVED.ABSENT ? "text-red-700" : "text-dash-muted";
  const words = state === OBSERVED.PRESENT ? present : state === OBSERVED.ABSENT ? absent : "Not clear in this photo";
  const Glyph = state === OBSERVED.PRESENT ? Check : state === OBSERVED.ABSENT ? TriangleAlert : Camera;
  return (
    <li className="flex items-center gap-2.5 rounded-dash-sm border border-dash-line bg-dash-bg px-3 py-2.5">
      <Icon size={16} strokeWidth={2.25} className="shrink-0 text-dash-muted" aria-hidden="true" />
      <span className={`flex-1 text-[0.875rem] font-semibold ${tone}`}>{words}</span>
      <Glyph size={15} strokeWidth={2.75} className={`shrink-0 ${tone}`} aria-hidden="true" />
    </li>
  );
}

/** The reading's own account of itself: what it could not read, what it added. */
function SheetReading({ reading }) {
  if (!reading || reading.status === "reading") return null;

  if (reading.status === "failed") {
    return (
      <p className="mt-3 flex gap-2 border-l-2 border-flag-500 bg-flag-50 px-3 py-2 text-[0.8125rem] leading-relaxed text-dash-ink">
        <TriangleAlert size={15} className="mt-0.5 shrink-0 text-flag-600" />
        <span>
          {reading.reason} Type the figures in yourself — the photograph is still kept with your return.
        </span>
      </p>
    );
  }

  const unreadable = reading.unreadable ?? [];
  const folded = reading.folded ?? [];
  const unchecked = reading.trusted === false;

  if (!unchecked && !unreadable.length && !folded.length && !reading.figures?.unitCode && reading.legibility !== "poor") {
    return null;
  }

  return (
    <div className={["mt-3 border-l-2 px-3 py-2", unchecked ? "border-flag-500 bg-flag-50" : "border-blue-400 bg-blue-50"].join(" ")}>
      {unchecked && (
        <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-dash-ink">
          <TriangleAlert size={14} strokeWidth={2.5} className="shrink-0 text-flag-600" />
          Read every box back before you send
        </p>
      )}
      {unchecked && reading.why && <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-ink">{reading.why}</p>}
      {reading.legibility === "poor" && (
        <p className="mt-1 text-[0.8125rem] font-semibold text-flag-700">The picture was hard to read.</p>
      )}
      {reading.figures?.unitCode && (
        <p className="figure mt-1 text-[0.75rem] text-dash-muted">Sheet says unit {reading.figures.unitCode}</p>
      )}
      {folded.length > 0 && (
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-ink">
          <span className="font-semibold">Other parties</span> is {folded.join(" + ")} added together.
        </p>
      )}
      {unreadable.length > 0 && (
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-ink">
          <span className="font-semibold">Check these yourself:</span> {unreadable.join(", ")}.
        </p>
      )}
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
 * `read` means the reader put this here and nobody has touched it — drawn on
 * the box itself, because the question at 9pm is "is *this* figure mine or the
 * machine's", and a colour on the box answers it where the eye already is.
 */
function Text({ name, label, hint, value, onChange, read = false, plain = false }) {
  return (
    <div>
      <label htmlFor={name} className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
        {read && <FromSheet />}
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
          "mt-2 h-16 w-full rounded-dash-sm border-2 px-4 text-dash-ink",
          plain ? "text-[1.0625rem] font-semibold" : "figure text-[1.05rem] font-bold",
          "placeholder:text-[0.8125rem] placeholder:font-normal placeholder:tracking-normal",
          "focus:outline-none",
          read ? "border-blue-400 bg-blue-50 focus:border-dash-ink" : "border-dash-line bg-dash-card focus:border-dash-ink",
        ].join(" ")}
      />
    </div>
  );
}

function Number({ name, label, hint, value, onChange, error, swatch, read = false }) {
  return (
    <div>
      <label htmlFor={name} className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {swatch && <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: swatch }} />}
        {label}
        {read && <FromSheet />}
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
        className={[
          "figure mt-2 h-16 w-full rounded-dash-sm border-2 px-4 text-fluid-xl font-bold text-dash-ink",
          "focus:outline-none",
          error
            ? "border-red-500 bg-dash-card"
            : read
              ? "border-blue-400 bg-blue-50 focus:border-dash-ink"
              : "border-dash-line bg-dash-card focus:border-dash-ink",
        ].join(" ")}
      />
    </div>
  );
}

function FromSheet() {
  return (
    <span className="flex items-center gap-1 font-bold tracking-normal text-blue-700 normal-case">
      <ScanLine size={11} strokeWidth={2.75} aria-hidden="true" />
      from your sheet
    </span>
  );
}
