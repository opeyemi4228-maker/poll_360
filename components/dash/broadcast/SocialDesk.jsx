"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import AutoPublish from "./AutoPublish";
import PostCard from "./PostCard";
import { Queue, Said, useAction, useDesk } from "./Queue";
import { draftItem } from "@/app/broadcast/actions";
import { PLATFORMS, SHAPES } from "@/lib/broadcast";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The social desk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS PRODUCT MAKES THE POST. A PERSON SENDS IT.
 *
 *  Every screen here stops one step short of publishing, and the step it stops
 *  short of is deliberate rather than unfinished. Posting to Facebook, X,
 *  Instagram or TikTok needs an app, an OAuth grant and a stored token per
 *  account, and a desk that hands those tokens to software is handing it the
 *  ability to publish an election result in the organisation's name with
 *  nobody watching. On a night when a wrong figure is unrecoverable, that is
 *  not a feature worth having.
 *
 *  So the desk composes, adapts and clears, and then hands over a file and a
 *  caption. The person who presses send is the editorial control, and it stays
 *  where it is. Everything below is honest about which half is which: no
 *  screen shows a connection status it cannot verify, and no screen reports a
 *  post as sent.
 *
 *  ── WHAT IS THEREFORE MISSING, AND WHY THAT IS SAID OUT LOUD ────────────
 *  Reach, impressions, engagement and follower counts all come back from a
 *  platform's own API, through the same grant. Without it there are no
 *  numbers, and a dashboard drawing zeroes where it means "unknown" is worse
 *  than one that says so.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** What a social post can be, in the words a producer uses. */
const FORMATS = [
  { id: "result-card", label: "Result card", shape: "square", why: "The count, as it stands, with its coverage." },
  { id: "breaking-card", label: "Breaking card", shape: "square", why: "One line, red, for something that has just happened." },
  { id: "map", label: "Map", shape: "wide", why: "The country or one state, in one of six modes." },
  { id: "infographic", label: "Infographic", shape: "square", why: "A figure and what it means." },
  { id: "short-video", label: "Short video", shape: "story", why: "Vertical. Reels, Shorts, TikTok." },
  { id: "comparison", label: "Candidate comparison", shape: "wide", why: "Two or more, side by side." },
  { id: "turnout", label: "Turnout", shape: "square", why: "Votes cast against the register." },
  { id: "statistic", label: "Statistical graphic", shape: "wide", why: "A trend, with its denominator." },
  { id: "quote", label: "Quote", shape: "square", why: "Somebody said something. Attributed." },
  { id: "incident", label: "Incident alert", shape: "square", why: "A report exists. Worded as a report." },
];

/* ───────────────────────────────────────────────── social command centre ── */

