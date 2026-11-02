/**
 * The technical desk's service checks, built from one set of measurements.
 *
 * Pure: the page draws them on first paint and the live feed rebuilds them
 * every few seconds from fresh measurements with this same function, so the
 * two can never disagree about what "failing" means.
 */
export const bytes = (value) => {
  const n = Number(value) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kB`;
  return `${n} B`;
};

export const since = (iso, now) => {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
};

/** The same, said in words: "4 minutes ago", "53 days ago", "never". */
export const ago = (iso, now) => {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const say = (n, word) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (seconds < 5) return "just now";
  if (seconds < 90) return say(seconds, "second");
  if (seconds < 5400) return say(Math.round(seconds / 60), "minute");
  if (seconds < 172800) return say(Math.round(seconds / 3600), "hour");
  return say(Math.round(seconds / 86400), "day");
};

const formatCount = (value) => (Number(value) || 0).toLocaleString("en-NG");

const first = (check) => (check?.ok ? (check.value?.[0] ?? {}) : {});

export function buildChecks(t, { second = null, hooks = { checked: false }, autoMigrate = false, now = Date.now() } = {}) {
  const db = first(t.size);
  const feed = first(t.events);
  const book = first(t.items);
  const refusals = first(t.audits);
  const outbox = first(t.outbox);
  const schema = first(t.migrations);
  const swept = first(t.sweep).updated_at;
  const sweptAgo = swept ? Math.round((now - new Date(swept).getTime()) / 1000) : null;
  const unlit = Math.max(0, Number(book.results ?? 0) - Number(book.lit ?? 0));
  const dbState = !t.ping.ok ? "bad" : t.ping.ms > 1500 ? "bad" : t.ping.ms > 400 ? "warn" : "ok";
  const waiting = Number(outbox.waiting ?? 0);

  const secondOff = !second || second.configured === false;

  /* `id` is what the code and the JSON call a check; `name` is what the
     screen calls it. Nobody on shift should have to read a table name. */
  return [
    { id: "postgres.round_trip", name: "Database speed", group: "Database", state: dbState, value: `${t.ping.ms} ms`, metric: t.ping.ms, detail: t.ping.ok ? `${db.connections ?? "?"} of ${db.max_connections ?? "?"} connections in use` : t.ping.error, means: "How long the database takes to answer one question. Over 400 ms is slow; over 1.5 seconds the screens will feel stuck." },
    { id: "postgres.size", name: "Database size", group: "Database", state: t.size.ok ? "ok" : "bad", value: t.size.ok ? bytes(db.bytes) : "No answer", metric: Number(db.bytes ?? 0) / 1e6, detail: t.size.ok ? String(db.version ?? "").split(" on ")[0] : t.size.error, means: "How much the database holds. Watch it against the plan's limit." },
    { id: "postgres.second", name: "Photograph store", group: "Database", state: secondOff ? "off" : second.reachable === false ? "bad" : "ok", value: secondOff ? "Not set up" : second.reachable === false ? "No answer" : second.latency != null ? `${second.latency} ms` : "Working", detail: secondOff ? "Not set up, so photographs stay in the main database." : (second.complaint ?? "Holds the photographs of result sheets."), means: "The second database, which takes photographs so the main one does not fill." },
    { id: "schema.migrations", name: "Database updates", group: "Database", state: t.migrations.ok ? "ok" : "bad", value: `${schema.n ?? 0} applied`, detail: `Last one applied ${ago(schema.last, now)}. Applying them automatically is ${autoMigrate ? "on" : "off"}.`, means: "The tables the screens expect. If one is missing after a release, every signed-in page fails." },
    { id: "room.events", name: "Updates to open screens", group: "Situation room", state: t.events.ok ? "ok" : "bad", value: `${feed.last_minute ?? 0} a minute`, metric: Number(feed.last_minute ?? 0), detail: `Last one ${ago(feed.last, now)}. ${formatCount(feed.seq)} sent in all, ${formatCount(feed.held)} kept.`, means: "What every open room screen listens to. If this stops, screens stop updating by themselves." },
    { id: "room.sweep", name: "Minute-by-minute check", group: "Situation room", state: sweptAgo == null ? "warn" : sweptAgo > 300 ? "warn" : "ok", value: sweptAgo == null ? "Never run" : ago(swept, now), metric: sweptAgo ?? 0, detail: "Raises overdue returns and red items nobody has taken, and gives new results their light.", means: "It only runs while somebody has a room screen open. More than five minutes without it is worth a look." },
    { id: "room.lights", name: "Results given a light", group: "Situation room", state: unlit > 0 ? "warn" : "ok", value: `${formatCount(book.lit)} of ${formatCount(book.results)}`, metric: unlit, detail: unlit ? `${formatCount(unlit)} results have no light yet. About 40 are lit every minute.` : "Every result has a light.", means: "Every result should have a light. A gap closes by itself while a room screen is open." },
    { id: "databank.outbox", name: "Waiting to reach Data Bank", group: "Delivery", state: !t.outbox.ok ? "off" : waiting > 500 ? "bad" : waiting > 0 ? "warn" : "ok", value: t.outbox.ok ? (waiting ? `${formatCount(waiting)} waiting` : "None waiting") : "Not set up", metric: waiting, detail: t.outbox.ok ? (waiting ? `The oldest has waited since ${ago(outbox.oldest, now)}. Each is kept and sent again safely.` : "Nothing is waiting to be delivered.") : "Deliveries to Data Bank are not set up here.", means: "Deliveries to Data Bank that have not landed. They are kept and sent again; a growing number means Data Bank cannot be reached." },
    { id: "whatsapp.webhook", name: "WhatsApp messages", group: "Delivery", state: !hooks.checked ? "off" : hooks.queued > 20 ? "warn" : "ok", value: hooks.checked ? `${formatCount(hooks.inboundDay)} in today` : "Not measured", metric: hooks.checked ? hooks.queued : 0, detail: hooks.checked ? `${formatCount(hooks.queued)} replies waiting to go out. Last message in ${ago(hooks.lastIn, now)}.` : "Not measured on this server.", means: "Messages from agents filing over WhatsApp in the last 24 hours, and replies waiting to go out." },
    { id: "auth.refusals", name: "Doors refused", group: "Security", state: Number(refusals.refused_hour) > 50 ? "bad" : Number(refusals.refused_hour) > 10 ? "warn" : "ok", value: `${formatCount(refusals.refused_hour)} this hour`, metric: Number(refusals.refused_hour ?? 0), detail: `${formatCount(refusals.refused_day)} in the last 24 hours. ${formatCount(refusals.lines_hour)} actions recorded this hour.`, means: "Accounts trying screens that are not theirs. A burst is somebody probing." },
  ];
}

/** Everything the live screen draws, from one set of measurements. */
export function snapshotOf(t, extras = {}) {
  const now = extras.now ?? Date.now();
  const checks = buildChecks(t, { ...extras, now });
  const book = first(t.items);
  const feed = first(t.events);
  const seen = first(t.sessions);
  const db = first(t.size);
  const perMinute = (t.perMinute.value ?? []).map((row) => ({ minute: row.minute, n: Number(row.n) }));
  const lastTen = perMinute.filter((row) => now - new Date(`${row.minute}:00Z`).getTime() < 10 * 60_000).reduce((sum, row) => sum + row.n, 0) / 10;
  return {
    at: now,
    checks,
    failing: checks.filter((check) => check.state === "bad").length,
    warning: checks.filter((check) => check.state === "warn").length,
    ping: t.ping.ms,
    pingOk: Boolean(t.ping.ok),
    connections: Number(db.connections ?? 0),
    maxConnections: Number(db.max_connections ?? 0),
    size: Number(db.bytes ?? 0),
    results: Number(book.results ?? 0),
    perMinute,
    lastTen,
    events: { seq: Number(feed.seq ?? 0), lastMinute: Number(feed.last_minute ?? 0) },
    sessions: { staff: Number(seen.staff ?? 0), agents: Number(seen.agents ?? 0), online: Number(seen.online ?? 0) },
    openItems: Number(book.open_items ?? 0),
    openRed: Number(book.open_red ?? 0),
    runtime: extras.runtime ?? null,
  };
}
