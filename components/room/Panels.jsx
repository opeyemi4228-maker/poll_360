import Link from "next/link";
import { ChevronRight, Lock, Phone, Scale, UserRound } from "lucide-react";

import nation from "@/public/geo/map/nation.json";
import { Badge, Card, Empty } from "@/components/dash/DashCard";
import ActionForm, { Area, Choice, Submit } from "./ActionForm";
import BvasBlock from "./BvasBlock";
import { Coverage, LightBadge, LightCounts, LightIcon, TONE } from "./Light";
import { ITEMS, LIGHTS, RESOLUTIONS } from "@/lib/lights";
import { ZONES } from "@/lib/zones";
import { STATES } from "@/lib/units";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The panels every situation room screen is assembled from.
 *
 * Server components: each is given the rows it draws and draws them. None
 * fetches, none decides who may do what. A screen is a page that loads its
 * ground's data once and hands slices of it to these.
 */

/** "12 min", "3 h 05", for how long something has been open. */
export function age(iso, now = Date.now()) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" });
export const clock = (iso) => (iso ? TIME.format(new Date(iso)) : "");

/** Keep the rest of the query while changing one part of it. */
export function hrefWith(base, query = {}, change = {}) {
  const next = { ...query, ...change };
  const text = Object.entries(next)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return text ? `${base}?${text}` : base;
}

/* ------------------------------------------------------------------ status */

/** One place's light, counts, coverage and BVAS: the header of every screen. */
export function StatusCard({ light, title = null, rate = null, className }) {
  return (
    <Card title={title ?? light.name} className={className} action={<LightBadge light={light.light} coverage={light.coveragePct} />}>
      <LightCounts counts={light.counts} />
      <Coverage reported={light.reported} total={light.total} className="mt-4" />
      {rate != null && (
        <p className="mt-2 text-[0.8125rem] text-dash-muted tabular-nums">
          {rate > 0 ? `${rate} results a minute over the last ten minutes` : "No results in the last ten minutes"}
        </p>
      )}
      <BvasBlock bvas={light.bvas} total={light.total} className="mt-4 border-0 bg-dash-bg" />
    </Card>
  );
}

/* --------------------------------------------------------------- the grid */

const NUMBER_BY_CODE = new Map(STATES.map((state) => [state.code, state.number]));
const SORTS = { zone: "By zone", light: "Worst first", coverage: "Least reported first", red: "Most red first" };
const RANK = { RED: 3, YELLOW: 2, GREEN: 1, GREY: 0 };

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** A state in three short lines, so thirty-seven of them fit on one laptop screen. */
function SmallTile({ row, href, unobserved }) {
  return (
    <Link
      href={href}
      title={`${row.name}: ${LIGHTS[row.light].label}`}
      className={cn("block rounded-md border-l-4 bg-dash-card px-2 py-1.5 shadow-e2 hover:shadow-e3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dash-ink", TONE[row.light].line, TONE[row.light].soft)}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="truncate text-[0.8125rem] leading-tight font-bold text-dash-ink">{row.name}</span>
        <LightIcon light={row.light} size={14} />
      </span>
      <span className="block text-[0.6875rem] leading-tight font-semibold tabular-nums">
        <span className="text-light-red">✖{COMPACT.format(row.counts.red)}</span>{" "}
        <span className="text-light-yellow-ink">▲{COMPACT.format(row.counts.yellow)}</span>{" "}
        <span className="text-light-green">✔{COMPACT.format(row.counts.green)}</span>{" "}
        <span className="text-dash-muted">○{COMPACT.format(row.counts.grey)}</span>
      </span>
      <span className="block truncate text-[0.6875rem] leading-tight text-dash-muted tabular-nums">
        {row.reported ? `${row.coveragePct.toFixed(1)}% reported` : "No returns yet"}
      </span>
      <span className="block truncate text-[0.6875rem] leading-tight text-dash-muted tabular-nums">
        {unobserved ? <b className="text-light-yellow-ink">▲ No observer{row.bvas.accredited != null ? " · " : ""}</b> : null}
        {row.bvas.accredited != null ? `BVAS ${COMPACT.format(row.bvas.accredited)}` : unobserved ? "" : "\u00a0"}
      </span>
    </Link>
  );
}

