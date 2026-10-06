import Link from "next/link";
import { CalendarClock, Landmark, ListFilter, ScanLine } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge, Empty } from "@/components/dash/DashCard";
import { Cell, Counts, Since, Table } from "@/components/dash/SystemBits";
import Button from "@/components/ui/Button";
import { requireCapability } from "@/lib/guard";
import { bank } from "@/lib/irev/bank";
import { TYPE_WORDS, chosen, typeCode } from "@/lib/irev/shape";
import * as vault from "@/lib/irev/vault";
import { inecReader } from "@/lib/irev/reader";
import { formatNumber } from "@/lib/utils";

import Runner from "./Runner";
import {
  followYear,
  gatherElection,
  readElection,
  refreshList,
  unfollowYear,
  watchElection,
} from "./actions";

export const metadata = { title: "INEC results (IReV)", robots: { index: false } };
export const dynamic = "force-dynamic";
/* A turn of the gatherer reads the portal for some seconds and may read a
   round of sheets after it. The actions on this page inherit this ceiling. */
export const maxDuration = 60;

const TYPE_NAMES = {
  PRES: "Presidential",
  GOV: "Governorship",
  SEN: "Senate",
  REPS: "House of Representatives",
  ASSEMBLY: "State Assembly",
  CHAIRMAN: "Chairmanship",
  COUNCILLOR: "Councillor",
};

const FIELD =
  "mt-1.5 h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none";
const LABEL = "block text-[0.75rem] font-medium text-dash-muted";

/**
 * INEC's Result Viewing Portal, gathered into Data Bank from here.
 *
 * ── THE PERSON AT THIS SCREEN STARTS EVERYTHING ────────────────────────────
 * Nothing is gathered until somebody picks an election and says so. The
 * portal holds over a thousand elections and most of a million sheets;
 * which of them matter is a decision, and reading sheets into figures costs
 * money for every sheet. So the screen lists, the person chooses, and only
 * then does anything move.
 *
 * The one standing instruction is "follow a year". An election that does not
 * exist yet cannot be picked from a list, and 2027's will appear on the
 * portal one at a time in the days before each poll. Following the year means
 * each is watched from the turn it is first listed.
 */
