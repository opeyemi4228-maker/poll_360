"use client";

import { useMemo, useState } from "react";
import { Film } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { Composer, Field, Queue, clock, inputClass, useDesk } from "./Queue";
import { describeUnit } from "@/lib/broadcast";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Field broadcast operations, and the video bench.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PEOPLE ON THIS SCREEN ARE THE PEOPLE FILING THE COUNT
 *
 *  A conventional newsroom system keeps two rosters: the reporters it sent
 *  out, and, somewhere else entirely, whatever wire or data feed the results
 *  come from. This product only has one, because the person standing at the
 *  polling unit filing the return is the same person a producer wants a
 *  two-way with.
 *
 *  That is the advantage worth building on, so this screen is the coordinator
 *  watch read as a newsroom roster: who is out, where, whether they have
 *  filed, and whether their device has been heard from. It is the same rows
 *  the situation room draws its map from — one roster, not two, so a desk
 *  cannot be told somebody is live while the count says their booth is silent.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * The five states a person in the field can be in, from what we actually know.
 *
 * ── DERIVED, BECAUSE NOBODY WILL MAINTAIN A STATUS FIELD AT 1AM ────────────
 * A dropdown somebody has to keep current is a dropdown that says "on
 * assignment" for six hours after they went home. Every state below is read
 * off evidence: a filing, a sign-in, a position fix and how far it was from
 * the booth. It can be wrong — a person with no signal reads as offline — and
 * the screen says which evidence produced it rather than asserting a fact.
 */
const STATUSES = [
  { id: "live", label: "Live", dot: "bg-emerald-500", why: "Filed in the last ten minutes." },
  { id: "assignment", label: "On assignment", dot: "bg-emerald-600", why: "Has filed tonight." },
  { id: "waiting", label: "Waiting", dot: "bg-amber-400", why: "Signed in, nothing filed yet." },
  { id: "trouble", label: "Technical problem", dot: "bg-orange-500", why: "Filed from well away from the booth, or with no position at all." },
  { id: "offline", label: "Offline", dot: "bg-red-500", why: "Never signed in and nothing filed." },
];

function statusOf(row) {
  if (row.fresh) return "live";
  if (row.filed) return row.band === "far" ? "trouble" : "assignment";
  if (row.lastSeen) return "waiting";
  return "offline";
}