function Tile({ row, href, unobserved }) {
  return (
    <Link
      href={href}
      className={cn("block rounded-dash-sm border-l-4 bg-dash-card p-3 shadow-e2 transition-shadow hover:shadow-e3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dash-ink", TONE[row.light].line)}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[0.875rem] font-bold text-dash-ink">{row.name}</span>
        <LightIcon light={row.light} />
      </span>
      <span className={cn("mt-0.5 block text-[0.75rem] font-bold", TONE[row.light].text)}>{LIGHTS[row.light].short}</span>
      <LightCounts counts={row.counts} className="mt-1.5 gap-x-2 text-[0.75rem]" />
      <span className="mt-1.5 block text-[0.75rem] text-dash-muted tabular-nums">
        {row.reported ? `${row.coveragePct.toFixed(1)}% reported` : "No returns yet"}
        {row.bvas.accredited != null && <> · BVAS {formatNumber(row.bvas.accredited)}</>}
      </span>
      {unobserved && <span className="mt-1 block text-[0.75rem] font-bold text-light-yellow-ink">▲ Unobserved</span>}
    </Link>
  );
}

/**
 * Every state on one screen, grouped by zone, each tile with its light,
 * counts, coverage and BVAS. The same rows as a table sit underneath, with
 * no colour in them.
 */
