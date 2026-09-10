import Link from "next/link";
import { KeyRound, ShieldCheck, UsersRound } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge, Empty } from "@/components/dash/DashCard";
import { Cell, Since, Table } from "@/components/dash/SystemBits";
import { Ranked, Split } from "@/components/dash/SystemCharts";
import Button from "@/components/ui/Button";
import { requireCapability } from "@/lib/guard";
import { users } from "@/lib/db";
import { ROLE_KEYS, ROLES, capabilitiesOf } from "@/lib/roles";
import { resolveTerritory } from "@/lib/constituencies";
import { describeTerritory } from "@/lib/territory";
import { raceLabel } from "@/lib/races";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Users and roles", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Everybody who can sign in, and what signing in lets them do.
 *
 * ── TWO HALVES, AND THE SECOND ONE IS THE POINT ────────────────────────────
 * A list of accounts is easy and answers half a question. The half nobody can
 * answer without this page is the other one: an account says BROADCASTER, and
 * the person deciding whether to issue it has no idea what a broadcaster may
 * actually do. So the roles are laid out underneath with their real
 * permissions — read from the same table the guard consults on every request,
 * not from a copy — and the decision can be made from the screen rather than
 * from somebody's memory of a conversation.
 *
 * ── NOTHING HERE CHANGES ANYTHING ──────────────────────────────────────────
 * Deliberately. Accounts are issued on the overview, coordinators approved in
 * their own queue, and both of those write to the audit trail with a reason
 * attached. Adding a second, quieter way to change a role — a dropdown on a
 * list — would mean the same act had two doors and only one of them was
 * watched. This page is where you look; the doors stay where they are, and
 * they are linked from the top.
 */