export function SocialCommand({ items, onGo }) {
  const posts = items.filter((item) => item.kind === "SOCIAL");

  const buckets = [
    { id: "DRAFT", label: "Draft", rows: posts.filter((row) => row.state === "DRAFT") },
    { id: "REVIEW", label: "Pending approval", rows: posts.filter((row) => row.state === "REVIEW") },
    { id: "CLEARED", label: "Cleared, not sent", rows: posts.filter((row) => row.state === "CLEARED") },
    { id: "ON_AIR", label: "Handed over", rows: posts.filter((row) => row.state === "ON_AIR") },
    { id: "REJECTED", label: "Refused", rows: posts.filter((row) => row.state === "REJECTED") },
  ];

  /* How much of the queue is aimed at each platform. This is a real number —
     it is what the desk intends — and it is carefully not called "published". */
  const byPlatform = Object.fromEntries(PLATFORMS.map((row) => [row.id, 0]));
  for (const post of posts) for (const id of post.platforms ?? []) if (id in byPlatform) byPlatform[id] += 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {buckets.map((bucket) => (
          <div key={bucket.id} className="rounded-dash border border-dash-line bg-dash-card px-4 py-3.5">
            <p className="text-[0.625rem] font-bold tracking-[0.12em] text-dash-muted uppercase">
              {bucket.label}
            </p>
            <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold text-dash-ink">
              {formatNumber(bucket.rows.length)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <Card
          title="The queue"
          subtitle="Everything this desk has written for a platform tonight"
          action={
            <button
              type="button"
              onClick={() => onGo("content")}
              className="text-[0.75rem] font-bold tracking-[0.06em] text-dash-muted uppercase hover:text-dash-ink"
            >
              Compose
            </button>
          }
        >
          <Queue items={posts} empty="Nothing has been written for social tonight." />
        </Card>

        <div className="space-y-4">
          {/* ── THE DISPATCH SWITCH ──────────────────────────────────────
              First in this column, above the platform table it governs: the
              table describes what each platform can carry, and this decides
              whether anything goes to it without a person. A control placed
              below the thing it controls is a control people find last. */}
          <AutoPublish cleared={buckets.find((row) => row.id === "CLEARED")?.rows.length ?? 0} />

          {/* ── THE PLATFORMS, HONESTLY ─────────────────────────────────── */}
          <Card title="Platforms" subtitle="What each can carry, and what it would take">
            <ul className="space-y-2.5">
              {PLATFORMS.map((row) => (
                <li key={row.id} className="border-l-2 border-dash-line pl-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.875rem] font-bold text-dash-ink">{row.label}</span>
                    <Badge>not connected</Badge>
                    {byPlatform[row.id] > 0 && (
                      <span className="text-[0.75rem] text-dash-muted">
                        {byPlatform[row.id]} queued
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-dash-muted">{row.carries}</p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-dash-muted">{row.needs}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
              Every one of these says &ldquo;not connected&rdquo; from one fact rather than from a
              status light nobody can verify. This repository holds no publishing token for any
              platform, so nothing here can report a post as sent — which is the failure a
              connected-looking dashboard produces on the one night it matters.
            </p>
          </Card>

          <Card title="Reach, engagement and views">
            <p className="text-[0.875rem] leading-relaxed text-dash-muted">
              Not drawn. Every one of those figures comes back from a platform&rsquo;s own API
              through the same grant that would let this product post, and there is none. A
              dashboard showing zero where it means &ldquo;we do not know&rdquo; teaches a desk to
              distrust every other figure on it, including the ones that are real.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────── content studio ──── */

export function ContentStudio({ items, race, national, places }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();

  const [format, setFormat] = useState(FORMATS[0].id);
  const [scope, setScope] = useState("NATION");
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState(() => new Set(["facebook", "x"]));
  /* The format proposes a shape; the producer can override it, because one
     post genuinely goes out square to a feed and wide to a timeline. */
  const [shape, setShape] = useState(null);
  /* Read once in a lazy initialiser. A card that stamps itself with the clock
     during render claims to be current every time React happens to redraw it. */
  const [stamp] = useState(() => Date.now());

  const picked = FORMATS.find((row) => row.id === format) ?? FORMATS[0];
  /* The override wins where there is one, otherwise the format's own shape. */
  const chosen = { ...picked, shape: shape ?? picked.shape };
  const place = places.find((row) => row.scope === scope);
  const figures = place ?? national;

  const toggle = (id) =>
    setPlatforms((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ── THE CAPTION THE DESK WOULD OTHERWISE FORGET TO WRITE ──────────────
     Offered rather than imposed, and it carries the two things a post about a
     parallel count must say: how much is in, and whose count it is. */
  const suggested = figures
    ? `${figures.name}: ${figures.parties[0]?.id ?? "no leader yet"}${
        figures.parties[0] ? ` ${Math.round(figures.parties[0].share)}%` : ""
      } on ${formatNumber(figures.filed)} returns${
        figures.reporting === null ? "" : `, ${Math.round(figures.reporting)}% of booths in`
      }. Poll360 parallel count, not a declaration.`
    : "";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
      <Card title="Compose" subtitle="One post, adapted per platform on the next screen">
        {!may.draft ? (
          <Empty>This account can read the social desk and not write to it.</Empty>
        ) : (
          <>
            <fieldset>
              <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                Format
              </legend>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {FORMATS.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setFormat(row.id)}
                    aria-pressed={format === row.id}
                    className={cn(
                      "rounded-dash-sm border px-3 py-2 text-left transition-colors",
                      format === row.id
                        ? "border-dash-ink bg-dash-bg"
                        : "border-dash-line hover:border-dash-ink"
                    )}
                  >
                    <span className="block text-[0.8125rem] font-semibold text-dash-ink">
                      {row.label}
                    </span>
                    <span className="block text-[0.75rem] leading-snug text-dash-muted">
                      {row.why}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                About where
              </span>
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] text-dash-ink"
              >
                <option value="NATION">Everywhere this desk may read</option>
                {places.map((row) => (
                  <option key={row.scope} value={row.scope}>
                    {row.name} · {row.filed} filed
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                  Caption
                </span>
                {suggested && (
                  <button
                    type="button"
                    onClick={() => setCaption(suggested)}
                    className="text-[0.75rem] font-semibold text-dash-ink hover:underline"
                  >
                    Use the one from the figures
                  </button>
                )}
              </span>
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                rows={4}
                placeholder={suggested || "What this post says."}
                className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] leading-relaxed text-dash-ink focus:border-dash-ink focus:outline-none"
              />
            </label>

            <fieldset className="mt-4">
              <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                For which platforms
              </legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLATFORMS.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => toggle(row.id)}
                    aria-pressed={platforms.has(row.id)}
                    className={cn(
                      "h-9 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors",
                      platforms.has(row.id)
                        ? "border-dash-ink bg-dash-ink text-white"
                        : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                    )}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              disabled={pending || !caption.trim() || platforms.size === 0}
              onClick={() =>
                run(
                  () =>
                    draftItem({
                      kind: "SOCIAL",
                      title: `${chosen.label} — ${place?.name ?? "everywhere"}`,
                      body: caption.trim(),
                      race,
                      scope,
                      platforms: [...platforms],
                      payload: { format: chosen.id, shape: chosen.shape },
                    }),
                  {
                    onDone: () => {
                      setCaption("");
                      setSaid({
                        tone: "good",
                        text: "Drafted. It is cleared like everything else, and then a person posts it.",
                      });
                    },
                  }
                )
              }
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black disabled:opacity-40"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} strokeWidth={2.5} />}
              Save as draft
            </button>
            <Said said={said} />
          </>
        )}
      </Card>

      {/* ── THE PREVIEW ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Card
          title="The post"
          subtitle={`${chosen.label} · ${SHAPES.find((row) => row.id === chosen.shape)?.size}`}
        >
          {/* ── WHAT YOU CLEAR IS WHAT YOU SEND ────────────────────────────
              This was a black rectangle captioned "a sketch of the layout,
              not the file". A producer cannot clear a sketch: the whole job
              of this desk is catching the card where the coverage figure fell
              off the bottom or the party colour is wrong, and neither of those
              is visible in a sketch. It draws the real thing now, from the
              same figures the renderer uses. */}
          <PostCard
            figures={figures}
            shape={chosen.shape}
            format={chosen.id}
            at={stamp}
            className="mx-auto w-full max-w-72"
          />

          {/* The shape is a property of the platform, not of the post, so it
              can be checked here rather than discovered after export. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SHAPES.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setShape(row.id)}
                aria-pressed={shape === row.id}
                title={row.why}
                className={cn(
                  "h-8 rounded-full border px-3 text-[0.75rem] font-semibold transition-colors",
                  shape === row.id
                    ? "border-dash-ink bg-dash-ink text-white"
                    : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                )}
              >
                {row.label}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[0.75rem] leading-relaxed text-dash-muted">
            Drawn from the same figures the export uses, at the moment this screen was opened.
            The rendered file comes from the graphics bench.
          </p>
        </Card>

        <Card title="What goes out with it, always">
          <ul className="space-y-2 text-[0.8125rem] leading-relaxed text-dash-muted">
            <li className="border-l-2 border-dash-line pl-3">
              <span className="font-bold text-dash-ink">The coverage.</span> A share with no
              denominator beside it is a different claim from the one the count supports.
            </li>
            <li className="border-l-2 border-dash-line pl-3">
              <span className="font-bold text-dash-ink">Whose count it is.</span> A parallel count
              is a second source. It is never posted as a declaration.
            </li>
            <li className="border-l-2 border-dash-line pl-3">
              <span className="font-bold text-dash-ink">The time.</span> A post with no stamp
              outlives the figure in it.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────── multi-platform publishing ── */

/**
 * One cleared thing, made into the several shapes the platforms need.
 *
 * ── THE ADAPTATION IS REAL; THE DELIVERY IS A PERSON ───────────────────────
 * Dimensions, caption length and format genuinely differ per platform, and
 * getting them wrong is how a result card goes out with the coverage figure
 * cropped off the bottom. That part is arithmetic and this screen does it.
 * The last step is a download and a person, for the reason at the top of this
 * file.
 */
export function MultiPlatform({ items, race }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();
  const [source, setSource] = useState(null);
  /* The graphic is stamped with the moment it was asked for, so a download
     is a fresh render rather than whatever the browser cached. Read once in
     a lazy initialiser: a clock read during render is a value that changes
     every time the component happens to re-draw. */
  const [stamp] = useState(() => Date.now());

  /* Anything cleared is adaptable: a result graphic, a map, a breaking strap.
     Drafts are not offered, because adapting something nobody has passed is
     four more items nobody has passed. */
  const ready = items.filter(
    (item) =>
      (item.state === "CLEARED" || item.state === "ON_AIR") &&
      ["GRAPHIC", "MAP", "FULLSCREEN", "BANNER", "SOCIAL"].includes(item.kind)
  );

  const chosen = ready.find((item) => item.id === source) ?? ready[0] ?? null;

  const adaptations = chosen
    ? PLATFORMS.map((platform) => ({
        platform,
        shape: SHAPES.find((row) => row.id === platform.shape),
        caption: trimFor(platform.id, chosen.body ?? chosen.title),
      }))
    : [];

  return (
    <div className="space-y-4">
      <Card title="Take one cleared item to every platform" subtitle="Dimensions and captions adapt; the sending does not">
        {ready.length === 0 ? (
          <Empty>
            Nothing is cleared. Only items an editor has passed can be adapted — adapting a draft
            just makes seven drafts.
          </Empty>
        ) : (
          <>
            <label className="block">
              <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                Which item
              </span>
              <select
                value={chosen?.id ?? ""}
                onChange={(event) => setSource(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] text-dash-ink"
              >
                {ready.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            {chosen && (
              <>
                {/* ── THE FAN-OUT, DRAWN ────────────────────────────────── */}
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {adaptations.map((row) => (
                    <li
                      key={row.platform.id}
                      className="rounded-dash-sm border border-dash-line px-3.5 py-3"
                    >
                      <p className="flex items-center justify-between gap-2">
                        <span className="text-[0.875rem] font-bold text-dash-ink">
                          {row.platform.label}
                        </span>
                        <span className="text-[0.6875rem] tracking-[0.06em] text-dash-muted uppercase">
                          {row.shape?.size}
                        </span>
                      </p>
                      <p className="mt-1.5 text-[0.8125rem] leading-snug text-dash-muted">
                        {row.caption}
                      </p>
                      <p className="mt-1.5 text-[0.6875rem] text-dash-muted">{row.platform.carries}</p>
                    </li>
                  ))}
                </ul>

                {may.draft && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dash-line pt-4">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          async () => {
                            for (const row of adaptations) {
                              const answer = await draftItem({
                                kind: "SOCIAL",
                                title: `${chosen.title} — ${row.platform.label}`,
                                body: row.caption,
                                race,
                                scope: chosen.scope,
                                platforms: [row.platform.id],
                                payload: {
                                  from: chosen.id,
                                  shape: row.platform.shape,
                                  adapted: true,
                                },
                              });
                              if (answer?.error) return answer;
                            }
                            return { ok: true };
                          },
                          {
                            onDone: () =>
                              setSaid({
                                tone: "good",
                                text: `${adaptations.length} posts drafted, one per platform. Each is cleared separately.`,
                              }),
                          }
                        )
                      }
                      className="inline-flex h-10 items-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black disabled:opacity-40"
                    >
                      {pending ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} strokeWidth={2.5} />}
                      Draft the set
                    </button>
                    <a
                      href={`/api/graphic?shape=wide&race=${encodeURIComponent(race ?? "")}&t=${stamp}`}
                      download
                      className="inline-flex h-10 items-center gap-2 rounded-dash-sm border border-dash-line px-4 text-[0.75rem] font-bold tracking-[0.08em] text-dash-ink uppercase hover:border-dash-ink"
                    >
                      <Download size={15} strokeWidth={2.5} />
                      Download the file
                    </a>
                  </div>
                )}
                <Said said={said} />
              </>
            )}
          </>
        )}
      </Card>

      <Card title="Adapted sets" subtitle="Posts produced from a cleared item">
        <Queue
          items={items.filter((item) => item.kind === "SOCIAL" && item.payload?.adapted)}
          empty="No adapted sets yet."
        />
      </Card>
    </div>
  );
}

/**
 * A caption cut to what a platform will actually show.
 *
 * The limits are the ones that bite in practice rather than the documented
 * maxima: what matters is where the text is truncated in a feed, because a
 * caption whose coverage figure falls after the fold is a caption without a
 * coverage figure.
 */
function trimFor(platform, text) {
  const body = String(text ?? "").trim();
  const limit = platform === "x" ? 240 : platform === "tiktok" ? 140 : platform === "instagram" ? 180 : 280;
  return body.length <= limit ? body : `${body.slice(0, limit - 1).trimEnd()}…`;
}

/* ───────────────────────────────────────────────────── social analytics ─── */

/**
 * Measuring what went out.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO HALVES, AND ONLY ONE OF THEM IS OURS TO MEASURE
 *
 *  Reach, impressions, views, likes, comments, shares, saves, watch time,
 *  completion and follower growth are all held by the platform and returned
 *  through its API. This product holds none of them, so none is drawn — see
 *  the note at the head of this file for why a zero standing in for "unknown"
 *  is the more damaging of the two options.
 *
 *  What this desk *can* measure, and what no platform can tell it, is its own
 *  output: how much was written, how much survived an editor, how long it took
 *  to clear, and what it was about. That is a real measure of a night's work
 *  and it is the half a newsroom usually cannot see at all, because it lives
 *  in six people's heads.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function SocialAnalytics({ items }) {
  const posts = items.filter((item) => item.kind === "SOCIAL");

  const cleared = posts.filter((row) => row.clearedAt && row.state !== "REJECTED");
  const refused = posts.filter((row) => row.state === "REJECTED");

  /* How long clearance took, in minutes, for the ones that got it. The median
     rather than the mean: one strap left in the queue over a two-hour
     programme drags an average into meaninglessness. */
  const waits = cleared
    .map((row) => (new Date(row.clearedAt) - new Date(row.createdAt)) / 60000)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : null;

  const byFormat = new Map();
  for (const post of posts) {
    const key = post.payload?.format ?? "unspecified";
    byFormat.set(key, (byFormat.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Written" value={formatNumber(posts.length)} />
        <Stat label="Cleared" value={formatNumber(cleared.length)} />
        <Stat label="Refused" value={formatNumber(refused.length)} />
        <Stat
          label="Median wait to clear"
          value={median === null ? "—" : `${Math.round(median)} min`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What was written about" subtitle="By format, which is the closest this desk has to a subject">
          {byFormat.size === 0 ? (
            <Empty>Nothing has been written for social tonight.</Empty>
          ) : (
            <ul className="space-y-2">
              {[...byFormat.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([format, count]) => (
                  <li key={format} className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.875rem] text-dash-ink">
                      {FORMATS.find((row) => row.id === format)?.label ?? "Not specified"}
                    </span>
                    <span className="figure text-[0.9375rem] font-bold text-dash-ink">
                      {formatNumber(count)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card title="Platform figures" subtitle="Reach, views, engagement, followers">
          <p className="text-[0.875rem] leading-relaxed text-dash-muted">
            Not drawn, and deliberately not drawn as zero. Every one of those numbers is returned
            by a platform through the grant that would also let this product post, and there is
            none — so a chart of them would be a chart of nothing, on the screen a newsroom uses
            to decide what worked.
          </p>
          <p className="mt-3 text-[0.875rem] leading-relaxed text-dash-muted">
            The figures above are measured from this desk&rsquo;s own queue and are real: they say
            how much was made, how much survived an editor, and how long the clearing took. On a
            long night the last of those is the one that actually changes how a desk works.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card px-4 py-3.5">
      <p className="text-[0.625rem] font-bold tracking-[0.12em] text-dash-muted uppercase">{label}</p>
      <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold text-dash-ink">{value}</p>
    </div>
  );
}