export function StateGrid({ rows, base, query = {}, unobserved = new Set(), compact = false }) {
  const sort = SORTS[query.sort] ? query.sort : "zone";
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const tile = (row) => <Tile key={row.code} row={row} href={hrefWith(base, query, { at: row.code, unit: null })} unobserved={unobserved.has(row.code)} />;
  const ordered = [...rows].sort((a, b) =>
    sort === "light" ? RANK[b.light] - RANK[a.light] || b.counts.red - a.counts.red
      : sort === "coverage" ? a.coveragePct - b.coveragePct
        : b.counts.red - a.counts.red || RANK[b.light] - RANK[a.light]
  );

  return (
    <Card
      title="States"
      subtitle={compact ? "The worst thing open in each state. Green is cleared so far, never complete." : "Each light is the worst thing open in the state. Green means cleared so far, never complete."}
      action={
        <nav aria-label="Sort the states" className="flex flex-wrap gap-1">
          {Object.entries(SORTS).map(([key, label]) => (
            <Link key={key} href={hrefWith(base, query, { sort: key === "zone" ? null : key })} className={cn("rounded-full px-2.5 py-1 text-[0.75rem] font-semibold", sort === key ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink")}>
              {label}
            </Link>
          ))}
        </nav>
      }
    >
      {compact && sort === "zone" ? (
        /* Six zones as six columns: every state on the screen at once. */
        <div className="grid grid-cols-3 gap-x-2 gap-y-3 lg:grid-cols-6">
          {Object.entries(ZONES).map(([zone, codes]) => {
            const mine = codes.map((code) => byCode.get(NUMBER_BY_CODE.get(code))).filter(Boolean);
            if (!mine.length) return null;
            return (
              <section key={zone} className="min-w-0 space-y-1.5">
                <h3 className="truncate text-[0.75rem] font-bold text-dash-muted">{zone}</h3>
                {mine.map((row) => <SmallTile key={row.code} row={row} href={hrefWith(base, query, { at: row.code, unit: null })} unobserved={unobserved.has(row.code)} />)}
              </section>
            );
          })}
        </div>
      ) : compact ? (
        <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-6">
          {ordered.map((row) => <SmallTile key={row.code} row={row} href={hrefWith(base, query, { at: row.code, unit: null })} unobserved={unobserved.has(row.code)} />)}
        </div>
      ) : sort === "zone" ? (
        <div className="space-y-4">
          {Object.entries(ZONES).map(([zone, codes]) => {
            const mine = codes.map((code) => byCode.get(NUMBER_BY_CODE.get(code))).filter(Boolean);
            if (!mine.length) return null;
            return (
              <section key={zone}>
                <h3 className="mb-2 text-[0.8125rem] font-bold text-dash-muted">{zone}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-7">{mine.map(tile)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-7">{ordered.map(tile)}</div>
      )}
      <details className="mt-5">
        <summary className="cursor-pointer text-[0.8125rem] font-semibold text-blue-700">Show this as a table</summary>
        <LightTable rows={sort === "zone" ? rows : ordered} base={base} query={query} className="mt-3" />
      </details>
    </Card>
  );
}

/* ------------------------------------------------------------- drill table */

/** The places under one place, as a table. A row opens the place, or the polling unit. */
export function LightTable({ rows, base, query = {}, className }) {
  if (!rows.length) return <Empty>Nothing on your ground here.</Empty>;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[44rem] text-left text-[0.8125rem] tabular-nums">
        <thead className="text-dash-muted">
          <tr className="border-b border-dash-line">
            {["Light", "Place", "Reported", "BVAS accredited", "Votes cast", "Red", "Yellow", "No returns"].map((head) => (
              <th key={head} scope="col" className="px-2 py-2 font-semibold">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const unit = row.level === "pu";
            return (
              <tr key={row.code} className="border-b border-dash-line last:border-0">
                <td className="px-2 py-2"><LightBadge light={row.light} short /></td>
                <th scope="row" className="px-2 py-2 font-semibold">
                  <Link href={hrefWith(base, query, unit ? { unit: row.code } : { at: row.code, unit: null })} className="text-dash-ink underline-offset-2 hover:underline">
                    {row.name}
                  </Link>
                  <span className="ml-1.5 font-mono text-[0.75rem] font-normal text-dash-muted">{row.code}</span>
                </th>
                <td className="px-2 py-2">{unit ? (row.reported ? "Result in" : "No returns yet") : `${formatNumber(row.reported)} of ${formatNumber(row.total)}`}</td>
                <td className="px-2 py-2">{row.bvas.accredited == null ? (row.reported ? "No figure" : "") : formatNumber(row.bvas.accredited)}</td>
                <td className="px-2 py-2">{row.bvas.accredited == null ? "" : formatNumber(row.bvas.cast)}</td>
                <td className="px-2 py-2">{unit ? "" : formatNumber(row.counts.red + row.areaItems.red)}</td>
                <td className="px-2 py-2">{unit ? "" : formatNumber(row.counts.yellow + row.areaItems.yellow)}</td>
                <td className="px-2 py-2">{unit ? "" : formatNumber(row.counts.grey)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Nigeria › Kano › Dala, each a link back up. */
export function Crumbs({ trail, base, query = {} }) {
  return (
    <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 text-[0.8125rem] font-semibold">
      {trail.map((step, index) => (
        <span key={step.code || "top"} className="inline-flex items-center gap-1">
          {index > 0 && <ChevronRight size={13} className="text-dash-muted" aria-hidden="true" />}
          {index === trail.length - 1 ? (
            <span className="text-dash-ink">{step.name}</span>
          ) : (
            <Link href={hrefWith(base, query, { at: step.code || null, unit: null })} className="text-blue-700 hover:underline">{step.name}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ----------------------------------------------------------------- the map */

const FILL = { RED: "var(--color-light-red)", YELLOW: "var(--color-light-yellow)", GREEN: "var(--color-light-green)", GREY: "var(--color-light-grey-soft)" };
const MARK = { RED: "✖", YELLOW: "▲", GREEN: "✔", GREY: "○" };

/**
 * The country, each state filled with its light and marked with the light's
 * own shape at its centre, so the map reads without colour. A state opens
 * its own places in the table beside it.
 */
export function LightMap({ rows, base, query = {}, wall = false }) {
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return (
    <figure>
      <svg viewBox={`0 0 ${nation.width} ${nation.height}`} className="h-auto w-full" role="img" aria-label="Map of Nigeria, each state filled with its light">
        {nation.states.map((shape) => {
          const row = byCode.get(NUMBER_BY_CODE.get(shape.code));
          if (!row) return <path key={shape.code} d={shape.d} fill="var(--color-dash-bg)" stroke="var(--color-dash-line)" strokeWidth="1" opacity="0.5" />;
          const label = `${row.name}: ${LIGHTS[row.light].label}. ${row.reported ? `${row.coveragePct.toFixed(1)}% reported` : "No returns yet"}`;
          const body = (
            <>
              <path d={shape.d} fill={FILL[row.light]} stroke="#fff" strokeWidth="1.5" strokeDasharray={row.light === "GREY" ? "4 3" : undefined} />
              <text x={shape.at[0]} y={shape.at[1]} textAnchor="middle" fontSize={nation.labelSize} fontWeight="700" fill={row.light === "GREY" || row.light === "YELLOW" ? "#1b2140" : "#fff"} pointerEvents="none">
                <tspan>{MARK[row.light]}</tspan>
                <tspan x={shape.at[0]} dy={nation.labelSize + 1}>{shape.code}</tspan>
              </text>
              <title>{label}</title>
            </>
          );
          return wall ? <g key={shape.code}>{body}</g> : (
            <a key={shape.code} href={hrefWith(base, query, { at: row.code, unit: null })} aria-label={label}>{body}</a>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] font-semibold">
        {["RED", "YELLOW", "GREEN", "GREY"].map((light) => (
          <span key={light} className={cn("inline-flex items-center gap-1", TONE[light].text)}>
            <LightIcon light={light} size={13} /> {LIGHTS[light].label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------- items */

const RESOLVE_FOR = {
  RED: ["CLERICAL_ERROR_CORRECTED", "CONFIRMED_GENUINE_NO_ISSUE", "CONFIRMED_MALPRACTICE_ESCALATED", "DUPLICATE", "DISPUTED"],
  YELLOW: ["CLERICAL_ERROR_CORRECTED", "CONFIRMED_GENUINE_NO_ISSUE", "FIELD_CONFIRMED", "DUPLICATE", "CONFIRMED_MALPRACTICE_ESCALATED", "DISPUTED"],
};

/**
 * Open items, red first then oldest. `caps` says which controls to offer
 * this reader; the server decides again when one is pressed.
 */
export function ItemList({ items, caps = {}, base, query = {}, roster = [], userId = null, empty = "Nothing open here.", now }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-dash-line">
      {items.map((item) => {
        const kind = ITEMS[item.code];
        const byPerson = kind?.closes === "person";
        const mayResolve = byPerson && (item.light === "RED" ? caps.red : caps.yellow || (kind.field && caps.field)) && item.raisedBy !== userId && item.filedBy !== userId && (!kind.top || caps.closeDispute);
        const heldByOther = item.locked && item.ownerId && item.ownerId !== userId;
        const options = (RESOLVE_FOR[item.light] ?? []).filter((key) => (key !== "DISPUTED" || (caps.dispute && item.level === "pu" && item.code !== "R_DISPUTED")));
        return (
          <li key={item.id} className="py-3">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                <LightIcon light={item.light} />
                <span className="min-w-[11rem] flex-1">
                  <span className="block text-[0.875rem] font-bold text-dash-ink">{item.title}</span>
                  <span className="block truncate text-[0.8125rem] text-dash-muted">{item.place}{item.says ? ` · ${item.says}` : ""}</span>
                </span>
                {item.priority === "HIGH" && <Badge tone="alert">High priority</Badge>}
                {item.escalatedTo && <Badge tone="ink">To {item.escalatedTo.replace("_", " ").toLowerCase()}</Badge>}
                {item.ownerName && (
                  <Badge tone={heldByOther ? "warn" : "neutral"}>
                    {item.locked && <Lock size={11} aria-hidden="true" />} {item.ownerName}
                  </Badge>
                )}
                <span className="text-[0.75rem] font-semibold text-dash-muted tabular-nums" title={`Opened ${clock(item.openedAt)}`}>{age(item.openedAt, now)}</span>
              </summary>

              <div className="mt-3 space-y-3 rounded-dash-sm bg-dash-bg p-3">
                {item.escalationNote && <p className="text-[0.8125rem] text-dash-ink"><b>{item.escalatedName ?? "Escalated"}:</b> {item.escalationNote}</p>}
                {item.returnedNote && <p className="text-[0.8125rem] text-dash-ink"><b>Sent back:</b> {item.returnedNote}</p>}
                {!byPerson && <p className="text-[0.8125rem] text-dash-muted">This closes by itself when the thing it is waiting for happens.</p>}
                {heldByOther && <p className="text-[0.8125rem] font-semibold text-light-yellow-ink">{item.ownerName} has this open now.</p>}

                <div className="flex flex-wrap items-center gap-2">
                  {item.level === "pu" && base && (
                    <Link href={hrefWith(base, query, { unit: item.areaCode })} className="inline-flex h-10 items-center rounded-dash-sm border border-dash-line bg-dash-card px-4 text-[0.8125rem] font-semibold text-dash-ink hover:border-dash-ink">
                      Open the polling unit
                    </Link>
                  )}
                  {item.ownerId === userId ? (
                    <ActionForm what="release" hidden={{ id: item.id }}><Submit variant="dashOutline">Let it go</Submit></ActionForm>
                  ) : (
                    !heldByOther && <ActionForm what="take" hidden={{ id: item.id }}><Submit variant="dashOutline">Take it</Submit></ActionForm>
                  )}
                  {caps.lead && <ActionForm what="legal" hidden={{ id: item.id }}><Submit variant="dashOutline"><Scale size={14} aria-hidden="true" /> {item.legal ? "With legal" : "Send to legal"}</Submit></ActionForm>}
                </div>

                {mayResolve && (
                  <ActionForm what="resolve" hidden={{ id: item.id }} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
                    <Choice label="Resolve as" name="resolution" options={options.map((key) => [key, RESOLUTIONS[key].label])} />
                    <Area label="Note" name="note" rows={1} placeholder="What you found" />
                    <Submit>Resolve</Submit>
                  </ActionForm>
                )}

                {(caps.escalate || caps.lead) && (
                  <ActionForm what="escalate" hidden={{ id: item.id }} className="grid gap-2 sm:grid-cols-[10rem_8rem_1fr_auto] sm:items-end">
                    <Choice label="Escalate to" name="to" options={[["ZONE_LEAD", "Zone lead"], ["LEAD_VERIFIER", "Lead verifier"], ["DIRECTOR", "Director"]]} />
                    <Choice label="Priority" name="priority" options={[["NORMAL", "Normal"], ["HIGH", "High"]]} />
                    <Area label="What you need" name="note" rows={1} required />
                    <Submit variant="dashOutline">Escalate</Submit>
                  </ActionForm>
                )}

                {caps.lead && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {roster.length > 0 && (
                      <ActionForm what="assignItem" hidden={{ id: item.id }} className="flex items-end gap-2">
                        <Choice label="Assign to" name="owner" className="flex-1" options={roster.map((person) => [person.id, `${person.name}${person.online ? "" : " (away)"}`])} />
                        <Submit variant="dashOutline">Assign</Submit>
                      </ActionForm>
                    )}
                    {item.escalatedTo && (
                      <ActionForm what="giveBack" hidden={{ id: item.id }} className="flex items-end gap-2">
                        <Area label="Send back with a note" name="note" rows={1} className="flex-1" required />
                        <Submit variant="dashOutline">Return</Submit>
                      </ActionForm>
                    )}
                  </div>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------- the field */

/** Reports from the field. Unacknowledged trouble is at the top and says so. */
export function IncidentList({ rows, caps = {}, base, query = {}, empty = "No reports from the field.", now }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-dash-line">
      {rows.map((row) => {
        const critical = row.sos || row.severity === "CRITICAL";
        return (
          <li key={row.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
            {critical ? <Phone size={16} className="mt-0.5 text-light-red" aria-hidden="true" /> : <LightIcon light="YELLOW" className="mt-0.5" />}
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-bold text-dash-ink">
                {row.sos ? "SOS · " : ""}{row.kind}
                <span className="ml-2 text-[0.75rem] font-semibold text-dash-muted">{clock(row.createdAt)} · {age(row.createdAt, now)} ago</span>
              </p>
              <p className="text-[0.8125rem] text-dash-muted">
                {base ? <Link href={hrefWith(base, query, { unit: row.unitCode })} className="hover:underline">{row.place}</Link> : row.place}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.8125rem] text-dash-ink">
                {row.reporter && <span className="inline-flex items-center gap-1"><UserRound size={13} aria-hidden="true" /> {row.reporter}</span>}
                {row.reporterPhone && caps.act && (
                  <>
                    <a href={`tel:+${row.reporterPhone}`} className="font-semibold text-blue-700 hover:underline">Call +{row.reporterPhone}</a>
                    <a href={`https://wa.me/${row.reporterPhone}`} className="font-semibold text-blue-700 hover:underline">WhatsApp</a>
                  </>
                )}
                {row.hasPhoto && <span className="text-dash-muted">Photograph attached</span>}
              </p>
              <p className="mt-0.5 text-[0.75rem] font-semibold text-dash-muted">
                {row.status !== "OPEN" ? `Dealt with by ${row.resolvedName ?? "the desk"}` : row.acknowledgedName ? `Acknowledged by ${row.acknowledgedName} at ${clock(row.acknowledgedAt)}` : critical ? "Not acknowledged yet" : "Open"}
                {row.assignedTo && row.status === "OPEN" ? ` · with ${row.assignedTo}` : ""}
              </p>
            </div>
            {caps.act && row.status === "OPEN" && (
              <div className="flex flex-wrap gap-2">
                {!row.acknowledgedAt && <ActionForm what="acknowledge" hidden={{ id: row.id }}><Submit>Acknowledge</Submit></ActionForm>}
                {!row.assignedTo && <ActionForm what="assignIncident" hidden={{ id: row.id, name: "Field operations" }}><Submit variant="dashOutline">Give to field ops</Submit></ActionForm>}
                <ActionForm what="resolveIncident" hidden={{ id: row.id }} confirm="Mark this report as dealt with?"><Submit variant="dashOutline">Dealt with</Submit></ActionForm>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------- the three records */

const sumOf = (votes) => Object.values(votes ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);
const lead = (votes) => {
  const ranked = Object.entries(votes ?? {}).sort((a, b) => b[1] - a[1]);
  return ranked[0] && ranked[0][1] > 0 ? ranked[0][0] : null;
};

const WHY_NONE = {
  "no-bank": "Data Bank is not connected, so INEC's sheets cannot be read here yet.",
  "not-opened": "INEC's result portal has not been gathered yet.",
  "no-election": "This project has not been linked to an election on INEC's portal yet.",
  "not-listed": "INEC's result portal has not been gathered yet.",
  "not-gathered": "INEC's sheets for this election have not been gathered yet.",
};

/** Rows for the three-record table, from lib/irev/verify.js `inecAgainstOurs`. */
export function gapRows(account, take = 20) {
  if (!account || account.none || !Array.isArray(account.children)) return [];
  return account.children
    .map((place) => {
      const ours = place.shared?.ours ?? {};
      const inec = place.shared?.inec ?? {};
      const gap = Object.keys({ ...ours, ...inec }).reduce((total, party) => total + Math.abs((ours[party] ?? 0) - (inec[party] ?? 0)), 0);
      return {
        key: place.key,
        name: place.name,
        compared: place.shared?.units ?? 0,
        differ: place.shared?.differ ?? 0,
        ours: sumOf(ours),
        inec: sumOf(inec),
        oursLead: lead(ours),
        inecLead: lead(inec),
        announced: place.announced ? sumOf(place.announced.votes) : null,
        announcedLead: place.announced ? lead(place.announced.votes) : null,
        gap,
      };
    })
    .filter((row) => row.compared > 0 || row.announced != null)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, take);
}

/**
 * Our agents, INEC's sheets and the announcement, side by side, compared
 * only on the polling units both sides hold. Where there is not enough to
 * compare, it says that, and does not print a gap made of coverage.
 */
export function ThreeRecords({ account, base, query = {}, lights = new Map() }) {
  if (!account || account.none) {
    return <Empty>{WHY_NONE[account?.why] ?? "There is nothing to compare yet. This fills as our agents file and INEC publishes its sheets."}</Empty>;
  }
  const rows = gapRows(account);
  if (!rows.length) return <Empty>No polling unit is held by both our agents and INEC&apos;s sheets yet, so there is nothing to set side by side.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-[0.8125rem] tabular-nums">
        <thead className="text-dash-muted">
          <tr className="border-b border-dash-line">
            {["Place", "Our agents", "INEC's sheets", "Announced", "Gap", "Units compared", "Light"].map((head) => (
              <th key={head} scope="col" className="px-2 py-2 font-semibold">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mismatch = row.oursLead && row.inecLead && row.oursLead !== row.inecLead;
            return (
              <tr key={row.key} className="border-b border-dash-line last:border-0">
                <th scope="row" className="px-2 py-2 font-semibold">
                  <Link href={hrefWith(base, query, { at: row.key, unit: null })} className="text-dash-ink hover:underline">{row.name}</Link>
                </th>
                <td className="px-2 py-2">{formatNumber(row.ours)}{row.oursLead ? ` · ${row.oursLead}` : ""}</td>
                <td className="px-2 py-2">{formatNumber(row.inec)}{row.inecLead ? ` · ${row.inecLead}` : ""}</td>
                <td className="px-2 py-2">{row.announced == null ? "Not held" : `${formatNumber(row.announced)}${row.announcedLead ? ` · ${row.announcedLead}` : ""}`}</td>
                <td className={cn("px-2 py-2 font-bold", mismatch ? "text-light-red" : row.gap ? "text-light-yellow-ink" : "text-dash-ink")}>
                  {mismatch ? "✖ " : row.gap ? "▲ " : "✔ "}{formatNumber(row.gap)}
                </td>
                <td className="px-2 py-2">{formatNumber(row.compared)}</td>
                <td className="px-2 py-2">{lights.get(row.key) ? <LightBadge light={lights.get(row.key)} short /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[0.75rem] text-dash-muted">Each row compares only the polling units that both our agents and INEC&apos;s sheets hold. A place one side has not reached is coverage, not a gap.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ people */

/** Who is on, what they cover, and how much they have open. */
export function Roster({ people, describe, className }) {
  if (!people.length) return <Empty icon={UserRound}>Nobody is assigned here yet.</Empty>;
  return (
    <ul className={cn("divide-y divide-dash-line", className)}>
      {people.map((person) => (
        <li key={person.id} className="flex items-center gap-3 py-2 text-[0.8125rem]">
          <span className={cn("size-2.5 shrink-0 rounded-full", person.online ? "bg-light-green" : "border border-light-grey")} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-dash-ink">{person.name} <span className="font-normal text-dash-muted">· {person.online ? "online" : "away"}</span></span>
            <span className="block truncate text-dash-muted">{describe(person)}</span>
          </span>
          {person.openItems > 0 && <Badge>{person.openItems} open</Badge>}
        </li>
      ))}
    </ul>
  );
}

/** The note for whoever takes this desk next, and the ones left for you. */
export function Handover({ desk, notes, userId }) {
  return (
    <Card title="Shift handover" subtitle="What the next person at this desk needs to know. They accept it by name.">
      <ActionForm what="handOver" hidden={{ desk }} className="space-y-2" done="Left for the next shift.">
        <Area label="Your note" name="body" rows={3} required placeholder="What is open, who you are waiting on, what to watch" />
        <Submit>Leave handover</Submit>
      </ActionForm>
      {notes.length > 0 && (
        <ul className="mt-4 divide-y divide-dash-line">
          {notes.map((note) => (
            <li key={note.id} className="py-3 text-[0.8125rem]">
              <p className="whitespace-pre-wrap text-dash-ink">{note.body}</p>
              <p className="mt-1 text-[0.75rem] text-dash-muted">
                {note.byName} · {clock(note.at)}
                {note.acceptedBy ? ` · taken over by ${note.acceptedBy} at ${clock(note.acceptedAt)}` : " · not taken over yet"}
              </p>
              {!note.acceptedBy && note.byId !== userId && (
                <ActionForm what="acceptHandover" hidden={{ id: note.id }} className="mt-2"><Submit variant="dashOutline">I have taken over</Submit></ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Anybody in the room may say that something technical is broken. */
export function RaiseTech() {
  return (
    <details className="rounded-dash border border-dash-line bg-dash-card p-4">
      <summary className="cursor-pointer text-[0.875rem] font-bold text-dash-ink">Something technical is not working</summary>
      <ActionForm what="techRaise" className="mt-3 space-y-2" done="Sent to the technical team.">
        <Area label="What is wrong, in a line" name="title" rows={1} required />
        <Area label="Anything that helps them find it" name="detail" rows={2} />
        <Choice label="How bad" name="severity" options={[["MINOR", "Slows me down"], ["MAJOR", "I cannot do my job"], ["CRITICAL", "The count is at risk"]]} />
        <Submit variant="dashOutline">Tell the technical team</Submit>
      </ActionForm>
    </details>
  );
}
