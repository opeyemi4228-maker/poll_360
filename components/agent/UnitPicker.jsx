"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin } from "lucide-react";

import Field, { fieldInput, fieldSelect } from "./Field";

/**
 * Where the agent is, in INEC's own terms.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This replaced a single box that said "01/01/04/006" and hoped. Nine digits
 *  copied off a form, at night, on a phone, was the likeliest thing on the
 *  sign-up form to be wrong — and a wrong unit code is the worst kind of wrong
 *  this product has, because it does not fail. It files a real return against
 *  a booth in the wrong ward, and the map looks entirely normal.
 *
 *  So every part is chosen rather than typed. State, local government, ward
 *  and booth all come from lists, by name, and the code assembles itself
 *  underneath where the agent can read it back against the sheet in their hand.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WARD AND UNIT WERE NUMBERS UNTIL THE LIST EXISTED ──────────────────────
 * They were typed, and the reason was good: this repository held no ward or
 * polling-unit list, and filling two dropdowns with invented names would have
 * been worse than leaving them out — a wrong ward name printed beside a right
 * ward number reads as confirmation.
 *
 * It holds INEC's now. All 8,809 wards and 176,623 booths, from the
 * commission's own codes, in public/geo/units/ — see scripts/import-units.mjs.
 * A state's file is fetched when the state is chosen, about 150KB rather than
 * the 8.3MB the whole country would be, and the ward and booth become lists
 * like the two above them.
 *
 * What that buys is not convenience. It is that an agent now reads back
 * "Nbawsi Post Office" instead of nine digits, and knows immediately whether
 * it is where they are standing.
 *
 * ── IT WORKS WITH THE SCRIPT SWITCHED OFF ──────────────────────────────────
 * That is not a nicety on this form. Its users are on cheap handsets on rural
 * networks, and a picker that quietly submits nothing when a script fails to
 * load is an agent who cannot file on the morning it matters.
 *
 * So every part is a real named field — `state`, `lga`, `ward`, `unit` — and
 * the server assembles the code from them. Nothing is carried in a hidden
 * input that only JavaScript fills. Two consequences follow, both deliberate:
 *
 *   · The local government list is rendered *whole*, all 774 grouped by state,
 *     and narrowed to one state's worth once a state is chosen. Without a
 *     script the full grouped list is still there to scroll; with one it is a
 *     short list. Cascading by fetching would have left the no-script path
 *     with an empty select.
 *
 *   · Ward and booth cannot be rendered whole — 176,623 options is not a
 *     select, it is a denial of service — so those two fall back to the
 *     numeric boxes they used to be whenever no list has arrived: no script,
 *     no state chosen yet, or a request that never landed. The agent can
 *     always finish the form.
 *
 *   · The value of a local government is "SS/LL" and not "LL", so the choice
 *     carries its own state. The two can then never disagree, which they could
 *     if the state were read from one field and the local government from
 *     another.
 *
 * Nothing here is marked `required`. The browser would enforce it before the
 * escape hatch below could be used, and somebody who has their full code
 * should not be made to walk the dropdowns to give it.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function UnitPicker({ places = [], values = {}, errors = {} }) {
  const [stateNumber, setStateNumber] = useState(values.state ?? "");
  /* "SS/LL". Held whole, split only where a part is needed. */
  const [lga, setLga] = useState(values.lga ?? "");
  const [ward, setWard] = useState(values.ward ?? "");
  const [unit, setUnit] = useState(values.unit ?? "");
  const [typed, setTyped] = useState("");
  const [readBack, setReadBack] = useState(null);

  const details = useRef(null);

  const chosen = places.find((row) => row.number === stateNumber) ?? null;

  /* A local government only counts as chosen while it belongs to the state on
     screen. Changing the state clears it, so this is belt and braces — but it
     is the guard that stops a stale "25/13" being read as Nasarawa's 13th. */
  const inState = Boolean(stateNumber) && lga.startsWith(`${stateNumber}/`);
  const lgaNumber = inState ? lga.split("/")[1] : "";
  const lgaName = chosen && lgaNumber ? (chosen.lgas[Number(lgaNumber) - 1] ?? null) : null;

  /* ══════════════════════════════════════════════════════════════════════
     THE STATE'S OWN WARDS AND BOOTHS

     ── FETCHED, NOT BUNDLED ──────────────────────────────────────────────
     176,623 polling units is 8.3MB. Sending that to a phone so somebody can
     pick one of twelve is the sort of thing that makes a form unusable on the
     network these forms are actually filled in on. One state is about 150KB
     and arrives when a state is chosen, which is the same way the room's map
     fetches one state's boundaries.

     Stamped with the state it was fetched for, so a slow reply for a state
     the agent has already moved on from cannot populate the dropdown under a
     different one — the failure that would offer Kano's wards under Kaduna's
     name, every code valid, nothing objecting.
     ══════════════════════════════════════════════════════════════════════ */
  const [book, setBook] = useState(null);

  useEffect(() => {
    /* Nothing chosen: nothing to fetch, and nothing to clear either, because
       the reads below key off the state and will simply find no match.
       Returning early rather than calling setState in an effect body, which
       cascades a render for no gain. */
    if (!stateNumber) return undefined;

    let cancelled = false;
    fetch(`/geo/units/${stateNumber}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => !cancelled && setBook({ state: stateNumber, data }))
      .catch(() => !cancelled && setBook({ state: stateNumber, data: null }));
    return () => {
      cancelled = true;
    };
  }, [stateNumber]);

  const loaded = book?.state === stateNumber ? book.data : null;
  const loadingUnits = Boolean(stateNumber) && book?.state !== stateNumber;

  /* The wards of the chosen local government, and the booths of the chosen
     ward. Each is empty until the tier above it is answered, which is what
     makes this a cascade rather than three independent lists. */
  const wardsHere = useMemo(
    () => (loaded && lgaNumber ? (loaded.lgas.find((row) => row.n === lgaNumber)?.wards ?? []) : []),
    [loaded, lgaNumber]
  );

  const unitsHere = useMemo(
    () => (ward ? (wardsHere.find((row) => row.n === pad(ward, 2))?.units ?? []) : []),
    [wardsHere, ward]
  );

  const chosenWardName = wardsHere.find((row) => row.n === pad(ward, 2))?.name ?? null;
  const chosenUnitName = unitsHere.find((row) => row.n === pad(unit, 3))?.name ?? null;

  const parts = [stateNumber, lgaNumber, pad(ward, 2), pad(unit, 3)];
  const complete = parts.every(Boolean);

  /* ── READING A WHOLE CODE BACK INTO THE PICKERS ──────────────────────────
     Somebody holding the sheet would rather type nine digits than walk two
     dropdowns, and they are right. What they get for it is the check they came
     for: the code they typed turns into a state and a local government with
     names on them, so a transposed digit stops being nine digits that look
     like any other nine digits and starts being the wrong town.

     The typed box is emptied once it has been read. The parts are the only
     thing submitted after that, and there is no second copy of the answer left
     behind to disagree with them. */
  function readWholeCode(raw) {
    setTyped(raw);

    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 9) return;

    const [s, l, w, u] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6), digits.slice(6, 9)];

    const found = places.find((row) => row.number === s);
    /* A state we cannot name, or a local government that state does not have.
       Left in the box exactly as typed rather than half-applied: the server
       says what is wrong with it in a sentence, which is better than a picker
       silently settling on something adjacent. */
    if (!found?.lgas[Number(l) - 1]) return;

    setStateNumber(s);
    setLga(`${s}/${l}`);
    setWard(w);
    setUnit(u);
    setTyped("");
    setReadBack(`${s}/${l}/${w}/${u}`);
    details.current?.removeAttribute("open");
  }

  return (
    <fieldset className="space-y-5 border-t-2 border-ink-200 pt-6">
      <legend className="sr-only">Your polling unit</legend>

      <div className="flex items-baseline gap-2">
        <MapPin size={15} strokeWidth={2.5} className="shrink-0 translate-y-0.5 text-ink-500" />
        <p className="text-[0.9375rem] leading-relaxed text-content-muted">
          The booth you were appointed to. Every return you ever file is attached to it, so it is
          the one thing on this form worth checking twice.
        </p>
      </div>

      <Field label="State" error={errors.state} name="state">
        {(id) => (
          <select
            id={id}
            name="state"
            value={stateNumber}
            onChange={(event) => {
              setStateNumber(event.target.value);
              /* ── EVERYTHING BELOW A CHANGED ANSWER IS CLEARED ───────────
                 The local government belonged to the old state, and so did
                 the ward and the booth under it. Ward 06 means a different
                 place in every state in the country, so a number left on
                 screen after the state changes is not a head start — it is a
                 wrong answer that looks filled in. */
              setLga("");
              setWard("");
              setUnit("");
              setReadBack(null);
            }}
            className={fieldSelect(errors.state)}
          >
            <option value="">Choose your state</option>
            {places.map((place) => (
              <option key={place.number} value={place.number}>
                {place.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label="Local government"
        hint={chosen ? `${chosen.lgas.length} in ${chosen.name}` : undefined}
        error={errors.lga}
        name="lga"
      >
        {(id) => (
          <select
            id={id}
            name="lga"
            value={inState ? lga : ""}
            onChange={(event) => {
              setLga(event.target.value);
              /* Same reason as the state above: ward 06 of Binji and ward 06
                 of Gada are two different places, and the number is the same. */
              setWard("");
              setUnit("");
              setReadBack(null);
            }}
            className={fieldSelect(errors.lga)}
          >
            <option value="">{chosen ? "Choose your local government" : "Choose your state first"}</option>

            {chosen
              ? chosen.lgas.map((name, index) => (
                  <option key={name} value={`${chosen.number}/${two(index + 1)}`}>
                    {name}
                  </option>
                ))
              : /* No state chosen yet, so every local government is still on
                   offer, grouped by the state it belongs to. This is what the
                   no-script path scrolls, and what the first render sends. */
                places.map((place) => (
                  <optgroup key={place.number} label={place.name}>
                    {place.lgas.map((name, index) => (
                      <option key={`${place.number}-${name}`} value={`${place.number}/${two(index + 1)}`}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                ))}
          </select>
        )}
      </Field>

      {/* ══════════════════════════════════════════════════════════════════
          WARD AND BOOTH, CHOSEN RATHER THAN TYPED

          ── WHY THESE WERE BOXES UNTIL NOW ─────────────────────────────────
          Because this repository held no ward or unit list, and two dropdowns
          filled with invented names would have been worse than none: a wrong
          ward name printed beside a right ward number reads as confirmation.

          It holds INEC's now — all 8,809 wards and 176,623 booths, from the
          commission's own codes, in public/geo/units/. So the two halves of
          the code that could not be checked are chosen from lists, by name,
          and the thing an agent reads back is "Inname Masukayi" rather than
          nine digits that look like any other nine digits.

          ── AND THE TYPED PATH IS STILL THERE ──────────────────────────────
          Not as a fallback for a failed script — as the faster route for
          somebody holding the sheet. Both write the same four fields. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Ward"
          hint={
            loadingUnits
              ? "loading…"
              : wardsHere.length
                ? `${wardsHere.length} in ${lgaName ?? "this local government"}`
                : "2 digits"
          }
          error={errors.ward}
          name="ward"
        >
          {(id) =>
            wardsHere.length ? (
              <select
                id={id}
                name="ward"
                value={pad(ward, 2)}
                onChange={(event) => {
                  setWard(event.target.value);
                  /* The booth belonged to the old ward. Left in place it would
                     be a number on screen naming somewhere else entirely. */
                  setUnit("");
                  setReadBack(null);
                }}
                className={fieldSelect(errors.ward)}
              >
                <option value="">Choose your ward</option>
                {wardsHere.map((row) => (
                  <option key={row.n} value={row.n}>
                    {row.n} · {row.name}
                  </option>
                ))}
              </select>
            ) : (
              /* No list yet: no state chosen, still loading, or the file did
                 not arrive. The box that was always here, so the form works
                 with the script switched off and on a network that dropped
                 the request. */
              <input
                id={id}
                name="ward"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={2}
                value={ward}
                onChange={(event) => setWard(digitsOnly(event.target.value, 2))}
                placeholder="06"
                className={`${fieldInput(errors.ward)} figure text-center`}
              />
            )
          }
        </Field>

        <Field
          label="Polling unit"
          hint={
            unitsHere.length
              ? `${unitsHere.length} in this ward`
              : wardsHere.length
                ? "choose a ward first"
                : "3 digits"
          }
          error={errors.unit}
          name="unit"
        >
          {(id) =>
            unitsHere.length ? (
              <select
                id={id}
                name="unit"
                value={pad(unit, 3)}
                onChange={(event) => {
                  setUnit(event.target.value);
                  setReadBack(null);
                }}
                className={fieldSelect(errors.unit)}
              >
                <option value="">Choose your polling unit</option>
                {unitsHere.map((row) => (
                  <option key={row.n} value={row.n}>
                    {row.n} · {row.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name="unit"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                value={unit}
                onChange={(event) => setUnit(digitsOnly(event.target.value, 3))}
                placeholder="012"
                className={`${fieldInput(errors.unit)} figure text-center`}
              />
            )
          }
        </Field>
      </div>

      {/* ── THE BOOTH, BY NAME ──────────────────────────────────────────────
          The whole return on having the list. An agent checking nine digits
          against a sheet is checking digits; an agent reading "Nbawsi Post
          Office" knows immediately whether it is where they are standing. */}
      {chosenUnitName && (
        <p className="rounded-dash-sm border border-ink-200 bg-ink-50 px-4 py-3 text-[0.875rem] leading-relaxed text-content">
          <span className="font-semibold">{chosenUnitName}</span>
          {chosenWardName ? <span className="text-content-muted"> · {chosenWardName} ward</span> : null}
        </p>
      )}

      <p className="text-[0.8125rem] leading-relaxed text-content-muted">
        Your ward and booth, as INEC lists them. If you are holding your result sheet, the code at
        the top of it is quicker — open the box below and type it whole.
      </p>

      {/* ── THE CODE, READ BACK ────────────────────────────────────────────
          Not decoration and not a receipt. It is the one moment where what
          the agent chose from lists and what is printed on the sheet in their
          hand can be held side by side, in the same grammar, before anything
          is sent. The names underneath are the actual check: 24 and 25 look
          alike, Lagos and Kwara do not. */}
      <div
        aria-live="polite"
        className={`rounded-dash-sm border-2 px-4 py-4 ${
          complete ? "border-ink-950 bg-ink-50" : "border-dashed border-ink-300 bg-white"
        }`}
      >
        <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-content-subtle uppercase">
          Your polling unit code
        </p>
        <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold tracking-[0.06em] text-ink-950">
          {parts[0] || "––"}/{parts[1] || "––"}/{parts[2] || "––"}/
          {parts[3] || "–––"}
        </p>

        {chosen && (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-content-muted">
            {chosen.name}
            {lgaName && <> &middot; {lgaName}</>}
            {parts[2] && <> &middot; ward {parts[2]}</>}
            {parts[3] && <> &middot; unit {parts[3]}</>}
          </p>
        )}

        {readBack && (
          <p className="mt-2 flex gap-2 text-[0.875rem] leading-relaxed text-emerald-700">
            <Check size={14} strokeWidth={3} className="mt-1 shrink-0" />
            Read from the code you typed. Check the two names above are the place you were
            appointed to.
          </p>
        )}

        {!complete && (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-content-muted">
            This fills in as you choose. It should match the code on your sheet exactly.
          </p>
        )}
      </div>

      {/* ── NAMES, ASKED FOR AND NOT INVENTED ───────────────────────────────
          Optional, and the label says so, because an agent who does not know
          the registered name of their ward must not be stopped here. What
          they do write is worth having: it is what the person approving them
          reads across from the appointment list, and a name that does not
          match a number is a mistake caught before polling day rather than
          after the first return. */}
      <Field label="Ward name" hint="Optional" error={errors.wardName} name="wardName">
        {(id) => (
          <input
            id={id}
            name="wardName"
            type="text"
            autoComplete="off"
            maxLength={80}
            defaultValue={values.wardName ?? ""}
            placeholder="As written on your sheet"
            className={fieldInput(errors.wardName)}
          />
        )}
      </Field>

      <Field label="Polling unit name" hint="Optional" error={errors.unitName} name="unitName">
        {(id) => (
          <input
            id={id}
            name="unitName"
            type="text"
            autoComplete="off"
            maxLength={80}
            defaultValue={values.unitName ?? ""}
            placeholder="The school, hall or square"
            className={fieldInput(errors.unitName)}
          />
        )}
      </Field>

      {/* A <details>, so the escape hatch opens without a script too. */}
      <details ref={details} className="rounded-dash-sm border-2 border-ink-200 px-4 py-3">
        <summary className="cursor-pointer text-[0.9375rem] font-bold text-ink-950 marker:text-ink-400">
          I have the whole code in front of me
        </summary>
        <div className="mt-3">
          <Field label="Polling unit code" error={errors.unitCode} name="unitCode">
            {(id) => (
              <input
                id={id}
                name="unitCode"
                type="text"
                inputMode="numeric"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={typed}
                onChange={(event) => readWholeCode(event.target.value)}
                placeholder="01/01/04/006"
                className={`${fieldInput(errors.unitCode)} figure`}
              />
            )}
          </Field>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-content-muted">
            Type all nine digits and the boxes above fill themselves in, with the names of the state
            and local government the code actually points at.
          </p>
        </div>
      </details>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */

const two = (value) => String(value).padStart(2, "0");

const digitsOnly = (value, width) => value.replace(/\D/g, "").slice(0, width);

/** Padded for display, and empty while the box is empty — 0 is not a ward. */
function pad(value, width) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(width, "0") : "";
}
