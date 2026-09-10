import Link from "next/link";
import { ScrollText } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import LiveRefresh from "@/components/dash/LiveRefresh";
import { Card, Empty } from "@/components/dash/DashCard";
import { Cell, Since, Table } from "@/components/dash/SystemBits";
import { Histogram, Ranked } from "@/components/dash/SystemCharts";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/db";
import { cn, formatNumber } from "@/lib/utils";

export const metadata = { title: "Audit logs", robots: { index: false } };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

/**
 * Everything the product has recorded about itself.
 *
 * ── WHY THE TRAIL NEEDED A PAGE OF ITS OWN ─────────────────────────────────
 * It had eight lines in a card on the overview, which is a decoration rather
 * than a record: the trail exists so that a question asked a week later —
 * "who marked that return checked, and when?" — has an answer, and eight
 * lines answers it only if the question is asked within the hour. There was
 * no way to see the ninth line at all.
 *
 * ── THE PART THAT IS NOT NEGOTIABLE ────────────────────────────────────────
 * There is no delete on this screen and there is no delete in `lib/db.js`
 * either — the table has an insert and a read and nothing else, deliberately.
 * A log an administrator can tidy is not a log, it is a draft, and the whole
 * value of the thing rests on somebody being unable to remove the line about
 * themselves. So this page reads, filters and pages. It cannot write.
 *
 * ── WHAT IS DELIBERATELY NOT SHOWN ─────────────────────────────────────────
 * `meta` can carry anything a caller passed, which over time means it can
 * carry something that should not be on a screen somebody photographs. It is
 * rendered as a short, flattened summary rather than dumped as-is, and long
 * values are cut. The row keeps the whole truth; the screen shows the part
 * that answers the question.
 */
