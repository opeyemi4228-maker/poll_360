import { notFound } from "next/navigation";
import { ArrowLeft, Camera, GitCompareArrows, ScanLine } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge, Empty } from "@/components/dash/DashCard";
import { Cell, Table } from "@/components/dash/SystemBits";
import PictureReport, { fromRow, words } from "@/components/dash/PictureReport";
import Button from "@/components/ui/Button";
import { results } from "@/lib/db";
import { listElections } from "@/lib/election-scope";
import { requireCapability } from "@/lib/guard";
import { bank } from "@/lib/irev/bank";
import { differences, pictureFlags } from "@/lib/irev/compare";
import { areaMap, spotMap } from "@/lib/place";
import * as vault from "@/lib/irev/vault";
import { defaultRace } from "@/lib/races";
import { inecReader } from "@/lib/irev/reader";
import { formatNumber } from "@/lib/utils";

import { readUnit } from "../../actions";
import Prepare from "./Prepare";

export const metadata = { title: "INEC result sheet", robots: { index: false } };
export const dynamic = "force-dynamic";
/* Reading one sheet on request can take the best part of a minute. */
export const maxDuration = 60;

/**
 * When the sheet went up, in a sentence.
 *
 * From the time in the file's own name where it has one, on a Lagos clock and
 * counted from polling day. The portal's own "updated" time is only used
 * where there is no other: for 2023 it is the day the files were moved.
 */
function wentUp(unit, heldOn) {
  if (unit.uploaded_at) {
    const lagos = new Date(new Date(unit.uploaded_at).getTime() + 3600000).toISOString();
    const days = heldOn ? Math.round((Date.parse(lagos.slice(0, 10)) - Date.parse(heldOn)) / 86400000) : null;
    const after =
      days === null ? "" : days === 0 ? ", on polling day" : days === 1 ? ", the day after polling day" : days > 1 ? `, ${formatNumber(days)} days after polling day` : `, ${formatNumber(-days)} day(s) before polling day`;
    return `Went up ${words(lagos.replace("T", " "))}${after}`;
  }
  return unit.sheet_at ? `Last changed on INEC's portal ${words(new Date(unit.sheet_at).toISOString().replace("T", " "))} world time` : null;
}

const STATE_WORDS = { present: "Present", absent: "Absent", unclear: "Could not be told from the picture", none: "None seen", altered: "A figure looks altered" };

/**
 * One polling unit's sheet: the paper, what its file says about itself, the
 * figures read from it, and our own agent's return beside them.
 *
 * Everything about one sheet in one place, because checking a sheet is one
 * act: look at the paper, look at the numbers, decide whether they are the
 * same thing.
 */