export default async function UsersPage() {
  const admin = await requireCapability("system:read", "/admin/users");

  const [rows, byRole] = await Promise.all([users.all(250), users.tally()]);

  const active = rows.filter((row) => row.status === "ACTIVE" && !row.disabledAt).length;
  const pending = rows.filter((row) => row.status === "PENDING").length;
  const disabled = rows.filter((row) => row.disabledAt).length;
  const neverIn = rows.filter((row) => !row.lastLoginAt).length;

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Users and roles"
      lead="Every account that can sign in, what it holds, and when it was last used. A role is a set of permissions, and the ones below are the permissions the product actually enforces."
      actions={
        <>
          <Button href="/admin#accounts" variant="dashOutline" size="sm">
            Issue an account
          </Button>
          <Button href="/admin/coordinators" variant="dashOutline" size="sm">
            Approval queue
          </Button>
        </>
      }
    >
      {/* ── THE SAME FOUR FIGURES, AS ONE OBJECT ─────────────────────────
          These were four counts in a strip: 41, 3, 6, 12. Four correct
          numbers that have to be added up in the reader's head before they
          mean anything, because the question is never "how many are
          disabled" — it is "what proportion of the keys to this deployment
          are live, and is anything stuck waiting".

          One bar answers that without arithmetic. The counts are still
          printed on it, and every segment is named, so nothing here is
          identified by its colour alone. */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Every account" subtitle="What state the keys to this deployment are in">
          <Split
            segments={[
              { label: "can sign in", value: active, tone: "good" },
              { label: "waiting", value: pending, tone: "warn" },
              { label: "shut off", value: disabled, tone: "neutral" },
            ]}
            caption={
              neverIn
                ? `${formatNumber(neverIn)} of them have been issued and never used — a credential nobody has signed in with is a credential nobody would miss.`
                : "Every account issued has been signed in to at least once."
            }
          />
        </Card>

        <Card title="Keys by role" subtitle="Who holds what, most first">
          <Ranked
            rows={ROLE_KEYS.map((key) => ({
              label: ROLES[key].label,
              value: byRole[key]?.total ?? 0,
              note:
                byRole[key]?.pending
                  ? `${byRole[key].pending} waiting`
                  : byRole[key]?.disabled
                    ? `${byRole[key].disabled} shut off`
                    : undefined,
            }))}
            caption="One ink deepening with the count: these are one kind of thing at several sizes, not several kinds of thing."
          />
        </Card>
      </div>

      <Card
        title="Accounts"
        subtitle={rows.length >= 250 ? "The 250 most recent" : "Newest first"}
        action={<UsersRound size={16} className="shrink-0 text-dash-muted" />}
      >
        {rows.length === 0 ? (
          <Empty>No accounts yet.</Empty>
        ) : (
          <Table
            head={[
              "Who",
              "Role",
              "Ground",
              "State",
              "Last signed in",
              "Issued",
            ]}
          >
            {rows.map((row) => {
              const place = row.territory ? resolveTerritory(row.territory) : null;
              const shut = Boolean(row.disabledAt);

              return (
                <tr key={row.id} className="hover:bg-dash-bg">
                  <Cell strong>
                    {row.name}
                    {/* The email and phone are how somebody is reached when
                        their account has to be shut off in a hurry, so they
                        are on the row rather than behind a click. */}
                    <span className="mt-0.5 block text-[0.75rem] font-medium wrap-break-word text-dash-muted">
                      {row.email ?? row.phone ?? "no address on file"}
                    </span>
                  </Cell>

                  <Cell>{ROLES[row.role]?.label ?? row.role}</Cell>

                  <Cell muted>
                    {/* Three different narrowings, and they are not the same
                        thing: a booth code is where somebody stands, a
                        territory is what they may read, a race is which
                        ballot paper. Null in all three is the whole
                        federation, which is what an administrator holds. */}
                    {row.scope ? (
                      <span className="figure text-dash-ink">{row.scope}</span>
                    ) : place ? (
                      <span className="text-dash-ink">{describeTerritory(place)}</span>
                    ) : (
                      "Nigeria, every contest"
                    )}
                    {row.race && (
                      <span className="mt-0.5 block text-[0.75rem]">{raceLabel(row.race)}</span>
                    )}
                  </Cell>

                  <Cell>
                    {shut ? (
                      <Badge tone="alert">Shut off</Badge>
                    ) : row.status === "PENDING" ? (
                      <Badge tone="warn">Waiting</Badge>
                    ) : row.status === "DECLINED" ? (
                      <Badge tone="neutral">Turned down</Badge>
                    ) : (
                      <Badge tone="good">Can sign in</Badge>
                    )}
                  </Cell>

                  <Cell>
                    <Since at={row.lastLoginAt} never="never signed in" />
                  </Cell>

                  <Cell>
                    <Since at={row.createdAt} />
                  </Cell>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* ── WHAT A ROLE ACTUALLY IS ──────────────────────────────────────
          Read off lib/roles.js at request time. If somebody adds a
          permission and forgets this page, this page changes anyway; if
          somebody removes one, the claim disappears from here too. A
          permissions table maintained by hand is a table that eventually
          tells an administrator a desk cannot do something it can. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {ROLE_KEYS.map((key) => {
          const role = ROLES[key];
          const held = capabilitiesOf(key);
          const count = byRole[key] ?? { total: 0, active: 0, pending: 0, disabled: 0 };

          return (
            <Card
              key={key}
              title={role.label}
              subtitle={role.blurb}
              action={<ShieldCheck size={16} className="shrink-0 text-dash-muted" />}
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8125rem] text-dash-muted">
                <span className="figure font-bold text-dash-ink">
                  {formatNumber(count.active)} can sign in
                </span>
                {count.pending > 0 && <span>{formatNumber(count.pending)} waiting</span>}
                {count.disabled > 0 && <span>{formatNumber(count.disabled)} shut off</span>}
                <span>
                  Signs in to{" "}
                  <Link href={role.home} className="font-semibold text-dash-ink underline">
                    {role.home}
                  </Link>
                </span>
              </div>

              {held.length === 0 ? (
                <p className="mt-4 text-[0.8125rem] text-dash-muted">
                  Holds nothing. Signed in, and waiting to be given a room.
                </p>
              ) : (
                <ul className="mt-4 space-y-1.5">
                  {held.map((capability) => (
                    <li key={capability.id} className="flex items-start gap-2.5 text-[0.8125rem]">
                      <KeyRound
                        size={13}
                        strokeWidth={2.5}
                        className="mt-0.5 shrink-0 text-dash-muted"
                      />
                      <span className="text-dash-ink">{capability.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </DashLayout>
  );
}