export default async function AuditPage({ searchParams }) {
  const admin = await requireCapability("system:read", "/admin/audit");

  /* A promise in this version of Next, and awaited before anything is read
     off it. See node_modules/next/dist/docs — searchParams stopped being a
     plain object, and reading one synchronously is a silent empty filter. */
  const query = (await searchParams) ?? {};

  const action = typeof query.action === "string" && query.action ? query.action : null;
  const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);

  const [{ rows, total }, kinds, activity] = await Promise.all([
    audit.page({ take: PER_PAGE, skip: (page - 1) * PER_PAGE, action }),
    audit.actions(),
    /* ── THE SHAPE THE PAGING CANNOT SHOW ────────────────────────────────
       Fifty perfectly precise lines a page, and the question most often
       asked of the trail is not answerable from any page of it: was there a
       burst of activity around the time that figure changed? That is a
       shape. It is one query — see `audit.activity` in lib/db.js, which
       buckets in the database and fills the empty hours in rather than
       letting a dead hour close up between two busy ones. */
    audit.activity(48),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (values) => {
    const params = new URLSearchParams();
    if (values.action) params.set("action", values.action);
    if (values.page && values.page > 1) params.set("page", String(values.page));
    const text = params.toString();
    return text ? `/admin/audit?${text}` : "/admin/audit";
  };

  return (
    <DashLayout
      user={admin}
      screen="admin"
      /* The trail is append-only and lines arrive while somebody is reading
         it. Slower than the health screen's poll because a page of a log is
         read, not watched, and a table that reshuffles under the eye is
         worse than one that is a minute old. */
      actions={<LiveRefresh seconds={60} label="Live" />}
      title="Audit logs"
      lead="Every act this product has recorded: who did it, what they did it to, and from where. Lines are added and never changed or removed."
    >
      {/* ── WHAT THE TRAIL LOOKS LIKE BEFORE IT IS READ ──────────────────
          Two pictures above the record, answering the two questions the
          record itself is slowest at: when was it busy, and what is it
          mostly made of. Both are cheap, neither repeats a line of the table
          below, and together they turn a log you can search into a log you
          can scan. */}
      <div className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="When it was busy" subtitle="Every recorded act, by the hour, over two days">
          <Histogram buckets={activity} height={80} caption="Lagos time" />
          <p className="mt-4 text-[0.8125rem] text-dash-muted">
            {formatNumber(activity.reduce((sum, row) => sum + row.value, 0))} lines in that window,
            of {formatNumber(total)} in the whole trail. An empty hour is drawn as an empty hour —
            a gap that closes up is what a broken pipe looks like, and it is usually the finding.
          </p>
        </Card>

        <Card title="What it is made of" subtitle="Commonest act first">
          <Ranked
            rows={kinds.slice(0, 8).map((kind) => ({ label: kind.action, value: kind.count }))}
            caption={
              kinds.length > 8
                ? `The eight commonest of ${formatNumber(kinds.length)} kinds. The rest are in the filter below.`
                : "Every kind of act the trail holds."
            }
          />
        </Card>
      </div>

      {/* ── THE FILTER IS A ROW OF LINKS ──────────────────────────────────
          Not a dropdown, and not a client component. Every state of this
          screen is a URL somebody can send to a colleague or paste into an
          incident report, which is the whole reason a person opens an audit
          trail in the first place. */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Filter href={href({})} active={!action} label="Everything" count={null} />
        {kinds.map((kind) => (
          <Filter
            key={kind.action}
            href={href({ action: kind.action })}
            active={action === kind.action}
            label={kind.action}
            count={kind.count}
          />
        ))}
      </div>

      <Card
        title={action ? `${action}` : "The whole trail"}
        subtitle={
          total === 0
            ? undefined
            : `${formatNumber(total)} line${total === 1 ? "" : "s"}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`
        }
        action={<ScrollText size={16} className="shrink-0 text-dash-muted" />}
      >
        {rows.length === 0 ? (
          <Empty>
            {action
              ? "Nothing has been recorded under that action."
              : "Nothing has been recorded yet."}
          </Empty>
        ) : (
          <Table head={["When", "Who", "Did what", "To what", "Detail", "From"]}>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-dash-bg">
                <Cell>
                  <Since at={row.createdAt} />
                </Cell>
                <Cell strong>
                  {/* The name is kept on the row at the moment it is written,
                      rather than joined at read time. An account can be
                      renamed or deleted; what the trail says happened must
                      not change underneath it. */}
                  {row.actorName ?? <span className="font-medium text-dash-muted">the system</span>}
                </Cell>
                <Cell>
                  <span className="figure font-semibold">{row.action}</span>
                </Cell>
                <Cell muted className="max-w-[18rem] truncate">
                  {row.subject ?? "—"}
                </Cell>
                <Cell muted className="max-w-[18rem]">
                  {summarise(row.meta)}
                </Cell>
                <Cell muted>
                  <span className="figure">{row.ip ?? "—"}</span>
                </Cell>
              </tr>
            ))}
          </Table>
        )}

        {pages > 1 && (
          <nav
            aria-label="Audit trail pages"
            className="mt-5 flex items-center justify-between gap-4 border-t border-dash-line pt-4 text-[0.8125rem]"
          >
            <Step href={href({ action, page: page - 1 })} disabled={page <= 1}>
              ← Newer
            </Step>
            <span className="text-dash-muted">
              Page {formatNumber(page)} of {formatNumber(pages)}
            </span>
            <Step href={href({ action, page: page + 1 })} disabled={page >= pages}>
              Older →
            </Step>
          </nav>
        )}
      </Card>
    </DashLayout>
  );
}

function Filter({ href, active, label, count }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-dash-sm border px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
        active
          ? "border-dash-ink bg-dash-ink text-white"
          : "border-dash-line bg-dash-card text-dash-muted hover:border-dash-ink hover:text-dash-ink"
      )}
    >
      <span className="figure">{label}</span>
      {count !== null && (
        <span className={cn("ml-2 tabular-nums", active ? "text-white/60" : "text-dash-muted")}>
          {formatNumber(count)}
        </span>
      )}
    </Link>
  );
}

function Step({ href, disabled, children }) {
  if (disabled) {
    return <span className="text-dash-muted opacity-50">{children}</span>;
  }
  return (
    <Link href={href} className="font-bold text-dash-ink hover:underline">
      {children}
    </Link>
  );
}

/**
 * The `meta` blob, in one short line.
 *
 * Flattened rather than pretty-printed, and cut at a length that fits a
 * table cell. A console that renders whatever a caller happened to attach is
 * a console that will one day render something nobody meant to publish onto
 * a screen somebody is about to photograph.
 */
function summarise(meta) {
  if (!meta) return "—";
  if (typeof meta !== "object") return String(meta).slice(0, 80);

  const parts = Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(typeof value === "object" ? "…" : value).slice(0, 40)}`);

  if (parts.length === 0) return "—";
  return <span className="figure text-[0.75rem]">{parts.join(" · ")}</span>;
}
