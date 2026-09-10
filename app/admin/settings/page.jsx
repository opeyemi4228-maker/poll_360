import Link from "next/link";
import { Cog, Landmark, Settings2, TriangleAlert } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge } from "@/components/dash/DashCard";
import { Cell, Field, Table } from "@/components/dash/SystemBits";
import { StateGrid } from "@/components/dash/SystemCharts";
import Button from "@/components/ui/Button";
import { requireCapability } from "@/lib/guard";
import { configuration } from "@/lib/system";
import { listElections } from "@/lib/election-scope";
import { raceLabel } from "@/lib/races";
import { ROLE_KEYS, ROLES } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The configuration this deployment is actually running on.
 *
 * ── AS OPPOSED TO THE ONE SOMEBODY BELIEVES IT IS RUNNING ON ───────────────
 * That gap is where the expensive mistakes live. A deployment pointed at a
 * staging database, a demonstration project left active while a room is being
 * briefed from it, a build allowed to alter its own schema on the first
 * request after a deploy — each of those is invisible from every screen in
 * the product and each of them is one line here.
 *
 * ── AND WHY NOTHING ON THIS PAGE IS EDITABLE ───────────────────────────────
 * Settings that live in the environment are changed where the product is
 * deployed, and settings that live in the database — which project is open,
 * which contest is on screen — already have controls in the places they are
 * used. A settings page that grew a second set of controls would be a second
 * way to change the same thing, and the two would eventually disagree about
 * which was in force. So this reads, and it links to the real doors.
 */