export default async function IrevPage({ searchParams }) {
  const admin = await requireCapability("system:read", "/admin/irev");
  const picked = await searchParams;

  const db = bank();
  const open = db ? await vault.ready(db).catch(() => false) : false;

  const shell = (children) => (
    <DashLayout
      user={admin}
      screen="admin"
      title="INEC results (IReV)"
      lead="Choose an election on INEC's result portal and gather it into Data Bank: which sheet is up for every polling unit, and the figures read off it."
    >
      {children}
    </DashLayout>
  );

  if (!db) {
    return shell(
      <Card title="Data Bank is not connected">
        <Empty>
          This deployment has no address for Data Bank&rsquo;s database, so there is nowhere to save what is
          gathered. Whoever looks after the hosting needs to set it.
        </Empty>
      </Card>
    );
  }

  if (!open) {
    return shell(
      <Card title="Start here" action={<Landmark size={16} className="text-dash-muted" />}>
        <p className="max-w-prose text-[0.875rem] text-dash-ink">
          This opens an account in Data Bank called <strong>INEC Result Datas</strong> and fetches the list of every
          election INEC has published on its result portal. Nothing else is gathered until you choose an election.
        </p>
        <form action={refreshList} className="mt-4">
          <Button type="submit" variant="dash" size="sm">
            Open the account and fetch the list
          </Button>
        </form>
      </Card>
    );
  }

  const [all, followed, listed, bytes] = await Promise.all([
    vault.elections(db),
    vault.follows(db),
    vault.since(db, "listed"),
    vault.weight(db),
  ]);

  const sheetReader = inecReader();
  const canRead = sheetReader !== null;
  const years = [...new Set(all.map((election) => election.year).filter(Boolean))].sort((a, b) => b - a);
  const states = [...new Set(all.map((election) => election.state_name).filter(Boolean))].sort();

  const want = {
    type: typeCode(picked?.type),
    year: picked?.year ? Number(picked.year) : null,
    state: picked?.state ? String(picked.state) : null,
  };
  const filtered = Boolean(want.type || want.year || want.state);

  const kept = all.filter((election) => election.units_held > 0 || election.watching || election.pass_started_at);
  const found = filtered ? chosen(all, want) : [];

  const working = all.filter(
    (election) =>
      election.pass_started_at ||
      election.sheets_held > election.pictures_examined ||
      (canRead && election.reading && election.sheets_held > election.figures_read)
  ).length;
  const watching = all.filter((election) => election.watching).length;

  const rows = (elections) =>
    elections.map((election) => (
      <ElectionRow key={election.election_id} election={election} canRead={canRead} />
    ));

  const head = [
    "Election",
    { label: "Sheets on IReV", numeric: true },
    { label: "In Data Bank", numeric: true },
    { label: "Read into figures", numeric: true },
    "",
  ];

  return shell(
    <>
      <Runner working={working} watching={watching} />

      <Counts
        items={[
          {
            label: "Elections on IReV",
            value: formatNumber(all.length),
            context: listed ? `list fetched ${ago(listed.seconds)}` : "list not fetched yet",
          },
          { label: "Gathered here", value: formatNumber(kept.filter((election) => election.units_held > 0).length) },
          {
            label: "Sheets held",
            value: formatNumber(kept.reduce((sum, election) => sum + election.sheets_held, 0)),
            context: `${(bytes / 1048576).toFixed(1)} MB in Data Bank`,
          },
          {
            label: "Read into figures",
            value: formatNumber(kept.reduce((sum, election) => sum + election.figures_read, 0)),
            tone: "good",
          },
        ]}
      />

      <div className="grid gap-6">
        <Card
          title="Follow a year"
          subtitle="For elections that are still to come. Every election INEC lists for the year is watched live from the moment it appears, and gathered as its sheets go up."
          action={<CalendarClock size={16} className="text-dash-muted" />}
        >
          <form action={followYear} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="follow-year" className={LABEL}>Year</label>
              <input id="follow-year" name="year" type="number" min="2015" max="2100" defaultValue="2027" required className={FIELD} />
            </div>
            <div>
              <label htmlFor="follow-type" className={LABEL}>Election type</label>
              <select id="follow-type" name="type" defaultValue="" className={FIELD}>
                <option value="">Every type</option>
                {Object.keys(TYPE_WORDS).map((code) => (
                  <option key={code} value={code}>{TYPE_NAMES[code]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="follow-state" className={LABEL}>State</label>
              <select id="follow-state" name="state" defaultValue="" className={FIELD}>
                <option value="">Every state</option>
                {states.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
            <p className="text-[0.75rem] leading-snug text-dash-muted">
              Sheets are examined, read into figures and compared with our returns as they arrive.
            </p>
            <Button type="submit" variant="dash" size="sm">Follow</Button>
          </form>

          {followed.length > 0 && (
            <ul className="mt-5 divide-y divide-dash-line border-t border-dash-line text-[0.8125rem]">
              {followed.map((row) => (
                <li key={row._row} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-dash-ink">
                    <strong>{row.year}</strong> · {row.type_code ? TYPE_NAMES[row.type_code] : "every type"} ·{" "}
                    {row.state_name ?? "every state"}
                    {row.read_sheets && <span className="text-dash-muted"> · sheets read into figures</span>}
                  </span>
                  <form action={unfollowYear}>
                    <input type="hidden" name="row" value={row._row} />
                    <Button type="submit" variant="dashOutline" size="sm">Stop following</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="In Data Bank"
          subtitle="Elections you have gathered or are watching. Open one to see every polling unit, its sheet and its figures."
          action={<Landmark size={16} className="text-dash-muted" />}
        >
          {kept.length === 0 ? (
            <Empty>Nothing gathered yet. Choose an election below and press Gather.</Empty>
          ) : (
            <Table head={head}>{rows(kept)}</Table>
          )}
        </Card>

        <Card
          title="Choose an election"
          subtitle="Pick a type, a year, a state, or any mix of them. Pressing Gather does the rest: every sheet is examined, read into figures and compared with our own returns."
          action={<ListFilter size={16} className="text-dash-muted" />}
        >
          <form method="get" className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="pick-type" className={LABEL}>Election type</label>
              <select id="pick-type" name="type" defaultValue={want.type ?? ""} className={FIELD}>
                <option value="">Every type</option>
                {Object.keys(TYPE_WORDS).map((code) => (
                  <option key={code} value={code}>{TYPE_NAMES[code]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pick-year" className={LABEL}>Year</label>
              <select id="pick-year" name="year" defaultValue={want.year ?? ""} className={FIELD}>
                <option value="">Every year</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pick-state" className={LABEL}>State</label>
              <select id="pick-state" name="state" defaultValue={want.state ?? ""} className={FIELD}>
                <option value="">Every state</option>
                {states.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="dash" size="sm">Show elections</Button>
          </form>

          <div className="mt-5">
            {!filtered ? (
              <Empty icon={ListFilter}>Pick a type, year or state to see what INEC has published.</Empty>
            ) : found.length === 0 ? (
              <Empty>INEC has published nothing that matches. If it is still to come, follow the year above.</Empty>
            ) : (
              <Table head={head}>{rows(found)}</Table>
            )}
          </div>

          <form action={refreshList} className="mt-5 flex flex-wrap items-center gap-3 border-t border-dash-line pt-4">
            <Button type="submit" variant="dashOutline" size="sm">Fetch the list again</Button>
            <p className="text-[0.75rem] text-dash-muted">
              Asks INEC&rsquo;s portal for every election it has published, in case a new one has been added.
            </p>
          </form>
        </Card>

        {canRead && !sheetReader.strong && (
          <Card title="Sheets are being read by the basic reader" action={<ScanLine size={16} className="text-dash-muted" />}>
            <p className="max-w-prose text-[0.8125rem] text-dash-ink">
              It reads clear sheets with a handful of parties well and struggles with crowded or faint ones. A reading
              is only marked as adding up when the party figures it found sum to the total valid votes the presiding
              officer wrote on the same sheet; every other reading is kept but marked as in doubt, and is never held
              against our own returns. Setting the handwriting reader&rsquo;s key (ANTHROPIC_API_KEY) on this
              deployment replaces it with the stronger reader, which also sees signatures and stamps.
            </p>
          </Card>
        )}

        {!canRead && (
          <Card title="Reading sheets into figures is switched off" action={<ScanLine size={16} className="text-dash-muted" />}>
            <p className="max-w-prose text-[0.8125rem] text-dash-ink">
              INEC publishes a photograph of each result sheet and no numbers. Turning those photographs into
              figures needs the handwriting reader, which is not set up on this deployment yet. Gathering and live
              watching work without it, and so does the picture check on every sheet (when, where and with what it
              was photographed). To switch reading on, whoever looks after the hosting adds the reader&rsquo;s key
              (ANTHROPIC_API_KEY) to this deployment&rsquo;s settings; the buttons appear as soon as it is there.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

function ago(seconds) {
  if (seconds < 90) return "just now";
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 129600) return `${Math.round(seconds / 3600)} hours ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

function Toggle({ action, election, on, start, stop }) {
  return (
    <form action={action}>
      <input type="hidden" name="election" value={election.election_id} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <Button type="submit" variant={on ? "dash" : "dashOutline"} size="sm">
        {on ? stop : start}
      </Button>
    </form>
  );
}

function ElectionRow({ election, canRead }) {
  const gathering = Boolean(election.pass_started_at);
  const done = election.wards - election.wards_left;

  return (
    <tr>
      <Cell strong>
        {election.units_held > 0 ? (
          <Link href={`/admin/irev/${election.election_id}`} className="underline underline-offset-2 hover:text-red-600">
            {election.name}
          </Link>
        ) : (
          election.name
        )}
        <span className="mt-1 flex flex-wrap items-center gap-1.5 font-normal">
          {gathering && (
            <Badge tone="warn">
              {election.wards ? `Gathering · ${formatNumber(done)} of ${formatNumber(election.wards)} wards` : "Gathering"}
            </Badge>
          )}
          {election.watching && <Badge tone="good">Watching live</Badge>}
          {election.reading && <Badge tone="good">Reading sheets</Badge>}
          {!gathering && election.gathered_at && (
            <span className="text-[0.75rem] text-dash-muted">
              gathered <Since at={election.gathered_at} />
            </span>
          )}
        </span>
      </Cell>
      <Cell numeric muted={election.expected_units == null}>
        {election.expected_units == null
          ? "not checked"
          : `${formatNumber(election.sheets_up)} of ${formatNumber(election.expected_units)}`}
      </Cell>
      <Cell numeric>{formatNumber(election.sheets_held)}</Cell>
      <Cell numeric>
        {formatNumber(election.figures_read)}
        {election.figures_read > 0 && (
          <span className="block text-[0.75rem] text-dash-muted">{formatNumber(election.figures_balanced)} add up</span>
        )}
      </Cell>
      <Cell>
        <div className="flex flex-wrap justify-end gap-2">
          {election.units_held > 0 && (
            <Button href={`/admin/irev/${election.election_id}`} variant="dash" size="sm">
              Open results
            </Button>
          )}
          {!gathering && (
            <form action={gatherElection}>
              <input type="hidden" name="election" value={election.election_id} />
              <Button type="submit" variant="dashOutline" size="sm">
                {election.gathered_at ? "Gather again" : "Gather"}
              </Button>
            </form>
          )}
          <Toggle action={watchElection} election={election} on={election.watching} start="Watch live" stop="Stop watching" />
          {canRead && election.sheets_held > 0 && (
            <Toggle action={readElection} election={election} on={election.reading} start="Read sheets" stop="Stop reading" />
          )}
        </div>
      </Cell>
    </tr>
  );
}
