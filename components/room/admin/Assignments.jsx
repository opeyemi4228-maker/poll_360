import Link from "next/link";

import { Badge, Card, Empty } from "@/components/dash/DashCard";
import ActionForm, { Area, Choice, Field, Submit } from "../ActionForm";
import PersonPicker from "../PersonPicker";
import Tabs from "../Tabs";
import { Crumbs, age, clock, hrefWith } from "../Panels";
import { REASONS } from "@/lib/assignments";
import { assignments, listed, readPreview } from "@/lib/room/assign";
import { place, pathName } from "@/lib/room/places";
import { settings } from "@/lib/room/store";
import { levelOf } from "@/lib/ground";
import { toCsv } from "@/lib/csv";
import { asWords, formatNumber } from "@/lib/utils";

/**
 * Assignments: who files for which polling unit, and who holds which ward.
 *
 * Four ways in, as the Super Admin thinks of the job: bring in the party's
 * list, work a place, work a person, or look for the gaps. Every change asks
 * for a reason and says what it will do before it does it.
 */
const BASE = "/room/admin";

function Why() {
  return (
    <>
      <Choice label="Reason" name="reason" options={Object.entries(REASONS)} />
      <Area label="Note (required for Other)" name="note" rows={1} />
    </>
  );
}

const ROLE = { PRIMARY: "Primary agent", BACKUP: "Backup agent", COORDINATOR: "Ward coordinator" };

function Held({ row, now, promote = false }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-[0.8125rem]">
      <Badge tone={row.role === "PRIMARY" ? "ink" : "neutral"}>{ROLE[row.role]}</Badge>
      <span className="min-w-0 flex-1">
        <Link href={hrefWith(BASE, { section: "assignments", tab: "person" }, { person: row.personId })} className="font-semibold text-dash-ink hover:underline">{row.shown ?? row.name}</Link>
        <span className="text-dash-muted"> · +{row.phone} · {asWords(row.status ?? "")} · {row.lastSeen ? `signed in ${age(row.lastSeen, now)} ago` : "not signed in yet"} · from {row.source === "MANUAL" ? "a manual change" : "the party list"}</span>
      </span>
      <details className="w-full sm:w-auto">
        <summary className="cursor-pointer font-semibold text-blue-700">Change</summary>
        <div className="mt-2 grid gap-3 rounded-dash-sm bg-dash-bg p-3 sm:w-[28rem]">
          {promote && row.role === "BACKUP" && (
            <ActionForm what="assign" hidden={{ op: "promote", id: row.id }} className="space-y-2" confirm={`Make ${row.name} the primary agent here? The current primary loses this polling unit immediately.`}>
              <Why />
              <Submit variant="dashOutline">Promote to primary</Submit>
            </ActionForm>
          )}
          <ActionForm what="assign" hidden={{ op: "move", id: row.id }} className="space-y-2" confirm={`Moving ${row.name} removes their access to ${pathName(row.targetCode)} immediately.`}>
            <Field label="Move to this INEC code" name="code" placeholder={row.targetCode} required />
            <Why />
            <Submit variant="dashOutline">Move</Submit>
          </ActionForm>
          <ActionForm what="assign" hidden={{ op: "end", id: row.id }} className="space-y-2" confirm={`Removing ${row.name} from ${pathName(row.targetCode)} takes away their access immediately.`}>
            <Why />
            <Submit variant="dashOutline">Remove</Submit>
          </ActionForm>
        </div>
      </details>
    </li>
  );
}

function History({ rows }) {
  if (!rows.length) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.8125rem] font-semibold text-dash-ink">History ({rows.length})</summary>
      <ul className="mt-2 space-y-1 text-[0.8125rem] text-dash-muted">
        {rows.map((row) => (
          <li key={row.id}>
            {row.name} · {ROLE[row.role]} at {row.targetCode} · {clock(row.startedAt)} by {row.changedName ?? "the party list"}{row.reason ? ` (${REASONS[row.reason] ?? row.reason})` : ""}
            {row.endedAt ? ` · ended ${clock(row.endedAt)} by ${row.endedName ?? "Poll360"}${row.endReason ? ` (${REASONS[row.endReason] ?? row.endReason}${row.endNote ? `: ${row.endNote}` : ""})` : ""}` : " · current"}
          </li>
        ))}
      </ul>
    </details>
  );
}

