"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, Loader2, PlugZap, Send } from "lucide-react";

import { Card, Empty } from "@/components/dash/DashCard";
import PlacePicker from "./PlacePicker";
import { ItemCard, Said, useAction, useDesk } from "./Queue";
import { Bar, Ring } from "./Gauges";
import { checkChannels, draftItem, moveItem } from "@/app/broadcast/actions";
import { DELIVERY, PLATFORMS, SHAPES, platformLabel } from "@/lib/broadcast";
import { captionFor, freezeFigures, measure, stampFor, CAPTION_LIMITS } from "@/lib/stamp";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The social desk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE POST, EVERY PLATFORM, TWO PEOPLE
 *
 *  This desk now publishes. A post is written once — the card, the words, the
 *  place and the minute — and when it is taken to air it goes to every
 *  platform it is aimed at in the same moment, each in the caption length that
 *  platform takes, each linking back to one public page that carries the whole
 *  update. See lib/publish.js for how, and what each platform needs.
 *
 *  What did not change is the part that matters. Nothing is published that
 *  one person wrote and another has not cleared; the writer can ask for it to
 *  go the moment it is cleared, but the clearing is still somebody else's.
 *  And nothing on these screens says a post went out unless the platform
 *  answered with the post — a failure is shown as a failure, with the reason,
 *  on the card, where the desk is already looking.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** What a social post can be, in the words a producer uses. */
export const FORMATS = [
  { id: "result-card", label: "Result", shape: "square", why: "The best card for the place: a map for a state or an LGA, the candidates for the country, bars for a ward or a polling unit." },
  { id: "faces", label: "Candidates", shape: "square", why: "A column per candidate, with their face, their party's colour and their votes." },
  { id: "map", label: "Map", shape: "square", why: "Each LGA — or each state — in the colour of whoever leads it, with the figure on it." },
  { id: "bars", label: "Bar chart", shape: "square", why: "Every party's votes as bars, with the totals underneath." },
  { id: "turnout", label: "Turnout", shape: "square", why: "Votes cast against the register, on the 360 dial." },
  { id: "breaking-card", label: "Breaking", shape: "square", why: "One line, red, for something that has just happened." },
  { id: "situation", label: "Situation update", shape: "square", why: "What is happening on the ground, and where." },
  { id: "incident", label: "Incident alert", shape: "square", why: "A report exists. Worded as a report, not a finding." },
  { id: "quote", label: "Quote", shape: "square", why: "Somebody said something. Attributed." },
];

/* The formats whose card is their words rather than a chart. The renderer
   keeps the same list — see lib/graphic.jsx. */
const TEXT_LED = new Set(["breaking-card", "incident", "quote", "situation"]);

/* ────────────────────────────────────────────────────────── the channels ── */

/**
 * Which platforms this desk can reach tonight, and whether they answer.
 *
 * ── "SET UP" AND "CONNECTED" ARE DIFFERENT WORDS ON PURPOSE ────────────────
 * Set up is read from the deployment's settings: the credentials are there.
 * Connected is only ever shown after pressing Check, which asks each platform
 * who we are without posting anything — the difference between a token that
 * exists and one that works, which is the thing to find out at six in the
 * evening rather than at the first result.
 */