export default async function SettingsPage() {
  const admin = await requireCapability("system:read", "/admin/settings");

  const [config, projects] = await Promise.all([Promise.resolve(configuration()), listElections()]);

  const production = config.environment === "production";
  const liveDemo = projects.filter((row) => row.isDemo && row.status === "ACTIVE");
  const missing = config.keys.filter((key) => !key.set && key.essential);

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Settings"
      lead="What this deployment is configured to be. Read-only: settings in the environment are changed where the product is deployed, and everything else has a control where it is used."
      actions={
        <Button href="/admin/health" variant="dashOutline" size="sm">
          System health
        </Button>
      }
    >
      {(missing.length > 0 || (production && liveDemo.length > 0)) && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-dash border-2 border-red-300 bg-red-50 px-5 py-4">
          <TriangleAlert size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-red-700" />
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-extrabold text-red-900">
              This configuration is not fit for a live count
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-red-900">
              {missing.length > 0 &&
                `${missing.map((key) => key.name).join(" and ")} ${missing.length === 1 ? "is" : "are"} not set. `}
              {production &&
                liveDemo.length > 0 &&
                `${liveDemo.length} demonstration project${liveDemo.length === 1 ? " is" : "s are"} still active on a production deployment.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="This deployment"
          subtitle="Where the product is running and how it behaves there"
          action={<Cog size={16} className="shrink-0 text-dash-muted" />}
        >
          <dl>
            <Field label="Environment">
              {production ? (
                <Badge tone="ink">Production</Badge>
              ) : (
                <Badge tone="warn">{config.environment}</Badge>
              )}
              <span className="ml-2 text-dash-muted">
                {production
                  ? "Real work. Schema changes are applied deliberately, never on a page load."
                  : "Not production. The product may alter its own schema on the first query after a restart."}
              </span>
            </Field>

            <Field label="Public address">
              {config.siteUrl ? (
                <code className="figure wrap-break-word">{config.siteUrl}</code>
              ) : (
                <span className="text-dash-muted">
                  Not set. Shared links and the WhatsApp callback will point at the wrong host.
                </span>
              )}
            </Field>

            <Field label="May change its own schema">
              {config.autoMigrate ? (
                <>
                  <span className="font-bold text-amber-700">Yes</span>
                  <span className="ml-2 text-dash-muted">
                    Right on a laptop, wrong on a deployment holding real returns — a dozen cold
                    starts would all issue schema changes at once.
                  </span>
                </>
              ) : (
                <>
                  <span className="font-bold text-emerald-700">No</span>
                  <span className="ml-2 text-dash-muted">
                    Schema changes are applied as a deliberate step that can be watched and rolled
                    back.
                  </span>
                </>
              )}
            </Field>

            <Field label="Reading result sheets">
              {config.sheetReader.off ? (
                <span className="text-dash-muted">
                  Switched off. Photographs are kept with every return and never read.
                </span>
              ) : (
                <>
                  <span className="font-bold">{config.sheetReader.name}</span>
                  <span className="ml-2 text-dash-muted">
                    {config.sheetReader.handwriting
                      ? "Reads handwriting, which is what every figure on a result sheet is."
                      : "Reads print, not handwriting, so it recovers very little from a result sheet."}
                    {config.sheetReader.overridden && " Chosen explicitly rather than by which keys are present."}
                  </span>
                </>
              )}
            </Field>

            <Field label="Runtime">
              <span className="figure text-dash-muted">{config.runtime ?? "unknown"}</span>
            </Field>
          </dl>
        </Card>

        {/* ── THE KEYS, AS A PICTURE, WITH THE TABLE WHERE IT BELONGS ────
            This was a full table of every named setting: its name, what it
            is for, and whether it is present. /admin/integrations renders
            the same list from the same `INTEGRATIONS` table in lib/system.js,
            grouped under the thing each key actually switches on — which is
            the more useful of the two, because "WHATSAPP_APP_SECRET is
            missing" means nothing next to "WhatsApp is half set up and cannot
            deliver a message".

            Two tables of one list is one table too many, and the copy that
            went is the one that could not say what a missing key costs. What
            stays is the count and the shape: how many are set, how many are
            missing, and whether any of the missing ones matter. */}
        <Card
          title="Named settings"
          subtitle="Whether each one is present. No value is ever shown here, on any screen."
          action={<Settings2 size={16} className="shrink-0 text-dash-muted" />}
        >
          <StateGrid
            label={`${formatNumber(config.keys.length)} settings this build reads`}
            cells={config.keys.map((key) => ({
              label: key.name,
              state: key.set
                ? `set — ${key.why}`
                : key.essential
                  ? `missing, and ${key.why} needs it`
                  : `not set — ${key.why} is not in use`,
              tone: key.set ? "good" : key.essential ? "alert" : "neutral",
            }))}
            caption="Hover a square for the setting it stands for."
          />

          <p className="mt-5 border-t border-dash-line pt-4 text-[0.8125rem] text-dash-muted">
            Change these where the product is deployed, then restart it. Integrations lists them by
            name, under the thing each one switches on, beside the date it last did something.
          </p>

          <Button href="/admin/integrations" variant="dashOutline" size="sm" className="mt-4">
            Integrations
          </Button>
        </Card>
      </div>

      {/* ── PROJECTS ARE A SETTING TOO ────────────────────────────────────
          Which of them is active decides what every dashboard on this
          deployment is counting, and a demonstration project left running
          looks exactly like a quiet night from every other screen. */}
      <Card
        className="mt-6"
        title="Projects on this deployment"
        subtitle="Which election each dashboard can be pointed at"
        action={<Landmark size={16} className="shrink-0 text-dash-muted" />}
      >
        <Table head={["Project", "Contest", "Ground", "State", "Voting day"]}>
          {projects.map((project) => (
            <tr key={project.id} className="hover:bg-dash-bg">
              <Cell strong>
                {project.title}
                {project.isDemo && (
                  <span className="ml-2 align-middle">
                    <Badge tone={project.status === "ACTIVE" ? "warn" : "neutral"}>
                      Demonstration
                    </Badge>
                  </span>
                )}
              </Cell>
              <Cell muted>{raceLabel(project.kind)}</Cell>
              <Cell muted>
                {project.scopeStates.length === 0
                  ? "The whole federation"
                  : `${formatNumber(project.scopeStates.length)} state${project.scopeStates.length === 1 ? "" : "s"}`}
              </Cell>
              <Cell>
                {project.status === "ACTIVE" ? (
                  <Badge tone="good">Active</Badge>
                ) : project.status === "DRAFT" ? (
                  <Badge tone="neutral">Draft</Badge>
                ) : (
                  <Badge tone="neutral">Closed</Badge>
                )}
              </Cell>
              <Cell muted>
                {project.votesOn ? project.votesOn.toISOString().slice(0, 10) : "—"}
              </Cell>
            </tr>
          ))}
        </Table>

        <p className="mt-4 border-t border-dash-line pt-4 text-[0.8125rem] text-dash-muted">
          Projects are started, switched and closed from the control at the top of every dashboard.
        </p>
      </Card>

      {/* ── "WHERE EACH ROLE LANDS" WAS HERE, AND IS ON /admin/users ────
          It listed every role, the room it opens on, and what that role is
          for. The users screen already renders every role from the same
          `ROLES` table — with the capabilities each one actually holds, read
          from the table the guard consults on every request, and the number
          of accounts against it. That is a strict superset, and it is on the
          page somebody is already on when the question comes up.

          A settings page that repeats it is a second thing to keep in step,
          and it is the copy that would go stale, because nobody adding a
          capability thinks to look here. So this is a door rather than a
          table. */}
      <Card
        className="mt-6"
        title="Roles and what they open"
        subtitle="Every role, its room, and the permissions the product actually enforces"
      >
        {/* Names and doors only. The counts, the capabilities and the state
            of every account against each role are on the users screen, and
            drawing a chart here with nothing behind it — a row of bars all
            the same length, or all zero — would be worse than the table this
            replaced: a picture that encodes nothing still reads as a
            measurement. */}
        <ul className="flex flex-wrap gap-2">
          {ROLE_KEYS.map((key) => (
            <li key={key}>
              <Link
                href={ROLES[key].home}
                className="flex items-baseline gap-2 rounded-dash-sm border border-dash-line px-3 py-1.5 transition-colors hover:border-dash-ink"
              >
                <span className="text-[0.8125rem] font-semibold text-dash-ink">
                  {ROLES[key].label}
                </span>
                <span className="figure text-[0.75rem] text-dash-muted">{ROLES[key].home}</span>
              </Link>
            </li>
          ))}
        </ul>

        <Button href="/admin/users" variant="dashOutline" size="sm" className="mt-5">
          Users and roles
        </Button>
      </Card>

    </DashLayout>
  );
}
