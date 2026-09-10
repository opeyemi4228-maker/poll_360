import { Building2, Inbox } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge, Empty } from "@/components/dash/DashCard";
import { Cell, Counts, Since, Table } from "@/components/dash/SystemBits";
import { Ranked, Split } from "@/components/dash/SystemCharts";
import Button from "@/components/ui/Button";
import { requireCapability } from "@/lib/guard";
import { bodies } from "@/lib/system";
import { ROLES } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Organisations", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The bodies on the other end of the accounts.
 *
 * ── WHY THIS IS A DIFFERENT QUESTION FROM "USERS" ──────────────────────────
 * An account belongs to a person; a key belongs to a body. On election night
 * the question that gets asked down a phone is never "does Amina have an
 * account", it is "how many keys does that newsroom hold, and did we ever
 * agree to give them the incident feed?". That question has no screen unless
 * the requests and the accounts issued against them are put back together,
 * which is what this does.
 *
 * See lib/system.js for why there is no organisations table and why there
 * should not be one.
 */
export default async function OrganisationsPage() {
  const admin = await requireCapability("system:read", "/admin/organisations");

  const rows = await bodies();

  const waiting = rows.reduce((total, row) => total + row.waiting, 0);
  const accounts = rows.reduce((total, row) => total + row.accounts.length, 0);
  const live = rows.reduce(
    (total, row) => total + row.accounts.filter((account) => account.state === "ACTIVE").length,
    0
  );

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Organisations"
      lead="Every newsroom, campaign, party and observer mission that has asked for access, what they asked to cover, and which keys they now hold."
      actions={
        <Button href="/admin/requests" variant="dashOutline" size="sm">
          Work the queue
        </Button>
      }
    >
      {/* ── FOUR COUNTS, OR THE TWO QUESTIONS THEY WERE STANDING IN FOR ──
          "Bodies 12 · Waiting on us 3 · Keys issued 19 · Keys that still
          work 14". Four correct figures, and the two things somebody wants
          from them — what proportion of issued keys are still live, and who
          holds the most of them — both require arithmetic the strip does not
          do.

          A key that was issued and then shut off is not a failure and is not
          an error; it is an ordinary retirement, and it wears the neutral
          rather than a status colour for that reason. */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Keys issued to bodies outside this building">
          <Split
            segments={[
              { label: "still work", value: live, tone: "good" },
              { label: "shut off", value: accounts - live, tone: "neutral" },
            ]}
            caption={
              waiting
                ? `${formatNumber(waiting)} request${waiting === 1 ? " is" : "s are"} still waiting on an answer from us.`
                : "Every request has been answered."
            }
          />
        </Card>

        <Card title="Who holds the most" subtitle="Accounts currently issued, by body">
          {rows.length === 0 ? (
            <Empty>Nobody has asked for access yet.</Empty>
          ) : (
            <Ranked
              rows={[...rows]
                .filter((row) => row.accounts.length > 0)
                .slice(0, 8)
                .map((row) => ({
                  label: row.name,
                  value: row.accounts.length,
                  note: row.waiting ? `${row.waiting} waiting` : undefined,
                }))}
              caption={`${formatNumber(rows.length)} bod${rows.length === 1 ? "y has" : "ies have"} asked for access in total.`}
            />
          )}
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card title="Organisations" action={<Building2 size={16} className="text-dash-muted" />}>
          <Empty>
            Nobody has asked for access yet. Requests arrive from the form on the home page and
            land in the queue at /admin/requests.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-6">
          {rows.map((row) => (
            <Card
              key={row.key}
              title={row.name}
              subtitle={
                row.kinds.length
                  ? `${row.kinds.join(", ")} · first asked ${row.firstAt ? row.firstAt.toISOString().slice(0, 10) : "—"}`
                  : undefined
              }
              action={
                row.waiting > 0 ? (
                  <Badge tone="alert">
                    {row.waiting} waiting
                  </Badge>
                ) : (
                  <Building2 size={16} className="shrink-0 text-dash-muted" />
                )
              }
            >
              <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <dl className="space-y-3 text-[0.8125rem]">
                  <Row label="Asked for access">
                    {formatNumber(row.requests)} time{row.requests === 1 ? "" : "s"}
                    {row.approved > 0 && `, ${formatNumber(row.approved)} approved`}
                    {row.declined > 0 && `, ${formatNumber(row.declined)} turned down`}
                  </Row>
                  <Row label="Booths they said they cover">
                    {/* A dash, never a nought. Nobody having said is not the
                        same fact as covering no booths, and only one of them
                        is a measurement. */}
                    {row.booths > 0 ? formatNumber(row.booths) : <span className="text-dash-muted">nobody said</span>}
                  </Row>
                  <Row label="Last heard from">
                    <Since at={row.lastAt} />
                  </Row>
                </dl>

                {row.accounts.length === 0 ? (
                  <p className="rounded-dash-sm bg-dash-bg px-4 py-4 text-[0.8125rem] text-dash-muted">
                    {row.waiting > 0
                      ? "Nothing issued yet. Their request is still in the queue."
                      : "Nothing issued. They asked, and no account was created against it."}
                  </p>
                ) : (
                  <Table head={["Account", "Role", "State", "Last signed in"]} className="lg:-mx-0 lg:px-0">
                    {row.accounts.map((account) => (
                      <tr key={account.id}>
                        <Cell strong>{account.name}</Cell>
                        <Cell muted>{ROLES[account.role]?.label ?? account.role}</Cell>
                        <Cell>
                          {account.state === "DISABLED" ? (
                            <Badge tone="alert">Shut off</Badge>
                          ) : account.state === "PENDING" ? (
                            <Badge tone="warn">Waiting</Badge>
                          ) : (
                            <Badge tone="good">Works</Badge>
                          )}
                        </Cell>
                        <Cell>
                          <Since at={account.lastLoginAt} never="never signed in" />
                        </Cell>
                      </tr>
                    ))}
                  </Table>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2.5 text-[0.8125rem] text-dash-muted">
        <Inbox size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />
        A body appears here the first time it asks for access. An account issued directly from the
        overview, without a request behind it, belongs to a person rather than to a body and is
        listed under users and roles instead.
      </p>
    </DashLayout>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-dash-ink">{children}</dd>
    </div>
  );
}
