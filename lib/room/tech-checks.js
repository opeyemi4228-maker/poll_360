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

  return [
    { id: "postgres.round_trip", group: "Database", state: dbState, value: `${t.ping.ms} ms`, metric: t.ping.ms, detail: t.ping.ok ? `${db.name ?? "database"} · ${db.connections ?? "?"}/${db.max_connections ?? "?"} connections` : t.ping.error, means: "How long the database takes to answer one question. Over 400 ms is slow; over 1.5 s the screens will feel stuck." },
    { id: "postgres.size", group: "Database", state: t.size.ok ? "ok" : "bad", value: t.size.ok ? bytes(db.bytes) : "no answer", metric: Number(db.bytes ?? 0) / 1e6, detail: t.size.ok ? String(db.version ?? "").split(" on ")[0] : t.size.error, means: "How much the database holds. Watch it against the plan's limit." },
    { id: "postgres.second", group: "Database", state: !second || second.configured === false ? "off" : second.reachable === false ? "bad" : "ok", value: second?.latency != null ? `${second.latency} ms` : !second || second.configured === false ? "not set" : "ok", detail: !second || second.configured === false ? "not configured; photographs stay in the main database" : (second.complaint ?? "holds photograph bytes"), means: "The second database, which takes photographs so the main one does not fill." },
    { id: "schema.migrations", group: "Database", state: t.migrations.ok ? "ok" : "bad", value: `${schema.n ?? 0} applied`, detail: `last applied ${since(schema.last, now)} ago · auto-migrate ${autoMigrate ? "on" : "off"}`, means: "The tables the code expects. A deploy with a table missing fails every signed-in page." },
    { id: "room.events", group: "Situation room", state: t.events.ok ? "ok" : "bad", value: `#${feed.seq ?? 0}`, metric: Number(feed.last_minute ?? 0), detail: `${feed.last_minute ?? 0} in the last minute · last ${since(feed.last, now)} ago · ${feed.held ?? 0} held`, means: "The feed every open room screen listens to. If this stops, screens stop updating by themselves." },
    { id: "room.sweep", group: "Situation room", state: sweptAgo == null ? "warn" : sweptAgo > 300 ? "warn" : "ok", value: sweptAgo == null ? "never" : `${sweptAgo}s ago`, metric: sweptAgo ?? 0, detail: "deadlines, unowned red items, results with no light yet. Runs while a room screen is open", means: "The once-a-minute job that raises overdue returns and lights results. It only runs while somebody has a room screen open." },
    { id: "room.lights", group: "Situation room", state: unlit > 0 ? "warn" : "ok", value: `${book.lit ?? 0}/${book.results ?? 0}`, metric: unlit, detail: unlit ? `${unlit} results have no light yet; the sweep lights 40 a minute` : "every result has a light", means: "Every result should have a light. A gap closes by itself while a room screen is open." },
    { id: "databank.outbox", group: "Delivery", state: !t.outbox.ok ? "off" : waiting > 500 ? "bad" : waiting > 0 ? "warn" : "ok", value: t.outbox.ok ? `${waiting} waiting` : "no table", metric: waiting, detail: t.outbox.ok ? (waiting ? `oldest ${since(outbox.oldest, now)} · kept, and sent again safely` : "nothing waiting to be delivered") : "no outbox table", means: "Deliveries to Data Bank that have not landed. They are kept and sent again; a growing number means Data Bank cannot be reached." },
    { id: "whatsapp.webhook", group: "Delivery", state: !hooks.checked ? "off" : hooks.queued > 20 ? "warn" : "ok", value: hooks.checked ? `${hooks.inboundDay} in / 24h` : "not measured", metric: hooks.checked ? hooks.queued : 0, detail: hooks.checked ? `${hooks.queued} queued out · last in ${since(hooks.lastIn, now)} ago` : "not measured", means: "Messages from agents filing over WhatsApp, and replies waiting to go out." },
    { id: "auth.refusals", group: "Security", state: Number(refusals.refused_hour) > 50 ? "bad" : Number(refusals.refused_hour) > 10 ? "warn" : "ok", value: `${refusals.refused_hour ?? 0} / h`, metric: Number(refusals.refused_hour ?? 0), detail: `${refusals.refused_day ?? 0} doors refused in 24h · ${refusals.lines_hour ?? 0} audit lines this hour`, means: "Accounts trying doors that are not theirs. A burst is somebody probing." },
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