export default async function UnitPage({ params }) {
  const admin = await requireCapability("system:read", "/admin/irev");
  const { election: rawElection, unit: rawUnit } = await params;

  const db = bank();
  const [electionId, unitId] = [Number(rawElection), Number(rawUnit)];
  if (!db || !Number.isInteger(electionId) || !Number.isInteger(unitId) || !(await vault.ready(db))) notFound();

  const [election, unit] = await Promise.all([vault.election(db, electionId), vault.unit(db, electionId, unitId)]);
  if (!election || !unit) notFound();

  const { reading, picture } = unit;
  const sheetReader = inecReader();
  const canRead = sheetReader !== null;
  const heldOn = election.held_on ?? null;

  const flags = pictureFlags(picture, { heldOn });
  const together = await vault.sameSpot(db, electionId, picture);
  if (together >= 5) {
    flags.push(`${formatNumber(together)} other polling units of this election were photographed on this same spot.`);
  }

  /* The spot, drawn with every other sheet of the election around it. */
  const map =
    picture?.latitude != null
      ? await spotMap(picture.latitude, picture.longitude, {
          others: (await vault.spots(db, electionId)).filter((spot) => spot.unit_id !== unitId),
        })
      : null;

  /* Our own return for this unit, where the election is tied to a project. */
  const project = election.project_id ? (await listElections()).find((entry) => entry.id === election.project_id) : null;
  const ours = project
    ? (await results.counted(project.id, defaultRace(project), null)).find(
        (row) => String(row.unitCode).replace(/\D/g, "") === String(unit.pu_code).replace(/\D/g, "")
      )
    : null;

  const read = reading?.status === "read" ? reading : null;
  const gaps = ours && read ? differences(ours, read) : [];
  const parties = [...new Set([...Object.keys(read?.party_votes ?? {}), ...Object.keys(ours?.votes ?? {})])]
    .filter((party) => party !== "OTH")
    .sort((a, b) => (read?.party_votes?.[b] ?? ours?.votes?.[b] ?? 0) - (read?.party_votes?.[a] ?? ours?.votes?.[a] ?? 0));

  /* What the page will do for itself on opening; see ./Prepare.jsx. */
  const needsExamining = picture?.status !== "examined" && picture?.status !== "gone";
  const needsReading = canRead && !reading;

  const sheetSrc = `/api/irev/sheet?e=${electionId}&u=${unitId}`;

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title={`${unit.pu_code} · ${unit.unit_name}`}
      lead={[unit.ward_name, unit.lga_name, unit.state_name].filter(Boolean).join(" · ") + ` — ${election.name}`}
      actions={
        <Button href={`/admin/irev/${electionId}`} variant="dashOutline" size="sm">
          <ArrowLeft size={14} /> All polling units
        </Button>
      }
    >
      {unit.sheet_url && (needsExamining || needsReading) && (
        <Prepare election={electionId} unit={unitId} examining={needsExamining} reading={needsReading} />
      )}

      {!unit.sheet_url ? (
        <Card title="No sheet yet">
          <Empty>INEC has not published a result sheet for this polling unit.</Empty>
        </Card>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <Card
            title="The sheet INEC published"
            subtitle={wentUp(unit, election.held_on)}
            padded={false}
            action={
              <Button href={sheetSrc} external variant="dashOutline" size="sm">
                Open full size
              </Button>
            }
          >
            {/* Served by our own route, which unwraps a scanned document into a
                picture; see app/api/irev/sheet/route.js. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheetSrc} alt={`Result sheet for polling unit ${unit.pu_code}`} className="block min-h-40 w-full bg-dash-bg" loading="lazy" />
            {unit.earlier_sheets > 0 && (
              <p className="border-t border-dash-line px-5 py-3 text-[0.8125rem] text-dash-muted">
                This is not the first sheet published for this unit. {formatNumber(unit.earlier_sheets)} earlier one(s)
                were replaced.
              </p>
            )}
          </Card>

          <div className="grid gap-6">
            <Card
              title="The figures"
              subtitle={ours ? `Read off INEC's sheet, beside what our agent filed in ${project.title ?? "our project"}.` : "Read off INEC's sheet."}
              action={
                gaps.length > 0 ? (
                  <Badge tone="warn">{formatNumber(gaps.length)} figure(s) differ</Badge>
                ) : ours && read ? (
                  <Badge tone="good">Same as ours</Badge>
                ) : (
                  <GitCompareArrows size={16} className="text-dash-muted" />
                )
              }
            >
              {!read && !ours ? (
                <Empty icon={ScanLine}>
                  {reading?.status === "gone"
                    ? "The sheet is no longer on INEC's storage, so it cannot be read."
                    : reading
                      ? `The reader could not read this sheet${reading.problems ? `: ${reading.problems}` : "."}`
                      : canRead
                        ? "Reading the figures off this sheet now."
                        : "This sheet has not been read into figures yet."}
                </Empty>
              ) : (
                <>
                  {read && (!read.balanced || read.code_matches === false) && (
                    <p className="mb-4 rounded-dash-sm border border-flag-200 bg-flag-50 px-3 py-2.5 text-[0.8125rem] font-semibold text-flag-900">
                      {read.code_matches === false
                        ? `The unit code written on this paper is ${read.code_on_sheet}, not ${unit.pu_code}. It may be another unit's sheet.`
                        : `This reading is in doubt${read.problems ? `: ${read.problems}` : ""}. Read the figures off the paper before relying on it.`}
                    </p>
                  )}
                  <Table head={["", { label: "INEC's sheet", numeric: true }, ...(ours ? [{ label: "Our return", numeric: true }] : [])]}>
                    {[
                      ["Registered voters", read?.registered, ours?.registered],
                      ["Accredited", read?.accredited, ours?.accredited],
                      ["Rejected", read?.rejected, ours?.rejected],
                    ].map(([label, inec, mine]) => (
                      <Figure key={label} label={label} inec={inec} mine={mine} both={Boolean(ours)} />
                    ))}
                    {parties.map((party) => (
                      <Figure
                        key={party}
                        label={party}
                        inec={read ? (read.party_votes?.[party] ?? 0) : null}
                        mine={ours ? (ours.votes?.[party] ?? 0) : null}
                        both={Boolean(ours)}
                        party
                      />
                    ))}
                    <Figure label="Total valid votes, as written" inec={read?.stated_valid ?? read?.valid_votes} mine={null} both={Boolean(ours)} />
                  </Table>

                  {read && read.signature && (
                    <dl className="mt-4 grid gap-x-6 gap-y-1.5 border-t border-dash-line pt-4 text-[0.8125rem] sm:grid-cols-2">
                      {[
                        ["Signed", STATE_WORDS[read.signature]],
                        ["Stamped", STATE_WORDS[read.stamp]],
                        ["Alterations", STATE_WORDS[read.alteration]],
                        ["How clear the page was", read.legibility],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3">
                          <dt className="text-dash-muted">{label}</dt>
                          <dd className="text-dash-ink">{value ?? "not recorded"}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              )}

              {canRead ? (
                <form action={readUnit} className="mt-5 flex flex-wrap items-center gap-3 border-t border-dash-line pt-4">
                  <input type="hidden" name="election" value={electionId} />
                  <input type="hidden" name="unit" value={unitId} />
                  <Button type="submit" variant="dash" size="sm">{reading ? "Read this sheet again" : "Read this sheet now"}</Button>
                  <p className="text-[0.75rem] text-dash-muted">
                    {sheetReader.strong
                      ? "Takes up to a minute. The reader is paid for each sheet."
                      : "Takes about ten seconds, with the basic reader. Check its figures against the paper."}
                  </p>
                </form>
              ) : (
                <p className="mt-5 border-t border-dash-line pt-4 text-[0.75rem] text-dash-muted">
                  Reading sheets into figures is switched off on this deployment until the reader&rsquo;s key is set.
                </p>
              )}
            </Card>

            <Card
              title="What the picture says about itself"
              subtitle="Written into the file by the device that photographed the sheet."
              action={<Camera size={16} className="text-dash-muted" />}
            >
              {picture?.status === "examined" ? (
                <PictureReport
                  report={fromRow(picture, flags, map, {
                    area: [unit.ward_name, unit.lga_name, unit.state_name].filter(Boolean).join(", "),
                    map: map ? null : await areaMap(unit.state_name ?? election.state_name, unit.lga_name),
                  })}
                />
              ) : (
                <Empty icon={Camera}>
                  {picture?.status === "gone"
                    ? "The sheet is no longer on INEC's storage, so its file cannot be examined."
                    : picture?.status === "failed"
                      ? `This sheet's file could not be fetched from INEC's storage${picture.notes ? `: ${picture.notes}` : "."}`
                      : "Examining this sheet's file now."}
                </Empty>
              )}
            </Card>
          </div>
        </div>
      )}
    </DashLayout>
  );
}

function Figure({ label, inec, mine, both, party = false }) {
  const differs = both && inec != null && mine != null && Number(inec) !== Number(mine);
  const show = (value) => (value == null ? "—" : formatNumber(value));

  return (
    <tr className={differs ? "bg-red-50" : undefined}>
      <Cell strong={party}>{label}</Cell>
      <Cell numeric strong={differs}>{show(inec)}</Cell>
      {both && <Cell numeric strong={differs} className={differs ? "text-red-700" : undefined}>{show(mine)}</Cell>}
    </tr>
  );
}
