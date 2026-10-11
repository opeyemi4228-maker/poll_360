import { Radio } from "lucide-react";

import { Badge, Empty } from "@/components/dash/DashCard";
import ActionForm, { Area, Choice, Field, Submit } from "./ActionForm";
import { age, clock } from "./Panels";
import { deskMove, deskWrite, proposeCall } from "@/app/broadcast/actions";
import { correctionOf, platformLabel, PLATFORMS, stateLabel } from "@/lib/broadcast";

/**
 * The broadcast desk as the room sees it: what is waiting to be cleared,
 * what is cleared, and what went out and where it landed.
 *
 * Three kinds of post, and they are not cleared alike. A routine post is
 * cleared by any clearer. A race call and a correction are cleared by the
 * Director or the Super Admin. Nobody clears what they wrote. Every one of
 * those is decided again by the action when the button is pressed.
 */
export const typeOf = (item) => (item.payload?.call ? "Race call" : correctionOf(item) ? "Correction" : "Routine");

function Row({ item, caps, userId, deliveries, now }) {
  const type = typeOf(item);
  const mine = item.createdBy === userId;
  const mayClear = !mine && (type === "Routine" ? caps.clear : caps.call);
  const sent = Object.values(deliveries ?? {});
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={type === "Routine" ? "neutral" : "alert"}>{type}</Badge>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-bold text-dash-ink">{item.title}</span>
          <span className="block text-[0.8125rem] text-dash-muted">
            {stateLabel(item.state)} · written by {item.createdName ?? "the desk"}
            {item.clearedName ? ` · cleared by ${item.clearedName} at ${clock(item.clearedAt)}` : ""} · {age(item.updatedAt ?? item.createdAt, now)}
          </span>
        </span>
      </div>
      {item.body && <p className="mt-1 text-[0.8125rem] whitespace-pre-wrap text-dash-ink">{item.body}</p>}

      {sent.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem]">
          {sent.map((row) => (
            <span key={row.platform} className={row.remoteUrl || row.remoteId ? "font-semibold text-light-green" : "font-semibold text-light-red"}>
              {platformLabel(row.platform)}:{" "}
              {row.remoteUrl ? <a href={row.remoteUrl} target="_blank" rel="noopener noreferrer" className="underline">Published</a> : row.remoteId ? "Published" : "Did not answer"}
            </span>
          ))}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {item.state === "REVIEW" && mine && <span className="text-[0.8125rem] font-semibold text-dash-muted">You wrote this. Somebody else has to clear it.</span>}
        {item.state === "REVIEW" && mayClear && (
          <>
            <ActionForm action={deskMove} hidden={{ id: item.id, to: "CLEARED" }}><Submit>Clear</Submit></ActionForm>
            <ActionForm action={deskMove} hidden={{ id: item.id, to: "REJECTED" }} className="flex items-end gap-2">
              <Area label="Why it is refused" name="note" rows={1} required />
              <Submit variant="dashOutline">Refuse</Submit>
            </ActionForm>
          </>
        )}
        {item.state === "CLEARED" && caps.air && (
          <ActionForm action={deskMove} hidden={{ id: item.id, to: "ON_AIR" }} confirm="This publishes it to every platform it is aimed at. Send it?"><Submit>Publish</Submit></ActionForm>
        )}
        {item.state === "CLEARED" && caps.hold && (
          <ActionForm action={deskMove} hidden={{ id: item.id, to: "REVIEW" }}><Submit variant="dashOutline">Hold</Submit></ActionForm>
        )}
        {item.state === "ON_AIR" && caps.hold && (
          <ActionForm action={deskMove} hidden={{ id: item.id, to: "OFF_AIR" }} confirm="Pull this post? The request is recorded for every platform."><Submit variant="dashOutline">Pull</Submit></ActionForm>
        )}
      </div>
    </li>
  );
}

export default function BroadcastPanel({ items, deliveries = {}, caps, userId, live = null, now, take = 8 }) {
  const waiting = items.filter((item) => item.state === "REVIEW");
  const cleared = items.filter((item) => item.state === "CLEARED");
  const out = items.filter((item) => item.state === "ON_AIR" || item.state === "OFF_AIR").slice(0, take);
  const list = (rows, empty) =>
    rows.length ? (
      <ul className="divide-y divide-dash-line">{rows.map((item) => <Row key={item.id} item={item} caps={caps} userId={userId} deliveries={deliveries[item.id]} now={now} />)}</ul>
    ) : (
      <Empty icon={Radio}>{empty}</Empty>
    );
  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-dash-ink">
        <Radio size={15} className={live ? "room-pulse text-light-red" : "text-dash-muted"} aria-hidden="true" />
        {live ? `Live since ${clock(live.airedAt)} · ${live.title}` : "No live broadcast is on"}
      </p>
      <section>
        <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Waiting for clearance ({waiting.length})</h3>
        {list(waiting, "Nothing is waiting to be cleared.")}
      </section>
      <section>
        <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Cleared, not sent ({cleared.length})</h3>
        {list(cleared, "Nothing is cleared and waiting to go out.")}
      </section>
      <section>
        <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Published</h3>
        {list(out, "Nothing has gone out yet.")}
      </section>
    </div>
  );
}

/**
 * Propose a race call for the place being looked at. Disabled, with the
 * reason, under the floor. The action refuses below it whatever the screen
 * showed.
 */
export function CallControl({ light, floor, parties, at }) {
  const allowed = light.coveragePct >= floor;
  return (
    <div className="rounded-dash-sm bg-dash-bg p-3">
      <h3 className="text-[0.875rem] font-bold text-dash-ink">Race call · {light.name}</h3>
      {allowed ? (
        <ActionForm action={proposeCall} hidden={{ at }} className="mt-2 grid gap-2 sm:grid-cols-[9rem_9rem_1fr_auto] sm:items-end" done="Proposed. A different person, the Director or the Super Admin, now has to clear it.">
          <Choice label="Call" name="call" options={[["LEANING", "Leaning"], ["DECIDED", "Decided"]]} />
          <Choice label="For" name="party" options={parties.map((party) => [party.id, party.id])} />
          <Area label="What the post says" name="body" rows={1} />
          <Submit>Propose call</Submit>
        </ActionForm>
      ) : (
        <p className="mt-1 text-[0.8125rem] font-semibold text-dash-muted">
          Too early. {light.name} is {light.coveragePct.toFixed(1)}% counted, and nothing is called under {floor}%.
        </p>
      )}
    </div>
  );
}

/** Write a routine post. The figures are built from the stored count; none can be typed. */
export function WritePost({ at = "", placeLabel = "Nigeria" }) {
  return (
    <ActionForm action={deskWrite} hidden={{ at }} className="space-y-2" done="Sent for clearance. Somebody else has to clear it.">
      <p className="text-[0.8125rem] text-dash-muted">A result card for <b className="text-dash-ink">{placeLabel}</b>. Its figures come from the stored count as it stands when you press the button.</p>
      <Field label="Title" name="title" required maxLength={120} />
      <Area label="What the post says" name="body" rows={3} />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] font-semibold text-dash-ink">
        <legend className="mb-1">Send to</legend>
        {PLATFORMS.map((platform) => (
          <label key={platform.id} className="inline-flex items-center gap-1.5 font-normal">
            <input type="checkbox" name="platforms" value={platform.id} defaultChecked /> {platform.label}
          </label>
        ))}
      </fieldset>
      <Submit>Send for clearance</Submit>
    </ActionForm>
  );
}