async function ImportTab({ query }) {
  const preview = query.preview ? await readPreview(query.preview) : null;
  if (!preview) {
    return (
      <div className="space-y-4">
        <ActionForm what="importPreview" className="space-y-3" goto={`${BASE}?section=assignments&tab=import&preview={id}`}>
          <label className="block text-[0.875rem] font-semibold text-dash-ink">
            The party&apos;s list (.csv or .xlsx)
            <input type="file" name="file" accept=".csv,.xlsx" required className="mt-1 block w-full text-[0.875rem] font-normal" />
          </label>
          <Submit>Read the file</Submit>
        </ActionForm>
        <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
          Nothing is saved by reading it. You are shown what it would change first. The columns are <code>role</code>, <code>full_name</code>, <code>phone</code>, <code>state_code</code>, <code>lga_code</code>, <code>ward_code</code>, then <code>pu_code</code> for agents (several separated by a semicolon), and optionally <code>assignment_type</code> (PRIMARY or BACKUP) and <code>party_ref</code>.
        </p>
      </div>
    );
  }
  const errorsCsv = toCsv(preview.errors.slice(0, 5000), ["line", "role", "full_name", "phone", "state_code", "lga_code", "ward_code", "pu_code", "error"].map((key) => [key, (row) => row[key]]));
  const groups = [
    ["New people", preview.newPeople, (row) => `${row.fullName} · +${row.phone} · ${asWords(row.role)}`],
    ["New assignments", preview.newAssignments, (row) => `${row.fullName} → ${row.place} (${ROLE[row.role]})`],
    ["Changed assignments", preview.changed, (row) => `${row.fullName} → ${row.place} (${ROLE[row.role]}) · now: ${row.was}`],
  ];
  return (
    <div className="space-y-5">
      <p className="text-[0.875rem] text-dash-ink">
        <b>{preview.fileName}</b>: {formatNumber(preview.rows)} rows, {formatNumber(preview.usable)} usable, {formatNumber(preview.errors.length)} with errors.
        {preview.committedAt && <b className="text-light-green"> Committed at {clock(preview.committedAt)}.</b>}
      </p>

      {preview.conflicts.length > 0 && (
        <section className="rounded-dash-sm border border-light-red bg-light-red-soft p-3">
          <h3 className="text-[0.875rem] font-bold text-light-red">Conflicts in the file ({preview.conflicts.length})</h3>
          <ul className="mt-1 max-h-48 overflow-auto text-[0.8125rem] text-dash-ink">
            {preview.conflicts.map((row, index) => <li key={index}>Line {row.line}: {row.says}{row.code ? ` at ${pathName(row.code)}` : ""}</li>)}
          </ul>
          <p className="mt-1 text-[0.75rem] text-dash-muted">A second primary for the same polling unit is left out. Fix the file and read it again to bring them in.</p>
        </section>
      )}

      {preview.errors.length > 0 && (
        <section>
          <h3 className="text-[0.875rem] font-bold text-dash-ink">Rows with errors ({formatNumber(preview.errors.length)})</h3>
          <ul className="mt-1 max-h-40 overflow-auto text-[0.8125rem] text-dash-muted">
            {preview.errors.slice(0, 50).map((row) => <li key={row.line}>Line {row.line} · {row.full_name || "no name"} · {row.error}</li>)}
          </ul>
          <a download="rows-with-errors.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(errorsCsv)}`} className="mt-1 inline-block text-[0.8125rem] font-semibold text-blue-700 underline">Download them all, with the reason beside each</a>
        </section>
      )}

      {groups.map(([title, rows, say]) => (
        <section key={title}>
          <h3 className="text-[0.875rem] font-bold text-dash-ink">{title} ({formatNumber(rows.length)})</h3>
          {rows.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-auto text-[0.8125rem] text-dash-muted">
              {rows.slice(0, 100).map((row, index) => <li key={index}>{say(row)}</li>)}
              {rows.length > 100 && <li>and {formatNumber(rows.length - 100)} more</li>}
            </ul>
          )}
        </section>
      ))}

      {!preview.committedAt && (
        <ActionForm what="importCommit" hidden={{ id: preview.id }} className="space-y-5" confirm="Commit this list? New people and assignments are created now." done="Committed: {people} new people, {started} assignments started, {ended} ended." reset={false}>
          {preview.manualDiffer.length > 0 && (
            <section>
              <h3 className="text-[0.875rem] font-bold text-dash-ink">Manual overrides that differ from the party list ({preview.manualDiffer.length})</h3>
              <ul className="mt-1 divide-y divide-dash-line text-[0.8125rem]">
                {preview.manualDiffer.map((row) => (
                  <li key={`${row.endId}-${row.code}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="min-w-0 flex-1 text-dash-ink">{row.place}: the list says <b>{row.fullName}</b> ({ROLE[row.role]}). Now: {row.was}.</span>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`manual_${row.endId}`} value="keep" defaultChecked /> Keep the manual assignment</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`manual_${row.endId}`} value="list" /> Accept the list</label>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.missing.length > 0 && (
            <section>
              <h3 className="text-[0.875rem] font-bold text-dash-ink">On the last list, missing from this one ({preview.missing.length})</h3>
              <p className="text-[0.75rem] text-dash-muted">None of these is ended unless you tick it.</p>
              <ul className="mt-1 max-h-48 overflow-auto text-[0.8125rem]">
                {preview.missing.map((row) => (
                  <li key={row.endId}><label className="inline-flex items-center gap-2 py-0.5"><input type="checkbox" name="end" value={row.endId} /> End {row.fullName} at {row.place} ({ROLE[row.role]})</label></li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Submit>Commit this list</Submit>
            <Link href={hrefWith(BASE, { section: "assignments", tab: "import" })} className="text-[0.8125rem] font-semibold text-blue-700 underline">Discard and read another file</Link>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

async function PlaceTab({ query, at, unit, trail, now }) {
  const q = { ...query, section: "assignments", tab: "place" };
  const here = place(unit ?? at);
  if (!here) return <Empty>INEC lists no place with that code.</Empty>;
  const level = levelOf(unit ?? at);

  if (level === "pu") {
    const [held, history] = await Promise.all([assignments.forUnit(unit), assignments.list({ puCode: unit, active: false, take: 60 })]);
    return (
      <div className="space-y-4">
        <Crumbs trail={trail} base={BASE} query={{ ...q, unit: null }} />
        <h3 className="font-display text-[1.125rem] font-bold text-dash-ink">{here.name} <span className="font-mono text-[0.8125rem] font-normal text-dash-muted">{unit}</span></h3>
        {held.primary || held.backups.length ? (
          <ul className="divide-y divide-dash-line">{[held.primary, ...held.backups].filter(Boolean).map((row) => <Held key={row.id} row={row} now={now} promote />)}</ul>
        ) : (
          <p className="text-[0.875rem] font-semibold text-light-yellow-ink">▲ No agent is assigned to this polling unit.</p>
        )}
        {held.coordinators.length > 0 && <p className="text-[0.8125rem] text-dash-muted">Ward coordinator: {held.coordinators.map((row) => row.name).join(", ")}</p>}
        <ActionForm what="assign" hidden={{ code: unit }} className="grid gap-3 rounded-dash-sm bg-dash-bg p-3 sm:grid-cols-2">
          <PersonPicker label="Assign this person" />
          <Choice label="As" name="op" options={[["assign", held.primary ? "A backup (keep the primary)" : "The primary agent"], ...(held.primary ? [["replace", "The primary, replacing the current one"]] : [])]} />
          <input type="hidden" name="role" value={held.primary ? "BACKUP" : "PRIMARY"} />
          <Why />
          <Submit>Assign</Submit>
        </ActionForm>
        <History rows={history} />
      </div>
    );
  }

  const coordinators = level === "ward" ? (await assignments.list({ wardCode: at, active: true, take: 400 })) : [];
  const byUnit = new Map();
  for (const row of coordinators) if (row.targetType === "PU") (byUnit.get(row.targetCode) ?? byUnit.set(row.targetCode, []).get(row.targetCode)).push(row);
  const wardHeld = coordinators.filter((row) => row.role === "COORDINATOR");

  return (
    <div className="space-y-4">
      <Crumbs trail={trail} base={BASE} query={q} />
      {level === "ward" && (
        <section className="rounded-dash-sm bg-dash-bg p-3">
          <h3 className="text-[0.875rem] font-bold text-dash-ink">Ward coordinators</h3>
          {wardHeld.length ? <ul className="divide-y divide-dash-line">{wardHeld.map((row) => <Held key={row.id} row={row} now={now} />)}</ul> : <p className="text-[0.8125rem] font-semibold text-light-yellow-ink">▲ This ward has no coordinator.</p>}
          <ActionForm what="assign" hidden={{ code: at, role: "COORDINATOR", op: "assign" }} className="mt-2 grid gap-3 sm:grid-cols-2">
            <PersonPicker label="Assign a coordinator" />
            <span />
            <Why />
            <Submit variant="dashOutline">Assign coordinator</Submit>
          </ActionForm>
        </section>
      )}

      {level === "ward" ? (
        <ActionForm what="assign" className="space-y-3" reset={false}>
          <ul className="divide-y divide-dash-line">
            {here.children.map((child) => {
              const held = byUnit.get(child.code) ?? [];
              const primary = held.find((row) => row.role === "PRIMARY");
              return (
                <li key={child.code} className="flex flex-wrap items-center gap-x-3 py-2 text-[0.8125rem]">
                  <input type="checkbox" name="codes" value={child.code} aria-label={`Select ${child.name}`} />
                  <Link href={hrefWith(BASE, q, { unit: child.code })} className="min-w-0 flex-1 font-semibold text-dash-ink hover:underline">{child.name} <span className="font-mono font-normal text-dash-muted">{child.code}</span></Link>
                  <span className={primary ? "text-dash-muted" : "font-semibold text-light-yellow-ink"}>{primary ? `${primary.name}${held.length > 1 ? ` + ${held.length - 1} backup` : ""}` : "▲ no primary"}</span>
                </li>
              );
            })}
          </ul>
          <div className="grid gap-3 rounded-dash-sm bg-dash-bg p-3 sm:grid-cols-2">
            <Choice label="With the ticked polling units" name="op" options={[["assignMany", "Assign one agent to all of them"], ["clearPrimary", "Clear the primary agent on all of them"]]} />
            <PersonPicker label="The agent (for assigning)" />
            <Choice label="As" name="role" options={[["PRIMARY", "Primary"], ["BACKUP", "Backup"]]} />
            <span />
            <Why />
            <Submit>Apply to ticked</Submit>
          </div>
        </ActionForm>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {here.children.map((child) => (
            <li key={child.code}>
              <Link href={hrefWith(BASE, q, { at: child.code, unit: null })} className="flex justify-between rounded-dash-sm px-3 py-2 text-[0.8125rem] hover:bg-dash-bg">
                <span className="font-semibold text-dash-ink">{child.name}</span>
                <span className="tabular-nums text-dash-muted">{formatNumber(child.units)} units</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {level === "ward" && (
        <ActionForm what="assign" hidden={{ op: "swap" }} className="grid gap-3 rounded-dash-sm bg-dash-bg p-3 sm:grid-cols-2">
          <Field label="Swap the primary agents of this unit" name="a" placeholder={`${at}/001`} required />
          <Field label="and this one" name="b" placeholder={`${at}/002`} required />
          <Why />
          <Submit variant="dashOutline">Swap</Submit>
        </ActionForm>
      )}
    </div>
  );
}

async function PersonTab({ query, now }) {
  const [found, person] = await Promise.all([
    query.q ? assignments.search(query.q, 30) : [],
    query.person ? assignments.person(query.person) : null,
  ]);
  const all = person ? await assignments.list({ personId: person.id, active: false, take: 100 }) : [];
  const current = all.filter((row) => !row.endedAt);
  return (
    <div className="space-y-4">
      <form action={BASE} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="section" value="assignments" />
        <input type="hidden" name="tab" value="person" />
        <label className="min-w-0 flex-1 text-[0.8125rem] font-semibold text-dash-ink">
          Find a person
          <input name="q" defaultValue={query.q ?? ""} placeholder="Name, phone, or party reference" className="mt-1 h-10 w-full rounded-dash-sm border border-dash-line px-3 text-[0.875rem] font-normal" />
        </label>
        <button type="submit" className="h-10 rounded-dash-sm bg-dash-ink px-4 text-[0.8125rem] font-semibold text-white">Search</button>
      </form>

      {query.q && !person && (
        found.length ? (
          <ul className="divide-y divide-dash-line">
            {found.map((row) => (
              <li key={row.id} className="py-2 text-[0.8125rem]">
                <Link href={hrefWith(BASE, { section: "assignments", tab: "person" }, { person: row.id })} className="font-semibold text-dash-ink hover:underline">{row.shown ?? row.name}</Link>
                <span className="text-dash-muted"> · +{row.phone} · {row.kind === "WARD_COORDINATOR" ? "ward coordinator" : "agent"} · {row.unitCode ?? "no unit in hand"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nobody on the roster matches that.</Empty>
        )
      )}

      {person && (
        <section className="space-y-3">
          <h3 className="font-display text-[1.125rem] font-bold text-dash-ink">{person.name}</h3>
          <p className="text-[0.8125rem] text-dash-muted">
            +{person.phone} · {person.kind === "WARD_COORDINATOR" ? "Ward coordinator" : "Agent"} · {asWords(person.status)} · {person.partyRef ? `party reference ${person.partyRef}` : "no party reference"} · {person.lastSeen ? `signed in ${age(person.lastSeen, now)} ago` : "not signed in yet"}
          </p>
          {current.length ? <ul className="divide-y divide-dash-line">{current.map((row) => <Held key={row.id} row={{ ...row, shown: pathName(row.targetCode) }} now={now} />)}</ul> : <p className="text-[0.875rem] font-semibold text-light-yellow-ink">▲ Holds no polling unit and no ward.</p>}
          <ActionForm what="assign" hidden={{ op: "assignMany", person: person.id }} className="grid gap-3 rounded-dash-sm bg-dash-bg p-3 sm:grid-cols-2">
            <Area label="Add these INEC codes (polling units, or wards for a coordinator)" name="code" rows={2} placeholder="19/04/11/003, 19/04/11/004" required />
            <Choice label="As" name="role" options={[["PRIMARY", "Primary agent"], ["BACKUP", "Backup agent"], ["COORDINATOR", "Ward coordinator"]]} />
            <Why />
            <Submit>Add</Submit>
          </ActionForm>
          <History rows={all.filter((row) => row.endedAt)} />
        </section>
      )}
    </div>
  );
}

async function GapsTab({ query, at, trail, electionId, now }) {
  const q = { ...query, section: "assignments", tab: "gaps" };
  if (!at) {
    return (
      <div className="space-y-3">
        <p className="text-[0.875rem] text-dash-muted">Choose a state to see where cover is missing in it.</p>
        <ul className="grid gap-1 sm:grid-cols-3 xl:grid-cols-4">
          {place("").children.map((state) => <li key={state.code}><Link href={hrefWith(BASE, q, { at: state.code })} className="block rounded-dash-sm px-3 py-2 text-[0.8125rem] font-semibold text-dash-ink hover:bg-dash-bg">{state.name}</Link></li>)}
        </ul>
      </div>
    );
  }
  const rules = await settings.get(electionId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
  const cutoff = new Date(`${today}T${/^\d\d:\d\d$/.test(rules.checkInBy) ? rules.checkInBy : "09:00"}:00+01:00`);
  const gaps = await assignments.gaps({ ...listed(at), under: at, checkInBy: now > cutoff.getTime() ? new Date(`${today}T00:00:00+01:00`).toISOString() : null });
  const block = (title, rows, say, link) => (
    <section>
      <h3 className="text-[0.875rem] font-bold text-dash-ink">{title} ({formatNumber(rows.length)})</h3>
      {rows.length ? (
        <ul className="mt-1 max-h-56 overflow-auto text-[0.8125rem]">
          {rows.slice(0, 300).map((row, index) => <li key={index} className="py-0.5">{link ? <Link href={link(row)} className="text-dash-ink hover:underline">{say(row)}</Link> : <span className="text-dash-ink">{say(row)}</span>}</li>)}
          {rows.length > 300 && <li className="text-dash-muted">and {formatNumber(rows.length - 300)} more. Open a local government to narrow it.</li>}
        </ul>
      ) : (
        <p className="text-[0.8125rem] text-light-green">✔ None.</p>
      )}
    </section>
  );
  return (
    <div className="space-y-5">
      <Crumbs trail={trail} base={BASE} query={q} />
      <ul className="flex flex-wrap gap-1">
        {(place(at)?.children ?? []).filter((child) => levelOf(child.code) !== "pu").map((child) => <li key={child.code}><Link href={hrefWith(BASE, q, { at: child.code })} className="rounded-full bg-dash-bg px-2.5 py-1 text-[0.75rem] font-semibold text-dash-ink">{child.name}</Link></li>)}
      </ul>
      {block("Polling units with no primary agent", gaps.noPrimary, (code) => pathName(code), (code) => hrefWith(BASE, { section: "assignments", tab: "place" }, { at: code.slice(0, 8), unit: code }))}
      {block("Wards with no coordinator", gaps.noCoordinator, (code) => pathName(code), (code) => hrefWith(BASE, { section: "assignments", tab: "place" }, { at: code }))}
      {block(`Primary agents who have not signed in today (expected by ${rules.checkInBy})`, gaps.notCheckedIn, (row) => `${row.name} · +${row.phone} · ${pathName(row.code)}`)}
      {block("People with no assignment", gaps.unassigned, (row) => `${row.name} · +${row.phone}`, (row) => hrefWith(BASE, { section: "assignments", tab: "person" }, { person: row.id }))}
    </div>
  );
}

export default async function Assignments({ query, at, unit, trail, electionId, now }) {
  const tab = ["import", "place", "person", "gaps"].includes(query.tab) ? query.tab : "place";
  return (
    <Card padded={false}>
      <div className="px-5 pt-4 sm:px-6">
        <Tabs base={BASE} query={{ section: "assignments" }} current={tab} tabs={[["place", "By place"], ["person", "By person"], ["import", "Import the party list"], ["gaps", "Coverage gaps"]]} />
      </div>
      <div className="p-5 sm:p-6">
        {tab === "import" && <ImportTab query={query} />}
        {tab === "place" && <PlaceTab query={query} at={at} unit={unit} trail={trail} now={now} />}
        {tab === "person" && <PersonTab query={query} now={now} />}
        {tab === "gaps" && <GapsTab query={query} at={at} trail={trail} electionId={electionId} now={now} />}
      </div>
    </Card>
  );
}
