"use client";

import { useState } from "react";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";

import { Card } from "@/components/dash/DashCard";
import PartyMark from "@/components/dash/PartyMark";
import { Said, useAction, useDesk } from "./Queue";
import { removeContestant, saveContestant } from "@/app/broadcast/actions";
import { countedParties } from "@/lib/races";
import { cn } from "@/lib/utils";

/**
 * Who is standing, with their faces.
 *
 * Every result card that names a party draws its candidate from here: the
 * face in the party's column, the name under the party's code. A party with
 * no candidate added is drawn with its logo instead, which is a finished card
 * rather than a gap — so this is worth doing for the main contenders and not
 * a chore to complete for all eighteen.
 *
 * Portraits are cut to a square around the face and made small in this
 * browser before they are sent, so a phone photograph of a campaign poster
 * becomes a few dozen kilobytes rather than several megabytes.
 */
export default function Contestants({ race, raceLabel, contestants = [] }) {
  const { may } = useDesk();
  const byParty = Object.fromEntries(contestants.map((row) => [row.party, row]));
  const ballot = countedParties(race);
  /* The parties with a candidate first, then the rest in ballot order. */
  const ordered = [...ballot].sort((a, b) => Number(Boolean(byParty[b.id])) - Number(Boolean(byParty[a.id])));

  return (
    <Card
      title="Candidates"
      subtitle={`${raceLabel ?? "This contest"} · the faces and names drawn on every result card`}
    >
      <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {ordered.map((party) => (
          <Row key={party.id} party={party} race={race} saved={byParty[party.id] ?? null} editable={may.draft} />
        ))}
      </ul>
    </Card>
  );
}

function Row({ party, race, saved, editable }) {
  const { pending, said, run, setSaid } = useAction();
  const [name, setName] = useState(saved?.name ?? "");
  const [mate, setMate] = useState(saved?.runningMate ?? "");
  const [photo, setPhoto] = useState(undefined);
  const shown = photo === undefined ? saved?.photo ?? null : photo;
  const dirty = name !== (saved?.name ?? "") || mate !== (saved?.runningMate ?? "") || photo !== undefined;

  const choose = async (file) => {
    if (!file) return;
    try {
      setPhoto(await portrait(file));
    } catch {
      setSaid({ tone: "alert", text: "That file could not be read as a picture." });
    }
  };

  return (
    <li className={cn("rounded-dash border bg-dash-card p-3.5", saved ? "border-dash-ink/30" : "border-dash-line")}>
      <div className="flex items-start gap-3">
        <label
          className={cn(
            "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-dash-sm border border-dash-line bg-dash-bg",
            editable && "cursor-pointer hover:border-dash-ink"
          )}
          title={editable ? "Choose a photograph" : undefined}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data address from this browser or the store
            <img src={shown} alt={`${name || party.name}`} className="size-full object-cover object-top" />
          ) : (
            <UserRound size={30} className="text-dash-muted" />
          )}
          {editable && (
            <>
              <span className="absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-full bg-dash-ink text-white">
                <Camera size={13} strokeWidth={2.5} />
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => choose(event.target.files?.[0])}
              />
            </>
          )}
        </label>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <PartyMark id={party.id} size={22} />
            <span className="text-[0.875rem] font-bold text-dash-ink">{party.id}</span>
            <span className="truncate text-[0.75rem] text-dash-muted">{party.name}</span>
          </p>
          <input
            value={name}
            disabled={!editable}
            onChange={(event) => setName(event.target.value)}
            placeholder="Candidate's name"
            maxLength={80}
            className="mt-2 h-9 w-full rounded-dash-sm border border-dash-line bg-dash-card px-2.5 text-[0.8125rem] font-semibold text-dash-ink"
          />
          <input
            value={mate}
            disabled={!editable}
            onChange={(event) => setMate(event.target.value)}
            placeholder="Running mate (optional)"
            maxLength={80}
            className="mt-1.5 h-8 w-full rounded-dash-sm border border-dash-line bg-dash-card px-2.5 text-[0.75rem] text-dash-ink"
          />
        </div>
      </div>

      {editable && (dirty || saved) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {dirty && (
            <button
              type="button"
              disabled={pending || !name.trim()}
              onClick={() =>
                run(() => saveContestant({ party: party.id, race, name, runningMate: mate || null, photo }), {
                  onDone: () => {
                    setPhoto(undefined);
                    setSaid({ tone: "good", text: "Saved. Every card drawn from now on carries it." });
                  },
                })
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-dash-sm bg-dash-ink px-3 text-[0.6875rem] font-bold tracking-[0.06em] text-white uppercase disabled:opacity-40"
            >
              {pending && <Loader2 size={13} className="animate-spin" />}
              Save
            </button>
          )}
          {saved?.photo && photo === undefined && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => saveContestant({ party: party.id, race, name: saved.name, runningMate: saved.runningMate, photo: null }))}
              className="inline-flex h-8 items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 text-[0.6875rem] font-bold tracking-[0.06em] text-dash-muted uppercase hover:text-dash-ink"
            >
              Remove photo
            </button>
          )}
          {saved && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeContestant({ party: party.id, race }))}
              className="inline-flex h-8 items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 text-[0.6875rem] font-bold tracking-[0.06em] text-dash-muted uppercase hover:text-red-700"
            >
              <Trash2 size={12} strokeWidth={2.5} />
              Remove
            </button>
          )}
        </div>
      )}
      <Said said={said} />
    </li>
  );
}

/**
 * A photograph, made into a portrait the cards can use: cropped to a square
 * weighted towards the top — where the face is in nearly every campaign
 * picture — and scaled to 480 pixels as a JPEG.
 */
async function portrait(file, size = 480) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = bitmap.height > bitmap.width ? Math.min((bitmap.height - side) * 0.15, bitmap.height - side) : 0;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}
