"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Search,
  ShieldAlert,
  User,
  X,
} from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { Panel, Readout } from "./Figures";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Polling unit intelligence.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE BOOTH, EVERYTHING WE HOLD, ON ONE SCREEN
 *
 *  This is the answer to the question every other surface in the room ends
 *  in. The map shows a state that has stalled, the stuck list names a booth,
 *  the incident feed names another — and until now the only way to find out
 *  what was actually going on at one of them was to visit four screens and
 *  hold the code in your head between them.
 *
 *  Where the booth is, who is standing at it, whether they have been seen,
 *  what they filed, whether the paper agrees with itself, what was reported
 *  from it, and the order it all happened in. If the room holds it, it is
 *  here.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── A BLANK CARD IS A FINDING ──────────────────────────────────────────────
 * A booth with nobody assigned, nothing filed and nothing reported draws an
 * empty card that says so in each of those three places separately. That is
 * three different silences and they mean different things: nobody was sent,
 * somebody was sent and has not filed, somebody filed and nobody checked it.
 * A card that collapsed them into "no data" would hide the only useful thing
 * about the booth.
 */
export default function UnitIntel({ cards = {}, unitCode = null, onPick, onGo, embedded = false }) {
  const [query, setQuery] = useState("");

  const codes = useMemo(() => Object.keys(cards).sort(), [cards]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return codes
      .filter((code) => {
        const card = cards[code];
        return (
          code.toLowerCase().includes(needle) ||
          card.state?.toLowerCase().includes(needle) ||
          card.lga?.toLowerCase().includes(needle) ||
          card.agent?.name?.toLowerCase().includes(needle)
        );
      })
      .slice(0, 12);
  }, [cards, codes, query]);

  const card = unitCode ? cards[unitCode] : null;

  return (
    <div className={cn("flex flex-col gap-3", !embedded && "xl:grid xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-start")}>
      {!embedded && (
        <div className="flex flex-col gap-3">
          <Panel title="Find a booth" figure={`${formatNumber(codes.length)} known`}>
            <label className="flex items-center gap-2 rounded-dash-sm border border-dash-line px-2.5 py-2 focus-within:border-dash-ink">
              <Search size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Unit code, state, local government or name"
                className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-dash-ink outline-none placeholder:text-dash-muted"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear"
                  className="shrink-0 text-dash-muted hover:text-dash-ink"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </label>

            {query.trim() === "" ? (
              <p className="mt-3 text-[0.75rem] text-dash-muted">
                Every booth this room has heard from, or has somebody standing at. Booths in the
                registry with neither are not here — there is nothing to show about them yet.
              </p>
            ) : matches.length === 0 ? (
              <p className="mt-3 text-[0.8125rem] text-dash-muted">Nothing matches that.</p>
            ) : (
              <ul className="mt-3 space-y-px">
                {matches.map((code) => {
                  const row = cards[code];
                  return (
                    <li key={code}>
                      <button
                        type="button"
                        onClick={() => onPick?.(code)}
                        className={cn(
                          "flex w-full flex-col rounded-dash-sm px-2 py-1.5 text-left transition-colors",
                          code === unitCode ? "bg-dash-ink text-white" : "hover:bg-dash-bg"
                        )}
                      >
                        <span className="figure text-[0.8125rem] font-bold tabular-nums">
                          {code}
                        </span>
                        <span
                          className={cn(
                            "truncate text-[0.75rem]",
                            code === unitCode ? "text-white/70" : "text-dash-muted"
                          )}
                        >
                          {[row.lga, row.state].filter(Boolean).join(", ") || "Place unknown"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {card ? <Card card={card} onGo={onGo} /> : <Empty embedded={embedded} />}
    </div>
  );
}

function Empty({ embedded }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card p-8 text-center">
      <MapPin size={22} strokeWidth={2} className="mx-auto text-dash-muted" />
      <p className="mt-2 text-[0.9375rem] font-semibold text-dash-ink">No booth chosen</p>
      <p className="mt-1 text-[0.8125rem] text-dash-muted">
        {embedded
          ? "Nothing is held about that polling unit yet."
          : "Search above, or open one from the stuck list on Results operations."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- card */

export function Card({ card, onGo }) {
  const result = card.result;
  const votes = Object.entries(result?.votes ?? {})
    .map(([party, count]) => ({ party, count }))
    .sort((a, b) => b.count - a.count);
  const cast = votes.reduce((sum, row) => sum + row.count, 0);
  const worst = (result?.flags ?? []).some((flag) => flag.severity === "IMPOSSIBLE");

  return (
    <div className="flex flex-col gap-3">
      {/* ------------------------------------------------------------ head */}
      <section className="rounded-dash border border-dash-line bg-dash-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="figure text-[1.5rem] leading-none font-bold text-dash-ink tabular-nums">
              {card.unitCode}
            </p>
            {/* The four levels, spelled out. A code is not a place. */}
            <p className="mt-1.5 text-[0.8125rem] text-dash-muted">
              {[
                card.unitNo && `Unit ${card.unitNo}`,
                card.wardCode && `Ward ${card.wardCode.split("/").at(-1)}`,
                card.lga,
                card.state,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <Status result={result} worst={worst} />
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* --------------------------------------------------------- agent */}
        <Panel title="Who is there" figure={card.agent ? card.agent.kind : "nobody"}>
          {!card.agent ? (
            <p className="text-[0.875rem] text-dash-muted">
              Nobody is assigned to this booth. Anything filed from it came from a desk.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <User size={16} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
                <span className="truncate text-[0.9375rem] font-semibold text-dash-ink">
                  {card.agent.name}
                </span>
              </div>
              <div className="mt-2">
                <Readout
                  label="Last signed in"
                  value={card.agent.lastSeen ? when(card.agent.lastSeen) : "never"}
                  tone={card.agent.lastSeen ? "ink" : "warn"}
                />
                <Readout
                  label="Position"
                  value={
                    card.agent.derived
                      ? "not reported"
                      : `${card.agent.lat.toFixed(4)}, ${card.agent.lon.toFixed(4)}`
                  }
                  tone={card.agent.derived ? "muted" : "ink"}
                />
                <Readout
                  label="Position taken"
                  value={card.agent.seenAt ? when(card.agent.seenAt) : "—"}
                  sub={card.agent.via === "whatsapp" ? "over WhatsApp" : card.agent.via ?? undefined}
                />
                <Readout
                  label="From the booth"
                  value={BAND[card.agent.band]?.label ?? "unknown"}
                  sub={
                    card.agent.distance != null
                      ? `${formatNumber(Math.round(card.agent.distance))} m`
                      : undefined
                  }
                  tone={BAND[card.agent.band]?.tone ?? "muted"}
                />
              </div>
              {/* The one sentence this panel must never leave out. */}
              <p className="mt-2 text-[0.75rem] text-dash-muted">
                One fix, taken when they chose to send. Not a trail, and not where they are now.
              </p>
            </>
          )}
        </Panel>

        {/* -------------------------------------------------------- figures */}
        <Panel
          title="What was filed"
          figure={result ? formatNumber(cast) + " cast" : "nothing"}
          /* ── "FILED BY" WAS THE WRONG WORDS FOR THIS NAME ────────────────
             `repName` is the presiding officer read off the sheet — the
             official who certified the figures at the booth. It is not who
             filed the return, which is `filedBy` and is usually a different
             person entirely: our own agent standing at that booth.

             Calling the officer the filer attributed one person's return to
             another by name, on the one screen somebody opens with a booth
             code they were read over the telephone. */
          foot={
            result?.repName
              ? `Presiding officer: ${result.repName}${result.source ? ` · filed ${result.source.toLowerCase()}` : ""}`
              : result?.source
                ? `Filed ${result.source.toLowerCase()}`
                : null
          }
        >
          {!result ? (
            <p className="text-[0.875rem] text-dash-muted">
              No return has arrived from this booth for this contest.
            </p>
          ) : (
            <>
              <Readout label="On the register" value={formatNumber(result.registered ?? 0)} />
              <Readout
                label="Accredited"
                value={formatNumber(result.accredited ?? 0)}
                sub={
                  result.registered
                    ? formatShare((result.accredited / result.registered) * 100)
                    : undefined
                }
              />
              <Readout label="Rejected" value={formatNumber(result.rejected ?? 0)} />

              {votes.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {votes.slice(0, 6).map((row) => (
                    <li key={row.party}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                          {row.party}
                        </span>
                        <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                          {formatNumber(row.count)}
                          <span className="ml-1.5 font-normal text-dash-muted">
                            {cast ? formatShare((row.count / cast) * 100) : "—"}
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
                            width: `${cast ? (row.count / cast) * 100 : 0}%`,
                            background: PARTY_FILL[row.party] ?? PARTY_FILL.OTH,
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* ------------------------------------------------------------ paper */}
      {result && (
        <Panel
          title="The sheet"
          figure={
            result.sheet
              ? result.sheet.compared
                ? "compared"
                : "photographed"
              : "no photograph"
          }
          foot={
            result.formSerial
              ? `Form serial ${result.formSerial}`
              : "No serial captured off the form."
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                The boxes, as written
              </p>
              <div className="mt-1.5">
                {BOXES.map(([key, label]) => (
                  <Readout
                    key={key}
                    label={label}
                    value={
                      result.boxes[key] == null ? "—" : formatNumber(result.boxes[key])
                    }
                    tone={result.culprit === key ? "alert" : "ink"}
                  />
                ))}
              </div>
              {/* A box nobody captured and a box written 0 are different facts
                  — see the note on EC8A in lib/db.js. The dash says so. */}
              <p className="mt-1.5 text-[0.75rem] text-dash-muted">
                A dash is a box nobody captured, not a zero.
              </p>
            </div>

            <div>
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Does it agree with itself
              </p>
              {result.balances ? (
                <p className="mt-2 flex items-center gap-2 text-[0.875rem] font-semibold text-emerald-700">
                  <CheckCircle2 size={16} strokeWidth={2.5} />
                  Every identity that could be tested holds.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {result.findings.map((finding, index) => (
                    <li key={index} className="text-[0.8125rem] text-red-700">
                      {finding.says ?? finding.rule}
                      {finding.off != null && (
                        <span className="figure ml-1.5 font-bold tabular-nums">
                          out by {formatNumber(Math.abs(finding.off))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {result.flags.length > 0 && (
                <>
                  <p className="mt-4 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                    Screening
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {result.flags.map((flag, index) => (
                      <li key={index}>
                        <span
                          className={cn(
                            "text-[0.8125rem] font-semibold",
                            flag.severity === "IMPOSSIBLE" ? "text-red-700" : "text-amber-700"
                          )}
                        >
                          {flag.says}
                        </span>
                        <span className="block text-[0.75rem] text-dash-muted">{flag.why}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ----------------------------------------------------- incidents */}
        <Panel
          title="Reported from here"
          figure={`${formatNumber(card.incidents.length)}`}
        >
          {card.incidents.length === 0 ? (
            <p className="text-[0.875rem] text-dash-muted">Nothing has been reported.</p>
          ) : (
            <ul className="space-y-0">
              {card.incidents.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-2.5 border-b border-dash-line/60 py-2 last:border-0"
                >
                  <ShieldAlert
                    size={15}
                    strokeWidth={2.25}
                    className={cn(
                      "mt-px shrink-0",
                      item.severity === "CRITICAL"
                        ? "text-red-600"
                        : item.severity === "SERIOUS"
                          ? "text-amber-600"
                          : "text-dash-muted"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                      {item.kind}
                    </span>
                    {item.detail && (
                      <span className="block text-[0.75rem] text-dash-muted">{item.detail}</span>
                    )}
                    <span className="block text-[0.6875rem] text-dash-muted">
                      {[when(item.at), item.reporter, item.status].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {item.photos > 0 && (
                    <span
                      title={`${item.photos} photograph${item.photos === 1 ? "" : "s"}`}
                      className="flex shrink-0 items-center gap-1 text-[0.75rem] text-dash-muted"
                    >
                      <Camera size={13} strokeWidth={2.25} />
                      {item.photos}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {card.incidents.length > 0 && (
            <button
              type="button"
              onClick={() => onGo?.("situations")}
              className="mt-2 text-[0.75rem] font-semibold text-dash-ink underline-offset-2 hover:underline"
            >
              Open the full feed
            </button>
          )}
        </Panel>

        {/* ------------------------------------------------------ timeline */}
        <Panel title="This booth's evening" figure={`${formatNumber(card.timeline.length)}`}>
          {card.timeline.length === 0 ? (
            <p className="text-[0.875rem] text-dash-muted">Nothing has happened here yet.</p>
          ) : (
            <ol className="space-y-0">
              {card.timeline.map((event, index) => (
                <li key={index} className="flex items-start gap-3 py-1.5">
                  <span className="figure w-12 shrink-0 text-[0.75rem] font-bold text-dash-muted tabular-nums">
                    {when(event.at)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[0.8125rem] font-semibold",
                        event.severity === "CRITICAL" ? "text-red-700" : "text-dash-ink"
                      )}
                    >
                      {event.what}
                    </span>
                    {event.detail && (
                      <span className="block truncate text-[0.75rem] text-dash-muted">
                        {event.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/** Where the return stands, said as a word rather than as a colour. */
function Status({ result, worst }) {
  if (!result) {
    return (
      <span className="flex items-center gap-1.5 rounded-dash-sm bg-dash-bg px-2.5 py-1.5 text-[0.75rem] font-bold tracking-[0.06em] text-dash-muted uppercase">
        <Clock size={13} strokeWidth={2.5} />
        Not reported
      </span>
    );
  }

  const tone = worst
    ? "bg-red-600 text-white"
    : result.status === "VERIFIED"
      ? "bg-emerald-600 text-white"
      : "bg-amber-400 text-amber-950";

  const Icon = worst ? AlertTriangle : result.status === "VERIFIED" ? CheckCircle2 : FileText;

  return (
    <span className="flex flex-col items-end gap-1.5">
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-dash-sm px-2.5 py-1.5 text-[0.75rem] font-bold tracking-[0.06em] uppercase",
          tone
        )}
      >
        <Icon size={13} strokeWidth={2.5} />
        {worst ? "Cannot be right" : result.status === "VERIFIED" ? "Verified" : "Awaiting a check"}
      </span>
      {result.next && (
        <span className="text-[0.75rem] text-dash-muted">
          Waiting on {NEXT[result.next] ?? result.next}
        </span>
      )}
    </span>
  );
}

const NEXT = {
  extracted: "a photograph of the sheet",
  confirmed: "the sheet being held against the figures",
  validated: "the arithmetic",
  verified: "a desk",
};

const BOXES = [
  ["ballotsIssued", "Ballots issued"],
  ["unusedBallots", "Unused"],
  ["spoiled", "Spoiled"],
  ["usedBallots", "Used"],
  ["statedValid", "Valid, as stated"],
];

const BAND = {
  matched: { label: "at it", tone: "good" },
  near: { label: "nearby", tone: "ink" },
  far: { label: "far from it", tone: "warn" },
  unmatched: { label: "no booth to match", tone: "muted" },
  unknown: { label: "unknown", tone: "muted" },
};

function when(at) {
  if (!at) return "—";
  return new Date(at).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