export function Reporters({ coordinators, summary, ground }) {
  const [only, setOnly] = useState(null);

  const rows = useMemo(
    () => coordinators.map((row) => ({ ...row, state: statusOf(row) })),
    [coordinators]
  );

  const counts = useMemo(() => {
    const out = Object.fromEntries(STATUSES.map((row) => [row.id, 0]));
    for (const row of rows) out[row.state] += 1;
    return out;
  }, [rows]);

  const shown = only ? rows.filter((row) => row.state === only) : rows;

  return (
    <div className="space-y-4">
      <Card
        title="Who is out"
        subtitle={`${formatNumber(rows.length)} in ${ground} · press a state to narrow the list`}
      >
        <ul className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {STATUSES.map((status) => (
            <li key={status.id}>
              <button
                type="button"
                onClick={() => setOnly(only === status.id ? null : status.id)}
                aria-pressed={only === status.id}
                title={status.why}
                className={cn(
                  "w-full rounded-dash-sm border px-3.5 py-3 text-left transition-colors",
                  only === status.id ? "border-dash-ink bg-dash-bg" : "border-dash-line hover:border-dash-ink"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", status.dot)} />
                  <span className="text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
                    {status.label}
                  </span>
                </span>
                <span className="figure mt-1.5 block text-[1.5rem] leading-none font-bold text-dash-ink">
                  {formatNumber(counts[status.id])}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title={only ? STATUSES.find((row) => row.id === only)?.label : "The roster"}
        subtitle={only ? STATUSES.find((row) => row.id === only)?.why : "Everyone assigned a booth inside this ground"}
      >
        {shown.length === 0 ? (
          <Empty>
            {rows.length === 0
              ? "Nobody is assigned a booth in this ground. The roster comes from the count, not from a separate list."
              : "Nobody is in that state."}
          </Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[40rem] border-collapse text-[0.875rem]">
              <thead>
                <tr className="border-b border-dash-line text-left">
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Status
                  </th>
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Who
                  </th>
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Where
                  </th>
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Filed
                  </th>
                  <th className="pb-2 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    How we know
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 120).map((row) => {
                  const status = STATUSES.find((item) => item.id === row.state);
                  return (
                    <tr key={row.id} className="border-b border-dash-line last:border-0">
                      <td className="py-2.5 pr-3">
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("size-2 shrink-0 rounded-full", status.dot)} />
                          <span className="text-[0.8125rem] text-dash-ink">{status.label}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="font-semibold text-dash-ink">{row.name}</span>
                        <span className="ml-2 text-[0.75rem] text-dash-muted">{row.kind}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-dash-muted">{describeUnit(row.unitCode)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-dash-muted">
                        {row.at ? clock(row.at) : "—"}
                      </td>
                      <td className="py-2.5 text-[0.8125rem] text-dash-muted">
                        {row.via === "whatsapp"
                          ? "position sent over WhatsApp"
                          : row.via === "filing"
                            ? `position with the filing${row.band === "far" ? ", well off the booth" : ""}`
                            : row.lastSeen
                              ? `signed in ${clock(row.lastSeen)}`
                              : "no sign-in, no filing"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          Every status here is read off evidence rather than typed by anybody, which means it can
          be wrong in one direction: somebody with no signal reads as offline. The column on the
          right says which evidence produced it, so a producer can tell the difference between
          &ldquo;not there&rdquo; and &ldquo;not reachable&rdquo; before putting a name on air.
          {summary?.far ? ` ${formatNumber(summary.far)} filed from more than two kilometres away.` : ""}
        </p>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────────── field video feeds ─── */

/**
 * Incoming visual material.
 *
 * ── WHAT THIS PRODUCT ACTUALLY RECEIVES FROM THE FIELD ─────────────────────
 * Photographs, attached to incident reports and to result sheets, and they are
 * held tightly: the sheet belongs to the agent and the coordinators above
 * them, and a broadcast account is deliberately not given `sheets:read`. There
 * is no video ingest, no audio, and no upload path from a phone that is not
 * one of those two.
 *
 * So this screen shows what is arriving and says plainly what it would take to
 * receive the rest, rather than drawing an empty media grid that implies the
 * pipe exists and nobody has sent anything.
 */
export function FieldFeeds({ incidents, photoCount, items }) {
  const clips = items.filter((item) => item.kind === "VIDEO");

  return (
    <div className="space-y-4">
      <Card title="Arriving now" subtitle="Reports from the field, with whether they carried a picture">
        {incidents.length === 0 ? (
          <Empty>Nothing has come in from the field.</Empty>
        ) : (
          <ul className="space-y-2.5">
            {incidents.slice(0, 12).map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-dash-sm border border-dash-line px-3.5 py-3"
              >
                <span className="figure w-12 shrink-0 text-[0.8125rem] font-bold text-dash-ink">
                  {clock(row.createdAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.875rem] text-dash-ink">
                    {describeUnit(row.unitCode)}
                  </span>
                  <span className="block text-[0.75rem] text-dash-muted">
                    {String(row.kind ?? "report").replace(/_/g, " ").toLowerCase()}
                  </span>
                </span>
                <Badge
                  tone={row.severity === "CRITICAL" ? "alert" : row.severity === "URGENT" ? "warn" : "neutral"}
                >
                  {String(row.severity ?? "info").toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          {photoCount > 0
            ? `${formatNumber(photoCount)} of these carried a photograph. `
            : "None of these carried a photograph. "}
          The pictures themselves are not shown on this desk: a result sheet names a booth and an
          agent in the same frame, and a broadcast account is deliberately not given the key. Ask
          the room running the count for anything you need to put on air.
        </p>
      </Card>

      <Card title="Video, and what receiving it would take">
        <ul className="space-y-2 text-[0.875rem] leading-relaxed text-dash-muted">
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">Somewhere to put the bytes.</span> A result
            photograph is a few hundred kilobytes and lives in the database. A two-minute phone
            clip is fifty megabytes, and that needs object storage and a signed upload, not a
            column.
          </li>
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">A path from a phone that is not the form.</span>{" "}
            Agents file over the app and over WhatsApp. Neither carries video today, and WhatsApp
            will, which is the shorter route.
          </li>
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">An approval state before anything is
            seen.</span> The same rule as everything else on this desk: material from the field is
            evidence until somebody has cleared it, and a media grid with no clearance on it is a
            grid that ends up on air.
          </li>
        </ul>
        {clips.length > 0 && (
          <div className="mt-4 border-t border-dash-line pt-4">
            <Queue items={clips} empty="" />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── video studio ─── */

/**
 * The video bench.
 *
 * Cutting video is not something a web dashboard should pretend to do, and a
 * timeline editor built into this product would be a worse version of the one
 * the gallery already owns. What a desk genuinely loses track of is which
 * packages exist, which are cleared, and which output each one is for — so
 * that is what this is: a job sheet, in the same queue as everything else,
 * with the outputs named.
 */
const OUTPUTS = [
  "TV package",
  "YouTube video",
  "YouTube Short",
  "Instagram Reel",
  "Facebook video",
  "TikTok video",
  "X video",
];

export function VideoStudio({ items, race }) {
  const { may } = useDesk();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [output, setOutput] = useState(OUTPUTS[0]);
  const [length, setLength] = useState("");

  const clips = items.filter((item) => item.kind === "VIDEO");

  return (
    <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
      <Card title="Commission a package" subtitle="A job sheet, not an editor">
        {!may.draft ? (
          <Empty>This account can read the video bench and not write to it.</Empty>
        ) : (
          <Composer
            kind="VIDEO"
            title="Save the job"
            disabled={!title.trim()}
            values={() => ({
              title: title.trim(),
              body: [output, length.trim() ? `${length.trim()}s` : null, brief.trim()]
                .filter(Boolean)
                .join(" · "),
              race,
              payload: { output, length: length.trim() || null },
            })}
            onDrafted={() => {
              setTitle("");
              setBrief("");
              setLength("");
            }}
          >
            <Field label="What it is">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Kano results, two-minute package"
                className={inputClass}
              />
            </Field>
            <Field label="Where it goes">
              <select
                value={output}
                onChange={(event) => setOutput(event.target.value)}
                className={inputClass}
              >
                {OUTPUTS.map((row) => (
                  <option key={row}>{row}</option>
                ))}
              </select>
            </Field>
            <Field label="Duration" hint="Seconds. Optional, and the thing everybody forgets.">
              <input
                value={length}
                onChange={(event) => setLength(event.target.value)}
                inputMode="numeric"
                placeholder="120"
                className={inputClass}
              />
            </Field>
            <Field label="The brief">
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={3}
                placeholder="Open on the map, two-way with our agent at 20/03, close on the coverage figure."
                className={inputClass}
              />
            </Field>
          </Composer>
        )}

        <div className="mt-5 border-t border-dash-line pt-4">
          <h3 className="flex items-center gap-2 text-[0.75rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
            <Film size={14} strokeWidth={2.5} />
            What the cut can draw on
          </h3>
          <ul className="mt-2 space-y-1 text-[0.8125rem] leading-relaxed text-dash-muted">
            <li>The count, as a rendered frame — see the graphics bench.</li>
            <li>The map, in any of its six modes.</li>
            <li>Coverage and turnout figures, with their denominators.</li>
            <li>Field reports, as text. Pictures stay with the room running the count.</li>
          </ul>
        </div>
      </Card>

      <Card title="Packages tonight" subtitle="Every job, and where it got to">
        <Queue items={clips} empty="No packages have been commissioned tonight." />
      </Card>
    </div>
  );
}
