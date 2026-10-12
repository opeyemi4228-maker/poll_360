import { Activity, Database, Radio, ServerCog } from "lucide-react";

import { Badge, Card, Empty } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import BigMap from "@/components/room/BigMap";
import Stage, { Side, StatRow } from "@/components/room/Stage";
import ActionForm, { Area, Choice, Field, Submit } from "@/components/room/ActionForm";
import { Handover, age, clock } from "@/components/room/Panels";
import TechLive from "@/components/room/TechLive";
import { snapshotOf } from "@/lib/room/tech-checks";
import { lightsFor, roomPage } from "@/lib/room/page";
import { notes, staff, tech, trail } from "@/lib/room/store";
import { checkEnvironment } from "@/lib/environment";
import { health, integrations, webhookTraffic } from "@/lib/system";
import { cacheStats } from "@/lib/cache";
import { asWords, cn, formatNumber } from "@/lib/utils";

export const metadata = { title: "Technical operations", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/tech";
const VIEWS = [["ops", "Operations"], ["data", "Data stores"], ["pipeline", "Pipeline"], ["runtime", "Runtime"], ["wiring", "Wiring"], ["incidents", "Incidents"], ["security", "Security"]];
const STATUS = [["OPEN", "Open"], ["WORKING", "Being worked on"], ["WATCHING", "Fixed, being watched"], ["CLOSED", "Closed"]];

/**
 * The technical desk watches the thing running the count, not the count.
 *
 * ── MEASURED, NOT DESCRIBED ────────────────────────────────────────────────
 * Every figure here is taken while the page is drawn: how long the database
 * took to answer this request, how many rows each table holds, results a
 * minute for the last hour, when each state was last heard from, how deep
 * each queue is, what this server's memory is doing. A check that failed
 * says what failed, in the database's own words.
 *
 * And never a vote figure: no party totals, no sheet, no BVAS number. The
 * map is of flow, each state marked with how long ago it last sent anything.
 */
const bytes = (value) => {
  const n = Number(value) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kB`;
  return `${n} B`;
};
const since = (iso, now) => {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
};
const first = (check) => (check?.ok ? (check.value?.[0] ?? {}) : {});

function Check({ name, state, value, detail }) {
  const tone = { ok: "bg-light-green", warn: "bg-light-yellow", bad: "bg-light-red", off: "bg-light-grey" }[state];
  const word = { ok: "OK", warn: "WARN", bad: "FAIL", off: "OFF" }[state];
  return (
    <li className="flex items-start gap-3 py-2 font-mono text-[0.75rem]">
      <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", tone)} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-bold text-dash-ink">{name}</span>
          <span className={cn("shrink-0 font-bold tabular-nums", state === "bad" ? "text-light-red" : state === "warn" ? "text-light-yellow-ink" : "text-dash-ink")}>{word} {value}</span>
        </span>
        {detail && <span className="block truncate text-dash-muted">{detail}</span>}
      </span>
    </li>
  );
}

/** Results a minute for the last hour, one bar a minute. Empty minutes are drawn empty. */
function Throughput({ rows, now }) {
  const byMinute = new Map(rows.map((row) => [row.minute, Number(row.n)]));
  const bars = [];
  for (let back = 59; back >= 0; back -= 1) {
    const key = new Date(now - back * 60_000).toISOString().slice(0, 16);
    bars.push(byMinute.get(key) ?? 0);
  }
  const peak = Math.max(1, ...bars);
  const total = bars.reduce((sum, n) => sum + n, 0);
  return (
    <div>
      <svg viewBox="0 0 240 56" className="h-20 w-full" role="img" aria-label={`Results a minute over the last hour. ${total} in all, peak ${peak} in one minute.`} preserveAspectRatio="none">
        {bars.map((n, index) => (
          <rect key={index} x={index * 4} y={56 - (n / peak) * 52 - (n ? 2 : 0.6)} width="3" height={(n / peak) * 52 + (n ? 2 : 0.6)} fill={n ? "var(--color-dash-ink)" : "var(--color-dash-line)"} />
        ))}
      </svg>
      <p className="mt-1 flex justify-between font-mono text-[0.6875rem] text-dash-muted">
        <span>-60m</span>
        <span>{total} results · peak {peak}/min · mean {(total / 60).toFixed(2)}/min</span>
        <span>now</span>
      </p>
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left font-mono text-[0.75rem] tabular-nums">
        <thead className="text-dash-muted">
          <tr className="border-b border-dash-line">{head.map((cell, index) => <th key={cell} scope="col" className={cn("px-2 py-1.5 font-semibold", index > 0 && "text-right")}>{cell}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-dash-line last:border-0">
              {row.map((cell, column) => <td key={column} className={cn("px-2 py-1.5", column > 0 ? "text-right text-dash-ink" : "font-semibold text-dash-ink")}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TechPage({ searchParams }) {
  const { ctx, query, now } = await roomPage(BASE, searchParams);
  const view = VIEWS.some(([id]) => id === query.tab) ? query.tab : "ops";
  if (!ctx.project) return <RoomShell ctx={ctx} title="Technical operations" />;
  const security = ctx.holds("security:act");

  const [t, system, wired, hooks, incidents, states, light, sessions, blocked, lines, handovers] = await Promise.all([
    tech.telemetry(ctx.project.id, ctx.race),
    health().catch((error) => ({ reachable: false, complaint: String(error?.message ?? error) })),
    integrations().catch(() => []),
    webhookTraffic().catch(() => ({ checked: false })),
    tech.list(),
    lightsFor(ctx, ""),
    tech.light(),
    security ? staff.sessions(150) : [],
    security ? tech.blocked() : [],
    trail.byKind(["security:", "access:denied", "capability:denied", "auth:"], 60),
    notes.list({ electionId: ctx.project.id, kind: "HANDOVER", desk: "tech", take: 5 }),
  ]);
  const findings = checkEnvironment();
  const memory = process.memoryUsage();
  let cache = null;
  try {
    cache = cacheStats();
  } catch {
    cache = null;
  }

  const open = incidents.filter((row) => row.status !== "CLOSED");
  const db = first(t.size);
  const feed = first(t.events);
  const book = first(t.items);
  const seen = first(t.sessions);
  const refusals = first(t.audits);
  const outbox = first(t.outbox);
  const schema = first(t.migrations);
  const swept = first(t.sweep).updated_at;
  const sweptAgo = swept ? Math.round((now - new Date(swept).getTime()) / 1000) : null;
  const lastMinute = (t.perMinute.value ?? []).filter((row) => now - new Date(`${row.minute}:00Z`).getTime() < 10 * 60_000).reduce((sum, row) => sum + Number(row.n), 0) / 10;
  const unlit = Math.max(0, Number(book.results ?? 0) - Number(book.lit ?? 0));
  const heard = new Map((t.byState.value ?? []).map((row) => [row.state, row]));
  const mapRows = states.below.map((row) => ({ ...row, lastHeard: heard.get(row.code)?.last ?? null, recent: Number(heard.get(row.code)?.recent ?? 0) }));
  const failed = Object.values(t).filter((check) => check && check.ok === false);
  const dbState = !t.ping.ok ? "bad" : t.ping.ms > 1500 ? "bad" : t.ping.ms > 400 ? "warn" : "ok";
  const hitRate = cache && cache.hits + cache.misses ? (cache.hits / (cache.hits + cache.misses)) * 100 : null;

  const checks = [
    { name: "postgres.round_trip", state: dbState, value: `${t.ping.ms}ms`, detail: t.ping.ok ? `${db.name ?? "database"} · ${db.connections ?? "?"}/${db.max_connections ?? "?"} connections` : t.ping.error },
    { name: "postgres.size", state: t.size.ok ? "ok" : "bad", value: t.size.ok ? bytes(db.bytes) : "", detail: t.size.ok ? String(db.version ?? "").split(" on ")[0] : t.size.error },
    { name: "postgres.second", state: system.secondDatabase?.configured === false || !system.secondDatabase ? "off" : system.secondDatabase.reachable === false ? "bad" : "ok", value: system.secondDatabase?.latency != null ? `${system.secondDatabase.latency}ms` : "", detail: system.secondDatabase?.configured === false || !system.secondDatabase ? "not configured; photographs stay in the main database" : (system.secondDatabase.complaint ?? "holds photograph bytes") },
    { name: "schema.migrations", state: t.migrations.ok ? "ok" : "bad", value: `${schema.n ?? 0}`, detail: `last applied ${since(schema.last, now)} ago · auto-migrate ${process.env.NODE_ENV !== "production" || process.env.POLL360_AUTO_MIGRATE === "1" ? "on" : "off"}` },
    { name: "room.events", state: t.events.ok ? "ok" : "bad", value: `seq ${feed.seq ?? 0}`, detail: `${feed.last_minute ?? 0} in the last minute · last ${since(feed.last, now)} ago · ${feed.held ?? 0} held` },
    { name: "room.sweep", state: sweptAgo == null ? "warn" : sweptAgo > 300 ? "warn" : "ok", value: sweptAgo == null ? "never" : `${sweptAgo}s ago`, detail: "deadlines, unowned red items, results with no light yet. Runs while a room screen is open" },
    { name: "room.lights", state: unlit > 0 ? "warn" : "ok", value: `${book.lit ?? 0}/${book.results ?? 0}`, detail: unlit ? `${unlit} results have no light yet; the sweep lights 40 a minute` : "every result has a light" },
    { name: "databank.outbox", state: !t.outbox.ok ? "off" : Number(outbox.waiting) > 500 ? "bad" : Number(outbox.waiting) > 0 ? "warn" : "ok", value: t.outbox.ok ? `${outbox.waiting} waiting` : "", detail: t.outbox.ok ? (Number(outbox.waiting) ? `oldest ${since(outbox.oldest, now)} · kept, and sent again safely` : "nothing waiting to be delivered") : "no outbox table" },
    { name: "whatsapp.webhook", state: !hooks.checked ? "off" : hooks.queued > 20 ? "warn" : "ok", value: hooks.checked ? `${hooks.inboundDay} in/24h` : "", detail: hooks.checked ? `${hooks.queued} queued out · last in ${since(hooks.lastIn, now)} ago` : "not measured" },
    { name: "auth.refusals", state: Number(refusals.refused_hour) > 50 ? "bad" : Number(refusals.refused_hour) > 10 ? "warn" : "ok", value: `${refusals.refused_hour ?? 0}/h`, detail: `${refusals.refused_day ?? 0} doors refused in 24h · ${refusals.lines_hour ?? 0} audit lines this hour` },
  ];
  const bad = checks.filter((check) => check.state === "bad").length;
  const warn = checks.filter((check) => check.state === "warn").length;

  const snapshot = snapshotOf(t, {
    second: system.secondDatabase ?? null,
    hooks,
    now,
    autoMigrate: process.env.NODE_ENV !== "production" || process.env.POLL360_AUTO_MIGRATE === "1",
    runtime: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, uptime: Math.round(process.uptime()), node: process.version, region: process.env.VERCEL_REGION ?? "local", build: String(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7) },
  });
  const tables = t.tables.value ?? [];
  const stats = {
    ops: [
            { label: "Database round trip", value: `${t.ping.ms} ms`, note: t.ping.ok ? `${db.connections ?? "?"} of ${db.max_connections ?? "?"} connections · ${bytes(db.bytes)}` : "the database did not answer", tone: dbState === "ok" ? "green" : dbState === "warn" ? "yellow" : "red", icon: Database },
            { label: "Results a minute", value: lastMinute.toFixed(1), note: `${formatNumber(Number(book.results ?? 0))} held for this contest · mean of the last 10 min`, icon: Activity },
            { label: "Event feed", value: `#${formatNumber(Number(feed.seq ?? 0))}`, note: `${feed.last_minute ?? 0} events in the last minute · ${seen.online ?? 0} screens online`, icon: Radio },
            { label: "Checks failing", value: String(bad + failed.length), note: `${warn} warning · ${open.length} incident${open.length === 1 ? "" : "s"} open · system light ${light.toLowerCase()}`, tone: bad + failed.length ? "red" : warn ? "yellow" : "green", icon: ServerCog },
          ],
    data: [
      { label: "Database size", value: bytes(db.bytes), note: `${db.name ?? "database"} · ${String(db.version ?? "").split(" on ")[0]}`, icon: Database },
      { label: "Largest table", value: tables[0]?.name ?? "none", note: tables[0] ? `${bytes(tables[0].bytes)} · ${formatNumber(Math.max(0, Number(tables[0].rows)))} rows` : "" },
      { label: "Connections", value: `${db.connections ?? "?"}`, note: `of ${db.max_connections ?? "?"} allowed` },
      { label: "Schema statements applied", value: String(schema.n ?? 0), note: `last ${since(schema.last, now)} ago` },
    ],
    pipeline: [
      { label: "Results held", value: formatNumber(Number(book.results ?? 0)), note: `${formatNumber(Number(book.lit ?? 0))} have a light`, icon: Activity },
      { label: "Open items", value: formatNumber(Number(book.open_items ?? 0)), note: `${formatNumber(Number(book.open_red ?? 0))} red`, tone: Number(book.open_red) ? "red" : "ink" },
      { label: "Waiting for Data Bank", value: t.outbox.ok ? formatNumber(Number(outbox.waiting)) : "n/a", note: Number(outbox.waiting) ? `oldest ${since(outbox.oldest, now)}` : "nothing waiting", tone: Number(outbox.waiting) ? "yellow" : "green" },
      { label: "Results with no light yet", value: formatNumber(unlit), note: unlit ? "the sweep lights 40 a minute" : "all lit", tone: unlit ? "yellow" : "green" },
    ],
    runtime: [
      { label: "Memory in use", value: bytes(memory.rss), note: `heap ${bytes(memory.heapUsed)} of ${bytes(memory.heapTotal)}`, icon: ServerCog },
      { label: "Server uptime", value: since(new Date(now - process.uptime() * 1000).toISOString(), now), note: `node ${process.version} · ${process.env.VERCEL_REGION ?? "local"}` },
      { label: "Cache hit rate", value: hitRate == null ? "n/a" : `${hitRate.toFixed(1)}%`, note: cache ? `${formatNumber(cache.hits)} hits · ${formatNumber(cache.misses)} misses` : "" },
      { label: "Sessions", value: formatNumber(Number(seen.staff ?? 0) + Number(seen.agents ?? 0)), note: `${seen.staff ?? 0} staff · ${seen.agents ?? 0} agents · ${seen.online ?? 0} screens online` },
    ],
    wiring: [
      { label: "Integrations on", value: String(wired.filter((entry) => entry.state === "on").length), note: `of ${wired.length}`, tone: "green" },
      { label: "Half set", value: String(wired.filter((entry) => entry.state === "partial").length), note: "cannot deliver anything", tone: wired.some((entry) => entry.state === "partial") ? "yellow" : "green" },
      { label: "Essential and off", value: String(wired.filter((entry) => entry.state === "off" && entry.essential).length), note: "the product cannot run without these", tone: wired.some((entry) => entry.state === "off" && entry.essential) ? "red" : "green" },
      { label: "Configuration findings", value: String(findings.length), note: findings.length ? "each with its fix" : "nothing misconfigured", tone: findings.length ? "yellow" : "green" },
    ],
    incidents: [
      { label: "Open incidents", value: String(open.length), note: open.length ? "being worked" : "none open", tone: open.length ? "yellow" : "green" },
      { label: "Critical", value: String(open.filter((row) => row.severity === "CRITICAL").length), note: "turns every system light red", tone: open.some((row) => row.severity === "CRITICAL") ? "red" : "green" },
      { label: "Raised in all", value: String(incidents.length), note: "open and closed" },
      { label: "System light", value: light === "GREEN" ? "Normal" : light === "AMBER" ? "Incident" : "Critical", note: "what every top bar shows", tone: light === "GREEN" ? "green" : light === "AMBER" ? "yellow" : "red" },
    ],
    security: [
      { label: "Doors refused, last hour", value: String(refusals.refused_hour ?? 0), note: `${refusals.refused_day ?? 0} in 24 hours`, tone: Number(refusals.refused_hour) > 10 ? "red" : "green" },
      { label: "Staff sessions", value: formatNumber(Number(seen.staff ?? 0)), note: `${seen.online ?? 0} screens online now` },
      { label: "Agent sessions", value: formatNumber(Number(seen.agents ?? 0)), note: "on the agents' app" },
      { label: "Blocked addresses", value: security ? String(blocked.length) : "n/a", note: security ? "staff dashboards only" : "technical security only" },
    ],
  };

  return (
    <RoomShell
      ctx={ctx}
      title="Technical operations"
      openCount={open.length + bad}
      current={view}
      summary={`${checks.length} checks: ${bad} failing, ${warn} warning · database ${t.ping.ms}ms · build ${String(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)} · measured ${clock(t.at)}`}
      tabs={VIEWS.map(([id, name]) => ({ id, name, count: id === "incidents" ? open.length : null, href: id === "ops" ? BASE : `${BASE}?tab=${id}` }))}
    >
      <div className="space-y-3">
        {view === "ops" ? <TechLive initial={snapshot} /> : <StatRow stats={stats[view]} />}

        {view === "ops" && (
          <>
        <Stage map={<BigMap rows={mapRows} base={BASE} query={query} title="Flow by state: time since each state last sent a result" hint="No vote figure is on this screen" still only plain paint={(row) => (row.recent ? "GREEN" : !row.lastHeard ? "GREY" : now - new Date(row.lastHeard).getTime() < 3_600_000 ? "YELLOW" : "RED")} legend={{ GREEN: "Sending now (last 10 min)", YELLOW: "Quiet under an hour", RED: "Silent over an hour", GREY: "Never heard from" }} measure={(row) => (row.lastHeard ? `${since(row.lastHeard, now)}${row.recent ? ` · ${row.recent}/10m` : ""}` : "silent")} />}>
          <Side label="Flow, by state" headline={`${mapRows.filter((row) => row.recent).length} sending now`} note="States that sent a result in the last ten minutes are at the top.">
            <ul className="max-h-[30rem] divide-y divide-dash-line overflow-auto font-mono text-[0.75rem]">
              {[...mapRows].sort((a, b) => new Date(b.lastHeard ?? 0) - new Date(a.lastHeard ?? 0)).map((row) => (
                <li key={row.code} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="flex items-center gap-2 font-semibold text-dash-ink">
                    <span className={cn("size-2 rounded-full", row.recent ? "bg-light-green room-pulse" : !row.lastHeard ? "bg-light-grey" : now - new Date(row.lastHeard).getTime() < 3_600_000 ? "bg-light-yellow" : "bg-light-red")} aria-hidden="true" />
                    {row.name}
                  </span>
                  <span className="tabular-nums text-dash-muted">{row.lastHeard ? `${since(row.lastHeard, now)} ago` : "never"}{row.recent ? ` · ${row.recent}/10m` : ""}</span>
                </li>
              ))}
            </ul>
          </Side>
        </Stage>

        {failed.length > 0 && (
          <Card title="Measurements that failed" subtitle="In the database's own words.">
            <ul className="space-y-1 font-mono text-[0.75rem] text-light-red">{failed.map((check) => <li key={check.label}>{check.label}: {check.error}</li>)}</ul>
          </Card>
        )}

          </>
        )}

        {view === "data" && (
          <>
        <div id="data" className="grid scroll-mt-24 gap-3 xl:grid-cols-2">
          <Card title="Tables" subtitle={`${db.name ?? "database"} · ${bytes(db.bytes)} in all. Largest first. Row counts are the planner's estimate.`}>
            <Table head={["table", "rows", "size", "share"]} rows={(t.tables.value ?? []).map((row) => [row.name, formatNumber(Math.max(0, Number(row.rows))), bytes(row.bytes), `${((Number(row.bytes) / Math.max(1, Number(db.bytes))) * 100).toFixed(1)}%`])} />
          </Card>
          <Card title="Last heard, by state" subtitle="When each state last sent a result, and how many in the last ten minutes. Most stale first.">
            <div className="max-h-96 overflow-auto">
              <Table
                head={["state", "results", "last 10m", "last heard", "units lit"]}
                rows={[...mapRows].sort((a, b) => new Date(a.lastHeard ?? 0) - new Date(b.lastHeard ?? 0)).map((row) => [row.name, formatNumber(Number(heard.get(row.code)?.n ?? 0)), String(row.recent), row.lastHeard ? `${since(row.lastHeard, now)} ago` : "never", `${formatNumber(row.reported)}/${formatNumber(row.total)}`])}
              />
            </div>
          </Card>
        </div>

          </>
        )}

        {view === "pipeline" && (
          <>
        <div id="pipeline" className="grid scroll-mt-24 gap-3 xl:grid-cols-3">
          <Card title="How results arrive" subtitle="By the door they came through.">
            <Table head={["source", "results"]} rows={(t.sources.value ?? []).map((row) => [row.source, formatNumber(Number(row.n))])} />
          </Card>
          <Card title="Where results stand" subtitle="By state in the checking pipeline.">
            <Table head={["status", "results"]} rows={(t.statuses.value ?? []).map((row) => [row.status, formatNumber(Number(row.n))])} />
          </Card>
          <Card title="Queues" subtitle="What is waiting, and how deep.">
            <Table
              head={["queue", "depth"]}
              rows={[
                ["room_items.open", formatNumber(Number(book.open_items ?? 0))],
                ["room_items.open.red", formatNumber(Number(book.open_red ?? 0))],
                ["room_items.closed.1h", formatNumber(Number(book.closed_hour ?? 0))],
                ["results.without_light", formatNumber(unlit)],
                ["databank.outbox", t.outbox.ok ? formatNumber(Number(outbox.waiting)) : "n/a"],
                ["whatsapp.out.queued", hooks.checked ? formatNumber(hooks.queued) : "n/a"],
                ["room_events.held", formatNumber(Number(feed.held ?? 0))],
              ]}
            />
          </Card>
        </div>

          </>
        )}

        {view === "runtime" && (
          <>
        <div id="runtime" className="grid scroll-mt-24 gap-3 xl:grid-cols-3">
          <Card title="This server" subtitle="The machine that answered this request.">
            <Table
              head={["key", "value"]}
              rows={[
                ["node", process.version],
                ["env", process.env.NODE_ENV ?? "development"],
                ["region", process.env.VERCEL_REGION ?? "local"],
                ["build", String(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 12)],
                ["uptime", `${since(new Date(now - process.uptime() * 1000).toISOString(), now)}`],
                ["memory.rss", bytes(memory.rss)],
                ["memory.heap", `${bytes(memory.heapUsed)} / ${bytes(memory.heapTotal)}`],
                ["memory.external", bytes(memory.external)],
              ]}
            />
          </Card>
          <Card title="Board cache" subtitle="Shared answers on this server. A low hit rate means every reader is paying for the same query.">
            {cache ? (
              <Table head={["key", "value"]} rows={[["hit_rate", hitRate == null ? "n/a" : `${hitRate.toFixed(1)}%`], ...Object.entries(cache).filter(([, value]) => typeof value === "number").map(([key, value]) => [key, formatNumber(value)])]} />
            ) : (
              <Empty>The cache could not be read.</Empty>
            )}
          </Card>
          <Card title="Sessions" subtitle="Who is connected, by kind.">
            <Table head={["kind", "count"]} rows={[["staff.sessions", formatNumber(Number(seen.staff ?? 0))], ["agent.sessions", formatNumber(Number(seen.agents ?? 0))], ["room.screens.online", formatNumber(Number(seen.online ?? 0))], ["blocked.addresses", security ? String(blocked.length) : "n/a"]]} />
            <p className="mt-3 font-mono text-[0.6875rem] text-dash-muted">GET /api/room/telemetry returns all of this as JSON. GET /api/health is the public liveness probe.</p>
          </Card>
        </div>

          </>
        )}

        {view === "wiring" && (
          <>
        <div id="wiring" className="grid scroll-mt-24 gap-3 xl:grid-cols-2">
          <Card title="Integrations" subtitle="What this deployment is wired to. A half-set integration cannot deliver anything, so it is shown as partial, not on.">
            <ul className="divide-y divide-dash-line">
              {wired.map((entry) => (
                <Check
                  key={entry.id}
                  name={entry.id}
                  state={entry.state === "on" ? "ok" : entry.state === "partial" ? "warn" : entry.essential ? "bad" : "off"}
                  value={entry.state}
                  detail={`${entry.name} · ${entry.keys.map((key) => `${key.name}${key.set ? "" : " (unset)"}`).join(", ")}${entry.lastSeen ? ` · last seen ${since(entry.lastSeen, now)} ago` : ""}`}
                />
              ))}
            </ul>
          </Card>
          <Card title="Configuration findings" subtitle="What is not ready for a real election, and the fix for each.">
            {findings.length ? (
              <ul className="divide-y divide-dash-line">
                {findings.map((finding, index) => (
                  <li key={index} className="py-2 text-[0.8125rem]">
                    <p className="flex items-center gap-2 font-bold text-dash-ink"><Badge tone={String(finding.severity).toUpperCase().includes("SERIOUS") ? "alert" : "warn"}>{asWords(String(finding.severity))}</Badge>{finding.name}</p>
                    <p className="mt-1 text-dash-muted">{finding.says}</p>
                    <p className="mt-1 font-mono text-[0.6875rem] break-all text-dash-ink">{finding.fix}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing is misconfigured.</Empty>
            )}
          </Card>
        </div>

          </>
        )}

        {view === "incidents" && (
          <>
        <Card id="incidents" title={`Technical incidents (${open.length} open)`} subtitle="Anybody in the room can raise one. A critical one turns every system light red and reaches the Director.">
          <ActionForm what="techRaise" className="mb-4 grid gap-2 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
            <Field label="What is wrong, in a line" name="title" required maxLength={140} />
            <Choice label="How bad" name="severity" options={[["MINOR", "Minor"], ["MAJOR", "Major"], ["CRITICAL", "Critical"]]} />
            <Submit>Raise</Submit>
          </ActionForm>
          {incidents.length ? (
            <ul className="divide-y divide-dash-line">
              {incidents.map((row) => (
                <li key={row.id} className="py-3">
                  <details open={row.status !== "CLOSED" && row.severity === "CRITICAL"}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[0.875rem]">
                      <Badge tone={row.severity === "CRITICAL" ? "alert" : row.severity === "MAJOR" ? "warn" : "neutral"}>{asWords(row.severity)}</Badge>
                      <span className="min-w-0 flex-1 font-semibold text-dash-ink">{row.title}</span>
                      <span className="text-[0.8125rem] text-dash-muted">{asWords(row.status)} · {row.raisedName} · {age(row.at, now)}</span>
                    </summary>
                    <div className="mt-2 space-y-2 rounded-dash-sm bg-dash-bg p-3 text-[0.8125rem]">
                      {row.detail && <p className="whitespace-pre-wrap text-dash-ink">{row.detail}</p>}
                      {row.updates.map((update, index) => (
                        <p key={index} className="font-mono text-[0.75rem] text-dash-muted">{clock(update.at)} · {update.by} · {asWords(update.status)}{update.note ? ` · ${update.note}` : ""}</p>
                      ))}
                      {row.status !== "CLOSED" && (
                        <ActionForm what="techUpdate" hidden={{ id: row.id }} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                          <Choice label="Where it stands" name="status" defaultValue={row.status} options={STATUS} />
                          <Area label="Update" name="note" rows={1} />
                          <Submit variant="dashOutline">Save</Submit>
                        </ActionForm>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No technical incident has been raised.</Empty>
          )}
        </Card>

          </>
        )}

        {view === "security" && (
          <>
        <div id="security" className="grid scroll-mt-24 gap-3 xl:grid-cols-2">
          <Card title="Security events" subtitle="Refused doors, ended sessions, blocked addresses. Newest first.">
            {lines.length ? (
              <div className="max-h-96 overflow-auto">
                <Table head={["time", "event", "actor", "subject", "address"]} rows={lines.map((line) => [clock(line.at), line.action, line.actor ?? "unknown", String(line.subject ?? "").slice(0, 28), line.ip ?? "none"])} />
              </div>
            ) : (
              <Empty>No security event has been recorded.</Empty>
            )}
          </Card>

          {security ? (
            <Card title="Sessions and addresses" subtitle="End every session a person has open, or stop an address reaching the dashboards.">
              <ActionForm what="block" className="grid gap-2 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
                <Field label="Internet address" name="ip" required placeholder="102.89.0.1" />
                <Field label="Why" name="reason" required />
                <Submit>Block</Submit>
              </ActionForm>
              {blocked.length > 0 && (
                <ul className="mt-3 divide-y divide-dash-line text-[0.8125rem]">
                  {blocked.map((row) => (
                    <li key={row.ip} className="flex flex-wrap items-center gap-x-3 py-2">
                      <span className="font-mono font-semibold text-dash-ink">{row.ip}</span>
                      <span className="min-w-0 flex-1 text-dash-muted">{row.reason} · {row.byName} · {clock(row.at)}</span>
                      <ActionForm what="unblock" hidden={{ ip: row.ip }}><Submit variant="dashOutline">Unblock</Submit></ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-5 mb-1 text-[0.875rem] font-bold text-dash-ink">Signed in now ({sessions.length} sessions)</h3>
              <ul className="max-h-80 divide-y divide-dash-line overflow-auto text-[0.8125rem]">
                {[...new Map(sessions.map((row) => [row.userId, row])).values()].map((row) => (
                  <li key={row.userId} className="flex flex-wrap items-center gap-x-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-dash-ink">{row.name}</span>
                      <span className="font-mono text-[0.75rem] text-dash-muted"> · {row.role} · {sessions.filter((each) => each.userId === row.userId).length} open · since {clock(row.since)} · {row.short}</span>
                    </span>
                    {row.userId !== ctx.user.id && (
                      <ActionForm what="endSessions" hidden={{ user: row.userId }} confirm={`End every session ${row.name} has open? They will have to sign in again.`}><Submit variant="dashOutline">End sessions</Submit></ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card title="Sessions and addresses">
              <Empty>Ending sessions and blocking addresses is for technical security and the Super Admin.</Empty>
            </Card>
          )}
        </div>

          </>
        )}

        {view === "ops" && <Handover desk="tech" notes={handovers} userId={ctx.user.id} />}
      </div>
    </RoomShell>
  );
}
