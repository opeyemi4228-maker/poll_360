import Link from "next/link";
import { Gavel, Phone, X } from "lucide-react";

import { Badge, Card, Empty } from "@/components/dash/DashCard";
import ActionForm, { Area, Choice, Field, Submit } from "./ActionForm";
import BvasBlock from "./BvasBlock";
import SheetViewer from "./SheetViewer";
import { LightBadge } from "./Light";
import { IncidentList, ItemList, age, clock, hrefWith } from "./Panels";
import { asWords, cn, formatNumber } from "@/lib/utils";

/**
 * One polling unit, whole: who is assigned, what was filed, the BVAS figure
 * from each source, the photographed sheet, INEC's reading beside ours,
 * everything open here and everything that ever was.
 *
 * Which buttons appear follows `caps`. Pressing one asks the server again.
 */
const SOURCE = { AGENT: "From the agent at the unit", APP: "From the agent at the unit", WHATSAPP: "Over WhatsApp", UPLOAD: "Read out over the phone to a desk" };

function Person({ held, role, canCall }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[0.8125rem]">
      <Badge tone={role === "Primary agent" ? "ink" : "neutral"}>{role}</Badge>
      <span className="font-semibold text-dash-ink">{held.name}</span>
      <span className="text-dash-muted">{held.lastSeen ? `last signed in ${age(held.lastSeen)} ago` : "not signed in yet"}</span>
      {canCall && held.phone && (
        <>
          <a href={`tel:+${held.phone}`} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Phone size={13} aria-hidden="true" /> +{held.phone}</a>
          <a href={`https://wa.me/${held.phone}`} className="font-semibold text-blue-700 hover:underline">WhatsApp</a>
        </>
      )}
    </li>
  );
}

