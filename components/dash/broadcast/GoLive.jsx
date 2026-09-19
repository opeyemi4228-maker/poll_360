"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Monitor, Radio, Square } from "lucide-react";

import { Card, Empty } from "@/components/dash/DashCard";
import { Said, useAction, useDesk } from "./Queue";
import { draftItem, endLive, liveKeys, moveItem, startLive } from "@/app/broadcast/actions";
import { cn } from "@/lib/utils";

/**
 * Going live: one press opens the programme everywhere it can be opened.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE HONEST SHAPE OF A "GO LIVE" BUTTON
 *
 *  Video leaves an encoder, not a web page — see lib/live-video.js. So this
 *  screen does the four things that are genuinely ours to do, in the order a
 *  gallery does them:
 *
 *    1  open the broadcast on Facebook and YouTube through their own APIs,
 *       so the programme exists and has a public address;
 *    2  hand the encoder one address and key per platform, to paste once;
 *    3  put the stage up — the full-screen picture to capture;
 *    4  tell the audience, everywhere, with the link.
 *
 *  What it never does is say "you are live" when nothing is being pushed.
 *  Open means the channel is open and waiting for the encoder, and the screen
 *  says exactly that.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function GoLive({ items = [], liveChannels = [], project, stageUrl, wire }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();
  const [title, setTitle] = useState("");
  /* Asked for when somebody is setting an encoder up, rather than sitting in
     the page for every passer-by and every screen recording. */
  const [keys, setKeys] = useState(null);
  const [chosen, setChosen] = useState(() => new Set(liveChannels.filter((row) => row.configured || !row.opens).map((row) => row.id)));

  /* The programme currently open, if there is one. */
  const running = items.find((item) => item.kind === "VIDEO" && item.state === "ON_AIR" && item.payload?.live) ?? null;
  const open = (running?.payload?.live ?? []).filter((row) => row.status === "OPEN");
  const announce = (running?.payload?.live ?? []).filter((row) => row.status === "ANNOUNCE");
  const refused = (running?.payload?.live ?? []).filter((row) => row.status === "FAILED" || row.status === "NOT_SET_UP");

  const toggle = (id) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <div className="space-y-4">
        {running ? (
          <Card
            title="The programme is open"
            subtitle={`Started ${new Date(running.payload.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · point your encoder at the address below and press start`}
            action={
              may.air && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => endLive({ id: running.id }))}
                  className="inline-flex h-9 items-center gap-2 rounded-dash-sm border-2 border-red-600 px-3 text-[0.75rem] font-bold tracking-[0.06em] text-red-700 uppercase hover:bg-red-50 disabled:opacity-40"
                >
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} strokeWidth={3} />}
                  End the broadcast
                </button>
              )
            }
          >
            <ul className="space-y-3">
              {open.map((row) => (
                <li key={row.platform} className="rounded-dash border border-emerald-200 bg-emerald-50/60 p-3.5">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[0.9375rem] font-bold text-dash-ink">
                      <span className="size-2 animate-pulse rounded-full bg-red-600" />
                      {row.platform === "facebook" ? "Facebook" : row.platform === "youtube" ? "YouTube" : row.platform}
                    </span>
                    {row.watch && (
                      <a
                        href={row.watch}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[0.8125rem] font-bold text-dash-ink hover:underline"
                      >
                        Watch page
                        <ExternalLink size={13} strokeWidth={2.5} />
                      </a>
                    )}
                  </p>
                  {keys?.[row.platform] ? (
                    <Secret label="Stream address for your encoder" value={keys[row.platform]} />
                  ) : row.ingestSealed ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => liveKeys({ id: running.id }), {
                          onDone: (answer) =>
                            setKeys(Object.fromEntries((answer?.keys ?? []).map((key) => [key.platform, key.ingest]))),
                        })
                      }
                      className="mt-2 inline-flex h-9 items-center gap-2 rounded-dash-sm border border-dash-line px-3 text-[0.75rem] font-bold text-dash-ink hover:border-dash-ink disabled:opacity-40"
                    >
                      {pending ? <Loader2 size={14} className="animate-spin" /> : null}
                      Show the stream address
                    </button>
                  ) : (
                    <p className="mt-2 text-[0.8125rem] text-dash-muted">
                      This platform did not return a stream address. Start the stream from its own studio page.
                    </p>
                  )}
                </li>
              ))}

              {announce.length > 0 && (
                <li className="rounded-dash border border-dash-line p-3.5">
                  <p className="text-[0.875rem] font-bold text-dash-ink">
                    {announce.map((row) => row.platform).join(", ")}: start in the app
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">
                    These cannot be opened from here. Start the live there, then announce it below so the
                    audience on every other platform is sent to it.
                  </p>
                </li>
              )}

              {refused.length > 0 && (
                <li className="rounded-dash border border-red-200 bg-red-50 p-3.5">
                  {refused.map((row) => (
                    <p key={row.platform} className="text-[0.8125rem] text-red-700">
                      <span className="font-bold">{row.platform}:</span> {row.error}
                    </p>
                  ))}
                </li>
              )}
            </ul>

            {/* ── TELLING PEOPLE IT IS ON ────────────────────────────────
                A programme nobody is told about is a programme nobody
                watches. The announcement is a post like any other: written
                here, cleared by somebody else, out everywhere. */}
            {may.draft && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    async () => {
                      const links = open.map((row) => row.watch).filter(Boolean);
                      const drafted = await draftItem({
                        kind: "SOCIAL",
                        title: `We are live: ${running.title}`,
                        body: `We are live now with the results as they come in.${links.length ? `\n\nWatch: ${links.join("  ")}` : ""}`,
                        scope: "NATION",
                        platforms: ["facebook", "x", "instagram", "threads", "telegram", "whatsapp"],
                        payload: { format: "breaking-card", shape: "square", headline: "WE ARE LIVE" },
                      });
                      if (drafted?.error) return drafted;
                      return moveItem({ id: drafted.id, to: "REVIEW" });
                    },
                    { onDone: () => setSaid({ tone: "good", text: "Announcement written and sent to an editor. It goes out everywhere the moment it is cleared." }) }
                  )
                }
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase hover:bg-black disabled:opacity-40"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} strokeWidth={2.5} />}
                Announce it on every platform
              </button>
            )}
            <Said said={said} />
          </Card>
        ) : (
          <Card title="Go live" subtitle="Opens the programme on every platform that allows it, in one press">
            {!may.air ? (
              <Empty>This account can read the desk. Going live needs the grant that takes things to air.</Empty>
            ) : (
              <>
                <label className="block">
                  <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                    What the programme is called
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={100}
                    placeholder={`${project?.title ?? "Election"} — live results`}
                    className="mt-1.5 h-11 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.9375rem] font-semibold text-dash-ink"
                  />
                  <span className="mt-1 block text-[0.75rem] text-dash-muted">
                    This is the title viewers see on Facebook and YouTube.
                  </span>
                </label>

                <fieldset className="mt-4">
                  <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">Where</legend>
                  <ul className="mt-2 space-y-1.5">
                    {liveChannels.map((row) => {
                      const on = chosen.has(row.id);
                      const ready = row.opens ? row.configured : true;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => toggle(row.id)}
                            aria-pressed={on}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-dash-sm border px-3 py-2.5 text-left transition-colors",
                              on ? "border-dash-ink bg-dash-bg" : "border-dash-line hover:border-dash-ink"
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "mt-1 size-2.5 shrink-0 rounded-full",
                                row.opens ? (ready ? "bg-emerald-500" : "bg-amber-500") : "bg-dash-line"
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block text-[0.875rem] font-bold text-dash-ink">
                                {row.label}
                                {!row.opens && <span className="ml-2 text-[0.6875rem] font-semibold text-dash-muted">announce only</span>}
                              </span>
                              <span className="block text-[0.75rem] leading-snug text-dash-muted">
                                {row.opens && !row.configured ? `Not set up: ${row.missing.join(", ")}` : row.how}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>

                <button
                  type="button"
                  disabled={pending || chosen.size === 0}
                  onClick={() => run(() => startLive({ title, platforms: [...chosen] }))}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-dash-sm bg-red-600 px-5 text-[0.875rem] font-extrabold tracking-[0.08em] text-white uppercase transition-colors hover:bg-red-500 disabled:opacity-40"
                >
                  {pending ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} strokeWidth={2.5} />}
                  Go live
                </button>
                <Said said={said} />
              </>
            )}
          </Card>
        )}
      </div>

      {/* ── THE PICTURE TO CAPTURE ─────────────────────────────────────── */}
      <div className="space-y-4">
        <Card title="The stage" subtitle="The picture your encoder or projector points at">
          <a
            href="/room/stage"
            target="_blank"
            rel="noreferrer"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase hover:bg-black"
          >
            <Monitor size={15} strokeWidth={2.5} />
            Open the stage
          </a>
          <Secret label="Address for OBS, Streamlabs or a browser source" value={stageUrl ?? "/room/stage"} />
          <ol className="mt-3 space-y-2 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
            <li>
              <span className="font-bold text-dash-ink">1.</span> In your encoder, add a browser source at
              1920 × 1080 and paste the address above. Sign in once in its window if it asks.
            </li>
            <li>
              <span className="font-bold text-dash-ink">2.</span> Add your camera and microphone over it,
              however the programme is laid out.
            </li>
            <li>
              <span className="font-bold text-dash-ink">3.</span> Paste each stream address from the left
              into the encoder&rsquo;s destinations, and press start.
            </li>
          </ol>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
            The stage shows only figures an editor has cleared. Until something is cleared it says the count
            is under way, which is the honest thing to have on screen.
          </p>
        </Card>

        {wire && (
          <Card title="Where viewers are sent" subtitle="The public page every post links to">
            <Secret label="Live page" value={wire} />
          </Card>
        )}
      </div>
    </div>
  );
}

/** A value to be pasted somewhere else, with one press to copy it. */
function Secret({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2">
      <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">{label}</p>
      <div className="mt-1 flex items-stretch gap-2">
        <code className="min-w-0 flex-1 truncate rounded-dash-sm border border-dash-line bg-dash-bg px-3 py-2 font-mono text-[0.75rem] text-dash-ink">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* A browser that refuses the clipboard still shows the value. */
            }
          }}
          className="inline-flex h-auto shrink-0 items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 text-[0.75rem] font-bold text-dash-ink hover:border-dash-ink"
        >
          {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2.5} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
