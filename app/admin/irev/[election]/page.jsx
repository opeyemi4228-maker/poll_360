import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitCompareArrows, ListFilter, TriangleAlert } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge, Empty } from "@/components/dash/DashCard";
import { Cell, Counts, Table } from "@/components/dash/SystemBits";
import Button from "@/components/ui/Button";
import { words } from "@/components/dash/PictureReport";
import { results } from "@/lib/db";
import { listElections } from "@/lib/election-scope";
import { requireCapability } from "@/lib/guard";
import { bank } from "@/lib/irev/bank";
import { inecReader } from "@/lib/irev/reader";
import { compare } from "@/lib/irev/compare";
import * as vault from "@/lib/irev/vault";
import { defaultRace } from "@/lib/races";
import { formatNumber } from "@/lib/utils";

import Runner from "../Runner";
import { linkProject } from "../actions";
import PrepareList from "./PrepareList";

export const metadata = { title: "INEC results", robots: { index: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE = 50;

const VIEWS = [
  ["all", "Every polling unit"],
  ["up", "Sheet is up"],
  ["missing", "No sheet published"],
  ["late", `Went up ${vault.LATE_DAYS}+ days late`],
  ["replaced", "Sheet replaced"],
  ["gone", "Gone from INEC's storage"],
  ["read", "Read into figures"],
  ["unread", "Waiting to be read"],
  ["unreadable", "Could not be read"],
  ["doubt", "Reading in doubt"],
  ["overvote", "More votes than voters"],
  ["flagged", "Picture worth a look"],
];

/** "05/16/01" as a place to narrow to, or null. The start of a unit's code. */
function placeFrom(value) {
  const parts = String(value ?? "").split("/").filter(Boolean).slice(0, 3);
  return parts.length && parts.every((part) => /^\d{2}$/.test(part)) ? parts.join("/") : null;
}

const FIELD =
  "h-10 rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none";

/**
 * One gathered election, polling unit by polling unit.
 *
 * This is where what was gathered can actually be seen: every unit, whether
 * its sheet is up, when and where the sheet was photographed, the figures
 * read off it, and how those sit against the return our own agent filed.
 */
export default async function ElectionPage({ params, searchParams }) {
  const admin = await requireCapability("system:read", "/admin/irev");
  const { election: raw } = await params;
  const picked = await searchParams;

  const db = bank();
  const id = Number(raw);
  if (!db || !Number.isInteger(id) || !(await vault.ready(db))) notFound();

  const election = (await vault.elections(db)).find((entry) => entry.election_id === id);
  if (!election) notFound();

  const show = VIEWS.some(([key]) => key === picked?.show) ? picked.show : "all";
  const lga = picked?.lga ? Number(picked.lga) : null;
  const q = String(picked?.q ?? "").trim().slice(0, 60) || null;
  const under = placeFrom(picked?.under);
  const heldOn = election.held_on ?? null;
  const page = Math.max(1, Number(picked?.page) || 1);

  const [counts, lgas, list, projects] = await Promise.all([
    vault.unitCounts(db, id, heldOn),
    vault.lgas(db, id),
    vault.units(db, id, { show, lga, q, under, heldOn, limit: PAGE, offset: (page - 1) * PAGE }),
    listElections(),
  ]);

  /* Our own returns for the project this election is compared with. */
  const project = projects.find((entry) => entry.id === election.project_id) ?? null;
  const held = project
    ? compare(await results.counted(project.id, defaultRace(project), null), await vault.readings(db, id))
    : null;

  const link = (over) => {
    const query = new URLSearchParams();
    const next = { show, lga, q, under, page: 1, ...over };
    if (next.show && next.show !== "all") query.set("show", next.show);
    if (next.lga) query.set("lga", next.lga);
    if (next.under) query.set("under", next.under);
    if (next.q) query.set("q", next.q);
    if (next.page > 1) query.set("page", next.page);
    const text = query.toString();
    return `/admin/irev/${id}${text ? `?${text}` : ""}`;
  };

  const pages = Math.max(1, Math.ceil(list.total / PAGE));
  const working = election.pass_started_at || election.sheets_held > election.pictures_examined ? 1 : 0;

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title={election.name}
      lead={`Held ${election.held_on ?? "on a date INEC did not give"}. Every polling unit INEC lists for it, the sheet published for each, and what was read from it.`}
      actions={
        <Button href="/admin/irev" variant="dashOutline" size="sm">
          <ArrowLeft size={14} /> All elections
        </Button>
      }
    >
      <Runner working={working} watching={election.watching ? 1 : 0} />

      <Counts
        items={[
          { label: "Polling units", value: formatNumber(counts.all ?? 0), context: election.pass_started_at ? `still gathering · ${formatNumber(election.wards_left)} ward(s) to go` : null },
          {
            label: "Sheets up",
            value: formatNumber(counts.up ?? 0),
            context: `${formatNumber(counts.missing ?? 0)} unit(s) with none · ${formatNumber(counts.late ?? 0)} went up ${vault.LATE_DAYS} or more days late`,
            tone: (counts.missing ?? 0) > 0 ? "alert" : undefined,
          },
          {
            label: "Pictures examined",
            value: formatNumber(counts.examined ?? 0),
            context: `${formatNumber(counts.located ?? 0)} carry the spot they were taken`,
            tone: (counts.flagged ?? 0) > 0 ? "alert" : undefined,
          },
          {
            label: "Read into figures",
            value: formatNumber(counts.read ?? 0),
            context: counts.read ? `${formatNumber(counts.doubt ?? 0)} in doubt` : `${formatNumber(counts.unread ?? 0)} waiting`,
            tone: "good",
          },
        ]}
      />

      <div className="grid gap-6">
        <Card
          title="Against our own returns"
          subtitle="INEC's published sheet for a polling unit, held against what our agent filed from the same unit."
          action={<GitCompareArrows size={16} className="text-dash-muted" />}
        >
          <form action={linkProject} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="election" value={id} />
            <div>
              <label htmlFor="project" className="block text-[0.75rem] font-medium text-dash-muted">
                Compare with our project
              </label>
              <select id="project" name="project" defaultValue={election.project_id ?? ""} className={`${FIELD} mt-1.5 min-w-64`}>
                <option value="">None</option>
                {projects.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.title ?? entry.name ?? entry.id}</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="dash" size="sm">Save</Button>
          </form>

          {held && (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-dash border border-dash-line bg-dash-line sm:grid-cols-5">
                {[
                  ["In both", held.both],
                  ["Agree", held.agree],
                  ["Differ", held.differ.length],
                  ["Could not be compared", held.unsure],
                  ["Only we have", held.onlyOurs],
                ].map(([label, value]) => (
                  <div key={label} className="bg-dash-card px-4 py-3">
                    <dt className="text-[0.75rem] font-medium text-dash-muted">{label}</dt>
                    <dd className={`figure mt-1 text-[1.25rem] font-bold ${label === "Differ" && value > 0 ? "text-red-600" : "text-dash-ink"}`}>
                      {formatNumber(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              {held.inec === 0 ? (
                <p className="mt-4 text-[0.8125rem] text-dash-muted">
                  No sheet of this election has been read into figures yet, so there is nothing to hold our returns
                  against.
                </p>
              ) : held.differ.length > 0 ? (
                <div className="mt-5">
                  <Table head={["Polling unit", "What differs (ours → INEC)", ""]}>
                    {held.differ.slice(0, 25).map((unit) => (
                      <tr key={unit.unitCode}>
                        <Cell strong>{unit.unitCode}</Cell>
                        <Cell>
                          {unit.gaps.slice(0, 5).map((gap) => `${gap.what} ${formatNumber(gap.ours)} → ${formatNumber(gap.inec)}`).join(" · ")}
                        </Cell>
                        <Cell>
                          <Link href={`/admin/irev/${id}/${unit.unitId}`} className="font-semibold underline underline-offset-2">
                            Open both
                          </Link>
                        </Cell>
                      </tr>
                    ))}
                  </Table>
                  <p className="mt-3 text-[0.75rem] text-dash-muted">
                    A difference means one of three things: our agent mistyped, the reading of INEC&rsquo;s sheet is
                    wrong, or the sheet published is not the one our agent saw. Open both to see which.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </Card>

        <Card
          title="Polling units"
          subtitle={`${formatNumber(list.total)} shown. Open one to see its sheet, its picture details and its figures.`}
          action={<ListFilter size={16} className="text-dash-muted" />}
        >
          <nav className="flex flex-wrap gap-2" aria-label="Which polling units to show">
            {VIEWS.map(([key, label]) => (
              <Link
                key={key}
                href={link({ show: key })}
                aria-current={show === key ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-dash-sm border px-3 py-1.5 text-[0.8125rem] font-semibold ${
                  show === key ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                }`}
              >
                {key === "flagged" && (counts.flagged ?? 0) > 0 && <TriangleAlert size={13} />}
                {label}
                <span className="figure tabular-nums opacity-70">{formatNumber(counts[key] ?? 0)}</span>
              </Link>
            ))}
          </nav>

          <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
            {show !== "all" && <input type="hidden" name="show" value={show} />}
            {under && <input type="hidden" name="under" value={under} />}
            <select name="lga" defaultValue={lga ?? ""} className={FIELD} aria-label="Local government">
              <option value="">Every local government</option>
              {lgas.map((entry) => (
                <option key={entry.lga_id} value={entry.lga_id}>{entry.name}</option>
              ))}
            </select>
            <input name="q" defaultValue={q ?? ""} placeholder="Unit code or name" className={`${FIELD} min-w-56`} aria-label="Unit code or name" />
            <Button type="submit" variant="dashOutline" size="sm">Show</Button>
          </form>

          {under && (
            <p className="mt-4 text-[0.8125rem] text-dash-muted">
              Only polling units whose code begins <span className="figure font-bold text-dash-ink">{under}</span>.{" "}
              <Link href={link({ under: null })} className="font-semibold underline underline-offset-2">Show the whole election</Link>
            </p>
          )}

          <div className="mt-5">
            <PrepareList
              /* A different page of rows is a different piece of work. */
              key={list.rows.map((unit) => unit.unit_id).join(",")}
              election={id}
              units={list.rows.filter((unit) => unit.sheet_url).map((unit) => unit.unit_id)}
              waiting={
                list.rows.filter(
                  (unit) => unit.sheet_url && (!unit.picture_status || (inecReader() && !unit.read_status))
                ).length
              }
            />
            {list.rows.length === 0 ? (
              <Empty>
                {counts.all
                  ? "No polling unit matches that."
                  : "Nothing has been gathered for this election yet. Keep this page open and the units will appear as they are read."}
              </Empty>
            ) : (
              <Table head={["Polling unit", "Sheet", "Photographed or received", "Figures", ""]}>
                {list.rows.map((unit) => (
                  <UnitRow key={unit.unit_id} election={id} unit={unit} />
                ))}
              </Table>
            )}
          </div>

          {pages > 1 && (
            <div className="mt-5 flex items-center justify-between border-t border-dash-line pt-4 text-[0.8125rem] text-dash-muted">
              <span>Page {formatNumber(page)} of {formatNumber(pages)}</span>
              <span className="flex gap-2">
                {page > 1 && <Button href={link({ page: page - 1 })} variant="dashOutline" size="sm">Earlier</Button>}
                {page < pages && <Button href={link({ page: page + 1 })} variant="dashOutline" size="sm">Later</Button>}
              </span>
            </div>
          )}
        </Card>
      </div>
    </DashLayout>
  );
}

/** A stored moment, as the same moment on a Lagos clock. */
function lagosTime(at) {
  const moment = at instanceof Date ? at.getTime() : Date.parse(at);
  return Number.isNaN(moment) ? null : new Date(moment + 3600000).toISOString().slice(0, 19).replace("T", " ");
}

function UnitRow({ election, unit }) {
  const votes = Object.entries(unit.party_votes ?? {}).sort((a, b) => b[1] - a[1]);
  const oddPlace = unit.place_ok === false;
  const oddDay = Number.isInteger(unit.days_from_poll) && (unit.days_from_poll < 0 || unit.days_from_poll > 1);

  return (
    <tr>
      <Cell strong>
        <Link href={`/admin/irev/${election}/${unit.unit_id}`} className="underline underline-offset-2 hover:text-red-600">
          {unit.pu_code}
        </Link>
        <span className="block font-normal text-dash-ink">{unit.unit_name}</span>
        <span className="block text-[0.75rem] font-normal text-dash-muted">
          {[unit.ward_name, unit.lga_name].filter(Boolean).join(" · ")}
        </span>
      </Cell>
      <Cell>
        {unit.sheet_url ? <Badge tone="good">Up</Badge> : unit.no_voters ? <Badge>No voters here</Badge> : <Badge tone="alert">None published</Badge>}
        {unit.uploaded_at && (
          <span className={`mt-1 block text-[0.75rem] ${unit.days_after >= vault.LATE_DAYS ? "font-bold text-red-700" : "text-dash-muted"}`}>
            went up {words(lagosTime(unit.uploaded_at))}
            {unit.days_after >= vault.LATE_DAYS ? ` · ${formatNumber(unit.days_after)} days after the poll` : ""}
          </span>
        )}
        {unit.earlier_sheets > 0 && (
          <span className="mt-1 block text-[0.75rem] text-dash-muted">replaced {formatNumber(unit.earlier_sheets)}×</span>
        )}
      </Cell>
      <Cell muted={!unit.taken_at}>
        {unit.taken_at ? (
          <>
            {words(unit.taken_at)}
            <span className={`block text-[0.75rem] ${oddPlace ? "font-bold text-red-700" : "text-dash-muted"}`}>
              {[unit.taken_lga, unit.taken_state].filter(Boolean).join(", ") || (unit.latitude == null ? "place not recorded" : "")}
              {unit.device_model ? ` · ${unit.device_model}` : ""}
            </span>
            {oddDay && (
              <span className="block text-[0.75rem] font-bold text-red-700">
                {unit.days_from_poll < 0 ? `${Math.abs(unit.days_from_poll)} day(s) before the poll` : `${unit.days_from_poll} days after the poll`}
              </span>
            )}
          </>
        ) : unit.stored_at ? (
          <>
            <span className="text-dash-ink">{words(lagosTime(unit.stored_at))}</span>
            <span className="block text-[0.75rem]">when INEC received it; the file gives no camera time</span>
          </>
        ) : unit.picture_status === "examined" ? (
          "the file does not say"
        ) : unit.picture_status === "gone" ? (
          "no longer on INEC's storage"
        ) : unit.picture_status === "failed" ? (
          "could not be fetched; will be tried again"
        ) : unit.sheet_url ? (
          "being examined…"
        ) : (
          "—"
        )}
      </Cell>
      <Cell muted={unit.read_status !== "read"}>
        {unit.read_status === "read" ? (
          <>
            {votes.slice(0, 3).map(([party, value]) => `${party} ${formatNumber(value)}`).join(" · ")}
            <span className={`block text-[0.75rem] ${unit.balanced && unit.code_matches !== false ? "text-dash-muted" : "font-bold text-flag-700"}`}>
              {unit.code_matches === false
                ? "the code on the paper is another unit's"
                : unit.balanced
                  ? `adds up · ${formatNumber(unit.accredited)} accredited`
                  : "does not add up"}
            </span>
          </>
        ) : unit.read_status === "gone" ? (
          "sheet no longer on INEC's storage"
        ) : unit.read_status ? (
          "could not be read"
        ) : unit.sheet_url ? (
          inecReader() ? "being read…" : "not read yet"
        ) : (
          "—"
        )}
      </Cell>
      <Cell>
        <Link href={`/admin/irev/${election}/${unit.unit_id}`} className="font-semibold underline underline-offset-2">
          Open
        </Link>
      </Cell>
    </tr>
  );
}