export default function UnitPanel({ view, caps = {}, base, query = {}, userId, roster = [] }) {
  const { result, held, bvas } = view;
  const open = view.history.filter((item) => item.status === "OPEN");
  const closed = view.history.filter((item) => item.status !== "OPEN");
  const mineToCheck = result && result.submittedBy !== userId;

  return (
    <Card
      id="unit"
      title={view.name}
      subtitle={`${view.path} · ${view.code}`}
      action={
        <span className="flex items-center gap-2">
          <LightBadge light={view.light.light} />
          <Link href={hrefWith(base, query, { unit: null })} aria-label="Close this polling unit" className="inline-flex size-9 items-center justify-center rounded-dash-sm border border-dash-line text-dash-ink hover:border-dash-ink">
            <X size={16} />
          </Link>
        </span>
      }
    >
      {view.malpractice && (
        <p className="mb-4 flex items-center gap-2 rounded-dash-sm border border-light-red bg-light-red-soft px-3 py-2 text-[0.8125rem] font-bold text-light-red">
          <Gavel size={15} aria-hidden="true" /> History: malpractice confirmed at this polling unit
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-5">
          <section>
            <h3 className="text-[0.875rem] font-bold text-dash-ink">Who is assigned</h3>
            {held.primary || held.backups.length || held.coordinators.length ? (
              <ul className="divide-y divide-dash-line">
                {held.primary && <Person held={held.primary} role="Primary agent" canCall={caps.act || caps.check} />}
                {held.backups.map((each) => <Person key={each.id} held={each} role="Backup agent" canCall={caps.act || caps.check} />)}
                {held.coordinators.map((each) => <Person key={each.id} held={each} role="Ward coordinator" canCall={caps.act || caps.check} />)}
              </ul>
            ) : (
              <p className="mt-1 text-[0.8125rem] text-dash-muted">Nobody is assigned to this polling unit.</p>
            )}
          </section>

          <section>
            <h3 className="flex flex-wrap items-center gap-2 text-[0.875rem] font-bold text-dash-ink">
              The result
              {result && <Badge tone={result.status === "VERIFIED" ? "good" : result.status === "DISPUTED" ? "alert" : "warn"}>{asWords(result.status)}</Badge>}
            </h3>
            {result ? (
              <>
                <p className="mt-1 text-[0.8125rem] text-dash-muted">
                  {SOURCE[result.source] ?? asWords(result.source)} · filed by {view.filer ?? "an agent"} at {clock(result.submittedAt)}
                  {result.status === "DISPUTED" && " · it has stopped counting"}
                </p>
                <table className="mt-2 w-full text-left text-[0.8125rem] tabular-nums">
                  <thead className="text-dash-muted">
                    <tr className="border-b border-dash-line">
                      <th scope="col" className="py-1.5 font-semibold">Party</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Our agent</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">INEC&apos;s sheet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.parties.map((party) => {
                      const ours = result.votes?.[party.id];
                      const theirs = view.inec?.votes?.[party.id];
                      if (!ours && !theirs) return null;
                      const differs = theirs != null && Number(ours ?? 0) !== Number(theirs);
                      return (
                        <tr key={party.id} className="border-b border-dash-line last:border-0">
                          <th scope="row" className="py-1.5 font-semibold text-dash-ink">{party.id}</th>
                          <td className="py-1.5 text-right">{formatNumber(ours ?? 0)}</td>
                          <td className={cn("py-1.5 text-right", differs && "font-bold text-light-yellow-ink")}>{theirs == null ? "Not held" : `${differs ? "▲ " : ""}${formatNumber(theirs)}`}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <th scope="row" className="py-1.5 font-semibold text-dash-muted">Rejected</th>
                      <td className="py-1.5 text-right">{formatNumber(result.rejected)}</td>
                      <td className="py-1.5 text-right" />
                    </tr>
                  </tbody>
                </table>
                {!view.inec && <p className="mt-1 text-[0.75rem] text-dash-muted">INEC&apos;s sheet for this unit is not held yet, so there is nothing to set beside ours.</p>}
                {view.inec && !view.inec.published && <p className="mt-1 text-[0.75rem] text-dash-muted">INEC lists this unit and has published no sheet.</p>}
              </>
            ) : (
              <Empty>No returns yet from this polling unit.</Empty>
            )}
          </section>

          {result && <BvasBlock bvas={bvas} unit={view.sources} />}

          {result && (caps.check || caps.correct || caps.second || caps.dispute) && (
            <section className="space-y-3 rounded-dash-sm bg-dash-bg p-3">
              {view.pending ? (
                <div>
                  <p className="text-[0.8125rem] text-dash-ink">
                    <b>{view.pending.madeName}</b> corrected this at {clock(view.pending.madeAt)}: {view.pending.reason}. A different verifier has to check it.
                  </p>
                  <p className="mt-1 text-[0.75rem] text-dash-muted tabular-nums">
                    BVAS accredited {formatNumber(view.pending.before.accredited)} → {formatNumber(view.pending.after.accredited)} · rejected {formatNumber(view.pending.before.rejected)} → {formatNumber(view.pending.after.rejected)}
                    {Object.keys(view.pending.after.votes).filter((party) => Number(view.pending.before.votes?.[party] ?? 0) !== Number(view.pending.after.votes[party])).map((party) => ` · ${party} ${formatNumber(view.pending.before.votes?.[party] ?? 0)} → ${formatNumber(view.pending.after.votes[party])}`)}
                  </p>
                  {caps.second && view.pending.madeBy !== userId && mineToCheck && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActionForm what="second" hidden={{ unit: view.code, accept: "yes" }}><Submit>The correction is right</Submit></ActionForm>
                      <ActionForm what="second" hidden={{ unit: view.code, accept: "no" }} confirm="Put the old figures back?"><Submit variant="dashOutline">Put the old figures back</Submit></ActionForm>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {caps.check && result.status === "SUBMITTED" && (
                    mineToCheck ? (
                      <ActionForm what="check" hidden={{ unit: view.code }}><Submit>The figures match the sheet</Submit></ActionForm>
                    ) : (
                      <p className="text-[0.8125rem] font-semibold text-dash-muted">You filed this result. Somebody else has to check it.</p>
                    )
                  )}
                  {caps.correct && result.status !== "DISPUTED" && (
                    <details>
                      <summary className="cursor-pointer text-[0.8125rem] font-bold text-blue-700">Correct a figure</summary>
                      <ActionForm what="correct" hidden={{ unit: view.code }} className="mt-2 space-y-2" done="Corrected. It now waits for a different verifier.">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Field label="Registered" name="registered" inputMode="numeric" defaultValue={result.registered} required />
                          <Field label="BVAS accredited" name="accredited" inputMode="numeric" defaultValue={result.accredited} required />
                          <Field label="Rejected" name="rejected" inputMode="numeric" defaultValue={result.rejected} required />
                          <Field label="Manual register (if on sheet)" name="accreditedManual" inputMode="numeric" defaultValue={view.sources?.manual ?? ""} />
                          {view.parties.map((party) => (
                            <Field key={party.id} label={party.id} name={`votes_${party.id}`} inputMode="numeric" defaultValue={result.votes?.[party.id] ?? 0} />
                          ))}
                        </div>
                        <Area label="Why it is being corrected" name="reason" rows={1} required />
                        <Submit>Save the correction</Submit>
                      </ActionForm>
                    </details>
                  )}
                </>
              )}
              {caps.dispute && result.status !== "DISPUTED" && (
                <details>
                  <summary className="cursor-pointer text-[0.8125rem] font-bold text-light-red">Mark this result disputed</summary>
                  <ActionForm what="dispute" hidden={{ unit: view.code }} className="mt-2 space-y-2" confirm="A disputed result stops counting. It is not deleted. Continue?">
                    <Area label="Why" name="note" rows={1} required />
                    <Submit variant="dashOutline">Mark disputed</Submit>
                  </ActionForm>
                </details>
              )}
              {caps.check && (
                <details>
                  <summary className="cursor-pointer text-[0.8125rem] font-bold text-blue-700">Ask the field to confirm something</summary>
                  <ActionForm what="askField" hidden={{ unit: view.code }} className="mt-2 space-y-2" done="Sent to the field desk.">
                    <Area label="What should they confirm" name="note" rows={1} required />
                    <Submit variant="dashOutline">Ask the field</Submit>
                  </ActionForm>
                </details>
              )}
            </section>
          )}
        </div>

        <div className="space-y-5">
          {caps.sheets && (
            <section>
              <h3 className="mb-2 text-[0.875rem] font-bold text-dash-ink">The photographed sheet</h3>
              {view.hasSheet ? (
                <SheetViewer
                  unit={view.code}
                  facts={[
                    ["Read at", clock(view.readAt) || "Not recorded"],
                    ["Distance from the unit", result?.position?.distance != null ? `${formatNumber(Math.round(result.position.distance))} m` : "No location with the filing"],
                    ["Date on the sheet", result?.sheetDate ?? "Not read"],
                    ["Sheet against figures", result?.sheetMatch ? (result.sheetMatch.compared === false ? "Could not be read" : result.sheetMatch.agrees ? "Agreed" : "Compared") : "No sheet compared"],
                  ]}
                />
              ) : (
                <Empty>No photograph of the sheet is held for this polling unit.</Empty>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Open here</h3>
            <ItemList items={open} caps={caps} userId={userId} roster={roster} empty="Nothing is open at this polling unit." />
          </section>

          {view.waiting.length > 0 && (
            <section>
              <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Sent by an agent, not counted</h3>
              <ul className="divide-y divide-dash-line">
                {view.waiting.map((row) => (
                  <li key={row.id} className="py-2 text-[0.8125rem]">
                    <p className="font-semibold text-dash-ink">{asWords(row.kind)} · {row.personName ?? "An agent"} · {clock(row.createdAt)}</p>
                    {row.figures && (
                      <p className="text-dash-muted tabular-nums">
                        BVAS {formatNumber(row.figures.accredited ?? 0)} · rejected {formatNumber(row.figures.rejected ?? 0)} · {Object.entries(row.figures.votes ?? {}).filter(([, value]) => value).map(([party, value]) => `${party} ${formatNumber(value)}`).join(" · ")}
                      </p>
                    )}
                    {(caps.yellow || caps.field) && <ActionForm what="closeSubmission" hidden={{ id: row.id }} className="mt-1"><Submit variant="dashOutline">Reviewed</Submit></ActionForm>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {caps.act && !result && (
            <section>
              <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Chasing this unit</h3>
              <ActionForm what="contact" hidden={{ unit: view.code }} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                <Choice label="The call" name="outcome" options={[["REACHED", "Reached"], ["NO_ANSWER", "No answer"], ["SWITCHED_OFF", "Switched off"]]} />
                <Area label="Note" name="note" rows={1} />
                <Submit variant="dashOutline">Log it</Submit>
              </ActionForm>
              {view.contacts.length > 0 && (
                <ul className="mt-2 text-[0.8125rem] text-dash-muted">
                  {view.contacts.map((row, index) => (
                    <li key={index}>{clock(row.at)} · {asWords(row.outcome)} · {row.byName}{row.note ? ` · ${row.note}` : ""}</li>
                  ))}
                </ul>
              )}
              {caps.phonedIn && (
                <Link href={`/field?unit=${encodeURIComponent(view.code)}`} className="mt-3 inline-flex h-10 items-center rounded-dash-sm bg-dash-ink px-4 text-[0.8125rem] font-semibold text-white">
                  Enter a result read out over the phone
                </Link>
              )}
            </section>
          )}

          {view.reports.length > 0 && (
            <section>
              <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Reports from this unit</h3>
              <IncidentList rows={view.reports} caps={caps} />
            </section>
          )}

          {(closed.length > 0 || view.corrections.length > 0) && (
            <details>
              <summary className="cursor-pointer text-[0.875rem] font-bold text-dash-ink">History ({closed.length + view.corrections.length})</summary>
              <ul className="mt-2 space-y-1.5 text-[0.8125rem] text-dash-muted">
                {view.corrections.map((row) => (
                  <li key={row.id}>{clock(row.madeAt)} · Corrected by {row.madeName}: {row.reason} · {asWords(row.status)}{row.checkedName ? ` by ${row.checkedName}` : ""}</li>
                ))}
                {closed.map((item) => (
                  <li key={item.id}>
                    {clock(item.openedAt)} · {item.title} · {item.resolution === "NO_LONGER_APPLIES" ? "closed when the facts changed" : asWords(item.resolution ?? "resolved")} by {item.resolvedName ?? "Poll360"}
                    {item.resolutionNote ? ` · ${item.resolutionNote}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </Card>
  );
}