export function Channels() {
  const { channels, may } = useDesk();
  const { pending, said, run } = useAction();
  const [checked, setChecked] = useState(null);

  const direct = channels.filter((row) => row.id !== "relay");
  const relay = channels.find((row) => row.id === "relay");
  const result = (id) => checked?.channels.find((row) => row.id === id)?.check ?? null;

  return (
    <Card
      title="Where posts go"
      subtitle={
        checked
          ? `Checked at ${new Date(checked.checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
          : "Press check to ask each platform if it is answering"
      }
      action={
        may.draft ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => checkChannels(), { onDone: (answer) => setChecked(answer) })}
            className="inline-flex h-8 items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 text-[0.6875rem] font-bold tracking-[0.06em] text-dash-ink uppercase hover:border-dash-ink disabled:opacity-40"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} strokeWidth={2.5} />}
            Check
          </button>
        ) : null
      }
    >
      <ul className="space-y-2">
        {direct.map((row) => (
          <ChannelRow key={row.id} row={row} check={result(row.id)} />
        ))}
      </ul>

      {relay && (
        <div className="mt-3 border-t border-dash-line pt-3">
          <ChannelRow row={{ ...relay, label: "Everywhere else (relay)" }} check={result("relay")} />
          <p className="mt-2 text-[0.75rem] leading-snug text-dash-muted">
            WhatsApp, LinkedIn, TikTok and YouTube are reached through your own automation tool.
          </p>
        </div>
      )}

      <Said said={said} />
    </Card>
  );
}

function ChannelRow({ row, check }) {
  const state = check
    ? check.ok === true
      ? { icon: CheckCircle2, tone: "good", text: `Connected · ${check.account}` }
      : check.ok === null
        ? { icon: CircleDashed, tone: "neutral", text: check.account }
        : { icon: CircleAlert, tone: "alert", text: check.error }
    : row.configured
      ? { icon: CircleDashed, tone: "neutral", text: row.warning ?? "Set up. Not checked yet." }
      : { icon: CircleAlert, tone: "warn", text: "Not set up" };
  const Icon = state.icon;

  return (
    <li className="flex items-start gap-2.5">
      <Icon
        size={17}
        strokeWidth={2.25}
        className={cn(
          "mt-0.5 shrink-0",
          state.tone === "good" && "text-emerald-600",
          state.tone === "alert" && "text-red-600",
          state.tone === "warn" && "text-amber-600",
          state.tone === "neutral" && "text-dash-muted"
        )}
      />
      <div className="min-w-0">
        <p className="text-[0.875rem] font-bold text-dash-ink">{row.label}</p>
        <p className="text-[0.75rem] leading-snug text-dash-muted">{state.text}</p>
        {!row.configured && row.missing?.length > 0 && (
          <p className="mt-0.5 text-[0.6875rem] leading-snug text-dash-muted">
            Your administrator adds: <span className="font-mono">{row.missing.join(", ")}</span>
          </p>
        )}
      </div>
    </li>
  );
}

/* ────────────────────────────────────────────────────────── the composer ── */

/**
 * Write one post for every platform.
 *
 * Shared by the studio and the live desk, so there is one way to write a post
 * and the stamp, the figures and the send-on-clear choice cannot be present
 * on one screen and missing on the other.
 *
 * @param preset  prefill — { format, scope, headline, body } — from the live
 *                desk's "write this up" on a field event
 */
export function PostComposer({ race, national, places, preset = null, onSent, compact = false }) {
  const { may, channels } = useDesk();
  const { pending, said, run, setSaid } = useAction();

  /* Aimed, by default, at everything that can actually be reached tonight:
     every direct platform that is set up, and — when the relay is — the
     platforms only it can reach. Nothing set up at all, and it starts on the
     two a results night uses most so the choice is visible, not empty. */
  const reachable = useMemo(() => {
    const direct = channels.filter((row) => row.id !== "relay" && row.configured).map((row) => row.id);
    const relayed = channels.find((row) => row.id === "relay")?.configured
      ? PLATFORMS.filter((row) => row.route === "relay").map((row) => row.id)
      : [];
    const all = [...direct, ...relayed];
    return all.length ? all : ["facebook", "x"];
  }, [channels]);

  const [format, setFormat] = useState(preset?.format ?? FORMATS[0].id);
  const [scope, setScope] = useState(preset?.scope ?? "NATION");
  const [headline, setHeadline] = useState(preset?.headline ?? "");
  const [caption, setCaption] = useState(preset?.body ?? "");
  const [platforms, setPlatforms] = useState(() => new Set(reachable));
  const [shape, setShape] = useState(null);
  const [sendOnClear, setSendOnClear] = useState(true);
  const [look, setLook] = useState("x");
  /* Read once. The server sets the real stamp when the post is saved; this
     is the preview's idea of "about now". */
  const [at] = useState(() => Date.now());

  const picked = FORMATS.find((row) => row.id === format) ?? FORMATS[0];
  const chosenShape = shape ?? picked.shape;
  const place = places.find((row) => row.scope === scope);
  /* Only the country and the states are in the room's own figures; below that
     the caption preview carries no figures rather than the wrong ones. */
  const figures = scope === "NATION" ? national : place ?? null;
  const frozen = useMemo(() => freezeFigures(figures), [figures]);
  const stamp = useMemo(() => stampFor({ scope, at }), [scope, at]);
  const textLed = TEXT_LED.has(format);

  /* The preview address, deferred so typing does not ask the server for a
     new picture on every keystroke. */
  const previewNow = `/api/graphic/preview?${new URLSearchParams({
    scope,
    format,
    shape: chosenShape,
    headline: headline.trim(),
    body: textLed ? caption.trim() : "",
    ...(race ? { race } : {}),
  })}`;
  const preview = useDeferredValue(previewNow);
  /* The figures behind the caption preview: the state or the country from
     the room, where the place is one of those. */
  const filedByState = useMemo(
    () => Object.fromEntries(places.map((row) => [row.number, row.filed])),
    [places]
  );

  const toggle = (id) =>
    setPlatforms((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* The caption the figures would write, carrying the two things a post
     about a parallel count must say: how much is in, and whose count it is.
     (The stamp and the basis line are added to every caption anyway.) */
  const suggested = figures?.parties?.length
    ? `${figures.name}: ${figures.parties
        .slice(0, 3)
        .map((party) => `${party.id} ${Math.round(party.share * 10) / 10}%`)
        .join(", ")}.`
    : "";

  const captionPreview = captionFor({
    platform: look,
    body: caption,
    figures: frozen,
    stamp,
    link: "https://…/live/…",
  });

  const title =
    headline.trim() ||
    (textLed ? caption.trim().split(/[.!?\n]/)[0].slice(0, 90) : null) ||
    `${picked.label}: ${place?.name ?? (scope === "NATION" ? "Nationwide" : stamp.place.name)}`;

  const submit = (review) =>
    run(
      async () => {
        const drafted = await draftItem({
          kind: "SOCIAL",
          title,
          body: caption.trim(),
          race,
          scope,
          platforms: [...platforms],
          payload: {
            format,
            shape: chosenShape,
            headline: headline.trim() || null,
            sendOnClear,
          },
        });
        if (drafted?.error || !review) return drafted;
        const moved = await moveItem({ id: drafted.id, to: "REVIEW" });
        return moved?.error ? moved : { ok: true };
      },
      {
        onDone: () => {
          setCaption("");
          setHeadline("");
          setSaid({
            tone: "good",
            text: review
              ? sendOnClear
                ? `With an editor. It publishes to ${platforms.size} platform${platforms.size === 1 ? "" : "s"} the moment they clear it.`
                : "With an editor. Once cleared, it waits for somebody to press Publish."
              : "Saved as a draft.",
          });
          onSent?.();
        },
      }
    );

  if (!may.draft) {
    return <Empty>This account can read the desk and not write to it.</Empty>;
  }

  return (
    <div className={cn("grid gap-4", !compact && "xl:grid-cols-[1fr_22rem]")}>
      <div>
        {/* ─────────────────────────────────────────────── what kind */}
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of post">
          {FORMATS.map((row) => (
            <button
              key={row.id}
              type="button"
              role="radio"
              aria-checked={format === row.id}
              title={row.why}
              onClick={() => setFormat(row.id)}
              className={cn(
                "h-9 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors",
                format === row.id
                  ? "border-dash-ink bg-dash-ink text-white"
                  : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
              )}
            >
              {row.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.75rem] text-dash-muted">{picked.why}</p>

        {/* ─────────────────────────────────────────────────── where */}
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_16rem]">
          <PlacePicker value={scope} onChange={setScope} filedByState={filedByState} />
          <label className="block">
            <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
              Headline <span className="font-normal normal-case tracking-normal">(optional)</span>
            </span>
            <input
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              maxLength={120}
              placeholder={textLed ? "Taken from the first line" : "The place's name"}
              className="mt-1.5 h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] text-dash-ink"
            />
          </label>
        </div>

        {/* The stamp, shown before it is written, because it is part of what
            the editor is going to be asked to clear. */}
        <p className="mt-2 text-[0.75rem] font-semibold text-dash-muted">
          <span className="text-red-600">📍 {stamp.place.name}</span>
          <span className="figure ml-2 font-normal">{stamp.coords}</span>
          <span className="ml-3">🕒 stamped when saved</span>
        </p>

        {/* ─────────────────────────────────────────────── the words */}
        <label className="mt-3 block">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
              {textLed ? "What happened" : "Caption"}
            </span>
            {suggested && !textLed && (
              <button type="button" onClick={() => setCaption(suggested)} className="text-[0.75rem] font-semibold text-dash-ink hover:underline">
                Write it from the figures
              </button>
            )}
          </span>
          <textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            rows={compact ? 3 : 4}
            placeholder={
              textLed
                ? "Voting has been suspended at three polling units in Ward 4 after ballot boxes were seized. Security agencies are on the way."
                : suggested || "What this post says."
            }
            className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] leading-relaxed text-dash-ink focus:border-dash-ink focus:outline-none"
          />
        </label>

        {/* ────────────────────────────────────────────── the platforms */}
        <fieldset className="mt-3">
          <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">Publish to</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PLATFORMS.map((row) => {
              const on = platforms.has(row.id);
              const ready = reachable.includes(row.id);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => toggle(row.id)}
                  aria-pressed={on}
                  title={ready ? "Set up" : row.route === "relay" ? "Needs the relay, or a person" : "Not set up yet"}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors",
                    on ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-1.5 rounded-full", ready ? "bg-emerald-500" : "bg-amber-500")}
                  />
                  {row.label}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-3 text-[0.6875rem] text-dash-muted">
            <button type="button" onClick={() => setPlatforms(new Set(PLATFORMS.map((row) => row.id)))} className="font-semibold hover:text-dash-ink">
              All
            </button>
            <button type="button" onClick={() => setPlatforms(new Set(reachable))} className="font-semibold hover:text-dash-ink">
              Only what is set up
            </button>
          </div>
        </fieldset>

        <label className="mt-3 flex items-start gap-2.5 rounded-dash-sm border border-dash-line bg-dash-bg px-3 py-2.5">
          <input
            type="checkbox"
            checked={sendOnClear}
            onChange={(event) => setSendOnClear(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--color-dash-ink)]"
          />
          <span className="text-[0.8125rem] leading-snug text-dash-ink">
            <span className="font-bold">Publish the moment an editor clears it.</span>{" "}
            <span className="text-dash-muted">
              Otherwise it waits, cleared, for somebody to press Publish.
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || !(caption.trim() || headline.trim()) || platforms.size === 0}
            onClick={() => submit(true)}
            className="inline-flex h-10 items-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black disabled:opacity-40"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.5} />}
            Send to an editor
          </button>
          <button
            type="button"
            disabled={pending || !(caption.trim() || headline.trim()) || platforms.size === 0}
            onClick={() => submit(false)}
            className="inline-flex h-10 items-center gap-2 rounded-dash-sm border border-dash-line px-4 text-[0.75rem] font-bold tracking-[0.08em] text-dash-ink uppercase hover:border-dash-ink disabled:opacity-40"
          >
            Save as draft
          </button>
        </div>
        <Said said={said} />
      </div>

      {/* ───────────────────────────────────────────────────── the preview */}
      <div className="space-y-3">
        {/* ── THE FILE ITSELF ──────────────────────────────────────────
            Drawn by the server with the builder and renderer the saved post
            will use, so this is not a likeness of the card: it is the card. */}
        <CardPreview src={preview} updating={preview !== previewNow} />
        <div className="flex flex-wrap justify-center gap-1.5">
          {SHAPES.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setShape(row.id)}
              aria-pressed={chosenShape === row.id}
              title={row.why}
              className={cn(
                "h-8 rounded-full border px-3 text-[0.75rem] font-semibold transition-colors",
                chosenShape === row.id ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
              )}
            >
              {row.label}
            </button>
          ))}
        </div>

        {/* What the caption becomes on each platform, cut to fit. */}
        <div className="rounded-dash-sm border border-dash-line bg-dash-card">
          <div className="flex flex-wrap gap-1 border-b border-dash-line p-1.5">
            {PLATFORMS.filter((row) => platforms.has(row.id)).map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setLook(row.id)}
                className={cn(
                  "rounded-dash-sm px-2 py-1 text-[0.6875rem] font-bold",
                  look === row.id ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink"
                )}
              >
                {row.label}
              </button>
            ))}
          </div>
          <p className="p-3 text-[0.75rem] leading-relaxed whitespace-pre-line text-dash-ink">{captionPreview}</p>
          <p className="border-t border-dash-line px-3 py-1.5 text-right text-[0.6875rem] text-dash-muted">
            {measure(captionPreview, look)} / {CAPTION_LIMITS[look] ?? "—"} characters on {platformLabel(look)}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────── social analytics ─── */

/**
 * Measuring what went out.
 *
 * Two things this desk can measure itself and no platform can tell it: how
 * the night's work moved through the desk, and what each platform did when it
 * was sent something. Reach and engagement are held by the platforms and need
 * a further permission to read back, so they are not drawn — and not drawn as
 * zero, which would teach a desk to distrust the real figures beside them.
 */
export function Delivery({ items }) {
  const { deliveries } = useDesk();
  const posts = items.filter((item) => item.kind === "SOCIAL");
  /* Posts that are out and did not reach somewhere they were aimed: the
     only list on this screen somebody has to act on, so it comes first. */
  const failing = posts.filter(
    (post) => post.state === "ON_AIR" && Object.values(deliveries[post.id] ?? {}).some((row) => row.status === "FAILED")
  );

  const cleared = posts.filter((row) => row.clearedAt && row.state !== "REJECTED");
  const published = posts.filter((row) => row.airedAt);

  /* Median, not mean: one post left in the queue over a two-hour programme
     drags an average into meaninglessness. */
  const median = (values) => {
    const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const toClear = median(cleared.map((row) => (new Date(row.clearedAt) - new Date(row.createdAt)) / 60000));
  const toAir = median(published.map((row) => (new Date(row.airedAt) - new Date(row.createdAt)) / 60000));

  /* Per platform: what was attempted, and what the platform took. */
  const perPlatform = PLATFORMS.map((platform) => {
    const rows = posts.map((post) => deliveries[post.id]?.[platform.id]).filter(Boolean);
    return {
      ...platform,
      tried: rows.length,
      out: rows.filter((row) => row.status === "SENT" || row.status === "RELAYED").length,
      failed: rows.filter((row) => row.status === "FAILED").length,
      waiting: rows.filter((row) => row.status === "NOT_CONNECTED" || row.status === "BY_HAND").length,
    };
  }).filter((row) => row.tried > 0);

  const minutes = (value) => (value === null ? "—" : `${Math.round(value)} min`);

  return (
    <div className="space-y-4">
      {failing.length > 0 && (
        <Card title="Did not reach every platform" subtitle="The reason is on each post. Send again once it is fixed.">
          <div className="grid gap-2.5 lg:grid-cols-2">
            {failing.map((item) => (
              <ItemCard key={item.id} item={item} compact />
            ))}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-dash border border-dash-line bg-dash-card px-5 py-4">
        <Ring
          value={posts.length ? (published.length / posts.length) * 100 : null}
          label={"Written\nthat went out"}
          tone="green"
          figure={`${formatNumber(published.length)}/${formatNumber(posts.length)}`}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="inline-flex items-baseline gap-2">
            <span className="figure text-[1.125rem] font-extrabold text-dash-ink">{minutes(toClear)}</span>
            <span className="text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">to clear</span>
          </span>
          <span className="inline-flex items-baseline gap-2">
            <span className="figure text-[1.125rem] font-extrabold text-dash-ink">{minutes(toAir)}</span>
            <span className="text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">written to out</span>
          </span>
        </div>
      </div>

      <Card title="What each platform did" subtitle="From the platforms' own answers">
        {perPlatform.length === 0 ? (
          <Empty>Nothing has been sent to a platform yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {perPlatform.map((row) => (
              <li key={row.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[0.8125rem] font-bold text-dash-ink">{row.label}</span>
                <Bar
                  className="flex-1"
                  height={14}
                  parts={[
                    { label: "posted", value: row.out, tone: "green" },
                    { label: "failed", value: row.failed, tone: "red" },
                    { label: "not sent", value: row.waiting, tone: "orange" },
                  ]}
                />
                <span className="figure w-12 shrink-0 text-right text-[0.9375rem] font-extrabold text-dash-ink">
                  {formatNumber(row.out)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-dash-line pt-3 text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#1E9E5A]" /> posted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#E4202E]" /> failed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#F28A25]" /> not sent
          </span>
        </p>
      </Card>

      <Card title="By kind of post">
        <ByFormat posts={posts} />
      </Card>
    </div>
  );
}

function ByFormat({ posts }) {
  const byFormat = new Map();
  for (const post of posts) {
    const key = post.payload?.format ?? "unspecified";
    byFormat.set(key, (byFormat.get(key) ?? 0) + 1);
  }
  if (byFormat.size === 0) return <Empty>Nothing has been written for social tonight.</Empty>;
  return (
    <ul className="space-y-2">
      {[...byFormat.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([format, count]) => (
          <li key={format} className="flex items-baseline justify-between gap-3">
            <span className="text-[0.875rem] text-dash-ink">
              {FORMATS.find((row) => row.id === format)?.label ?? "Other"}
            </span>
            <span className="figure text-[0.9375rem] font-bold text-dash-ink">{formatNumber(count)}</span>
          </li>
        ))}
    </ul>
  );
}


/**
 * The card, drawn by the server, with an answer when it cannot be.
 *
 * ── A BROKEN PICTURE EXPLAINS NOTHING ──────────────────────────────────────
 * The renderer refuses an account that may not write for the desk, and a
 * browser draws that refusal as an empty box with a torn-page icon — which
 * says "this product is broken" rather than "your account cannot do this".
 * So the failure is caught and written out, with the one thing that fixes it.
 */
function CardPreview({ src, updating }) {
  const [broken, setBroken] = useState(false);

  return (
    <div className="relative mx-auto w-full max-w-80 overflow-hidden rounded-dash-sm border border-dash-line bg-[#F5EEDC]">
      {broken ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 p-5 text-center">
          <p className="text-[0.875rem] font-bold text-dash-ink">The card could not be drawn.</p>
          <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
            Either this account is not allowed to make cards, or the figures for this place could not
            be read. An administrator can check the account on Users and roles.
          </p>
          <button
            type="button"
            onClick={() => setBroken(false)}
            className="mt-1 inline-flex h-9 items-center rounded-dash-sm border border-dash-line px-3 text-[0.75rem] font-bold text-dash-ink hover:border-dash-ink"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {/* No `key`: replacing the element blanks the box while the next
              picture is drawn, and a preview that flashes empty on every
              keystroke reads as broken. Swapping the address keeps the last
              card on screen until the new one has loaded. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- our own authenticated renderer */}
          <img
            src={src}
            alt="The card as it will be sent"
            className="block w-full"
            onError={() => setBroken(true)}
          />
          {updating && (
            <span className="absolute top-2 right-2 rounded-full bg-dash-ink px-2 py-0.5 text-[0.625rem] font-bold text-white">
              Updating…
            </span>
          )}
        </>
      )}
    </div>
  );
}
