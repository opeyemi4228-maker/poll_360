import { KeyRound, Radio, ShieldCheck, TriangleAlert, Webhook } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge } from "@/components/dash/DashCard";
import { Counts, Field, Since } from "@/components/dash/SystemBits";
import { Split } from "@/components/dash/SystemCharts";
import LiveRefresh from "@/components/dash/LiveRefresh";
import { requireCapability } from "@/lib/guard";
import { ENDPOINTS, webhookAddress } from "@/lib/endpoints";
import { webhookTraffic } from "@/lib/system";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "API and webhooks", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The edges of the building.
 *
 * ── THE ONLY SCREEN THAT SAYS WHO IS ALLOWED THROUGH ───────────────────────
 * Every other page here is about what the product holds. This one is about
 * where it can be reached from, which is a different sort of question and the
 * one somebody asks when they are worried rather than curious. It exists for
 * two moments in particular: the afternoon before polling day, when the
 * webhook has to be pointed at Meta and verified, and the night itself, when
 * messages have stopped arriving and nobody can tell whether the problem is
 * here or there.
 *
 * The list of addresses is declared in lib/endpoints.js rather than walked
 * off disk, and a test walks the disk and fails the build if the two ever
 * disagree.
 */
export default async function ApiPage() {
  const admin = await requireCapability("system:read", "/admin/api");

  const [hook, traffic] = await Promise.all([Promise.resolve(webhookAddress()), webhookTraffic()]);

  const ready = Boolean(hook.url) && hook.canVerify && hook.checksSignatures;

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="API and webhooks"
      lead="Every address this product can be reached at from outside, who is allowed through each one, and what has come through lately."
      /* ── THE ONE CONSOLE SCREEN THAT HAS TO BE WATCHED, NOT VISITED ────
         A stuck reply queue is the exact symptom of an expired WhatsApp
         token: messages keep arriving, replies keep being written, and not
         one of them leaves the building. Nothing else on any screen in this
         product goes red when that happens, and it is not the sort of thing
         somebody reloads a page to check — so the page reloads itself. */
      actions={<LiveRefresh seconds={30} label="Live" />}
    >
      <Counts
        items={[
          {
            label: "Addresses",
            value: formatNumber(ENDPOINTS.length),
            context: "All of them require a signed-in session or a signature.",
          },
          {
            label: "Messages received",
            value: formatNumber(traffic.inbound),
            context: traffic.checked
              ? `${formatNumber(traffic.inboundDay)} in the last day`
              : "could not be checked",
          },
          {
            label: "Replies sent",
            value: formatNumber(traffic.outbound - traffic.queued),
          },
          {
            label: "Replies stuck",
            value: formatNumber(traffic.queued),
            tone: traffic.queued ? "alert" : "good",
            context: traffic.queued
              ? "Written, and never left the building."
              : "Nothing is waiting to go out.",
          },
        ]}
      />

      {/* ── WHAT WENT OUT, AND WHAT DID NOT ──────────────────────────────
          "Replies sent 812 · Replies stuck 4" is two figures somebody has to
          hold together to see the thing that matters, which is the ratio. A
          stuck reply is not a slow one — it was written and never left — and
          four of them beside eight hundred is a hiccup, while four beside
          six is a dead token and a channel that has silently stopped
          answering the field. One bar, and the difference is unmissable. */}
      {traffic.checked && traffic.outbound > 0 && (
        <Card
          className="mb-6"
          title="Replies out"
          subtitle="Written by the desk, and whether they actually left"
        >
          <Split
            segments={[
              { label: "delivered", value: traffic.outbound - traffic.queued, tone: "good" },
              { label: "stuck in the queue", value: traffic.queued, tone: "alert" },
            ]}
            caption={
              traffic.queued
                ? "A reply this product could not send is kept and shown on the desk rather than thrown away. A queue that is growing is usually an expired token."
                : "Everything written has gone out."
            }
          />
        </Card>
      )}

      {/* ── THE WEBHOOK GETS ITS OWN PANEL ───────────────────────────────
          Because it is the only address here that somebody outside has to be
          told about, and telling them is a four-step job in Meta's console
          where three of the steps look identical and only one of them is the
          one people forget. */}
      <Card
        title="The WhatsApp webhook"
        subtitle="Where every message from the field arrives"
        action={
          ready ? <Badge tone="good">Ready</Badge> : <Badge tone="warn">Not ready</Badge>
        }
      >
        <dl>
          <Field label="Point Meta's callback URL at">
            {hook.url ? (
              <code className="figure wrap-break-word">{hook.url}</code>
            ) : (
              <span className="text-dash-muted">
                Cannot be built — this deployment does not know its own public address. Set
                NEXT_PUBLIC_SITE_URL.
              </span>
            )}
          </Field>

          <Field label="Can complete Meta's handshake">
            <Yes value={hook.canVerify} />
            <span className="ml-2 text-dash-muted">
              {hook.canVerify
                ? "The one-time check that proves this server owns the address."
                : "Without WHATSAPP_VERIFY_TOKEN the handshake is refused outright, and Meta will not save the address."}
            </span>
          </Field>

          <Field label="Checks that deliveries are genuine">
            <Yes value={hook.checksSignatures} />
            <span className="ml-2 text-dash-muted">
              {hook.checksSignatures
                ? "Every delivery is checked against the app secret before the body is read."
                : "Without WHATSAPP_APP_SECRET, anything that finds the address could post to it. Nothing is accepted until this is set."}
            </span>
          </Field>

          <Field label="Can send replies back">
            <Yes value={hook.canSend} />
            <span className="ml-2 text-dash-muted">
              {hook.canSend
                ? "Replies go out over Meta's API."
                : "Replies are written and held on the desk instead of being sent."}
            </span>
          </Field>

          <Field label="Last message received">
            <Since at={traffic.lastIn} never="nothing has arrived yet" />
          </Field>
        </dl>

        {/* The step everybody misses. Verifying the URL and subscribing the
            account are two separate clicks, and a verified webhook with no
            subscription is silent in exactly the way a broken one is. */}
        <p className="mt-5 flex items-start gap-2.5 border-t border-dash-line pt-4 text-[0.8125rem] text-dash-muted">
          <Radio size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          Saving the address and subscribing the WhatsApp account to messages are two separate
          steps in Meta&rsquo;s console. Nothing arrives until the second one is done, and a webhook
          that was verified but never subscribed is silent in exactly the way a broken one is.
        </p>
      </Card>

      {traffic.queued > 0 && (
        <div className="mt-6 flex flex-wrap items-start gap-3 rounded-dash border-2 border-amber-300 bg-amber-50 px-5 py-4">
          <TriangleAlert size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-extrabold text-amber-900">
              {formatNumber(traffic.queued)} repl{traffic.queued === 1 ? "y has" : "ies have"} not
              left the building
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-amber-900">
              They were written and kept rather than thrown away, and they are visible on the
              WhatsApp desk. On a live deployment this is what an expired token looks like:
              messages keep arriving and nothing goes back.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {ENDPOINTS.map((endpoint) => (
          <Card
            key={endpoint.path}
            title={endpoint.path}
            subtitle={endpoint.what}
            action={
              endpoint.guard === "signature" ? (
                <Badge tone="ink">Signed</Badge>
              ) : (
                <Badge tone="neutral">Signed in</Badge>
              )
            }
          >
            <dl>
              <Field label="Methods">
                <span className="figure">{endpoint.methods.join(", ")}</span>
              </Field>
              <Field label="Who gets through">
                <span className="flex items-start gap-2">
                  {endpoint.guard === "signature" ? (
                    <Webhook size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-dash-muted" />
                  ) : (
                    <KeyRound size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-dash-muted" />
                  )}
                  {endpoint.who}
                </span>
              </Field>
              {endpoint.note && (
                <Field label="Worth knowing">
                  <span className="text-dash-muted">{endpoint.note}</span>
                </Field>
              )}
            </dl>
          </Card>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2.5 text-[0.8125rem] text-dash-muted">
        <ShieldCheck size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />
        There is no public API key and nothing here can be read anonymously. Every address either
        requires a signed-in session, which is checked against the database on each request, or a
        signature this product can verify. What an account can see through them is narrowed to the
        ground and the contest it holds — the same narrowing the screens use.
      </p>
    </DashLayout>
  );
}

function Yes({ value }) {
  return value ? (
    <span className="font-bold text-emerald-700">Yes</span>
  ) : (
    <span className="font-bold text-red-600">No</span>
  );
}
