"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BellRing,
  Building2,
  Captions,
  Compass,
  Database,
  FileText,
  Gauge,
  HeartPulse,
  Inbox,
  KeyRound,
  Landmark,
  ListChecks,
  Map,
  MapPin,
  MapPinned,
  MessageSquare,
  MessagesSquare,
  Plug,
  Radio,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Target,
  TrendingUp,
  Upload,
  UserRoundCheck,
  Users,
  UsersRound,
  Webhook,
  Zap,
} from "lucide-react";

import { can, mayOpen } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * The rail's navigation.
 *
 * ── WHY THIS IS NOT ONE FLAT LIST ANY MORE ─────────────────────────────────
 * It was thirteen lines of identical weight, and four of them were headings
 * *inside* one page: "Returns", "Accounts" and "Audit trail" are three places
 * to scroll to on /admin, not three rooms. Presented as siblings of the rooms
 * they made the rail look twice as big as the product is, and none of them
 * could ever light up, because the active test discarded any link with a hash
 * in it. Somebody clicked "Audit trail", arrived, and the rail still said they
 * were on "Overview".
 *
 * So the shape now matches the truth: a handful of rooms, grouped by the part
 * of the night they belong to, and a room's own sections appear underneath it
 * only while you are standing in that room. Seven lines instead of thirteen,
 * and the one you are looking at is always the one that is lit.
 *
 * ── A LINK IS NEVER OFFERED THAT THE GUARD WOULD REFUSE ────────────────────
 * This filtered on capability alone, and capability is not the same thing as
 * access: a broadcast desk holds `gap:read`, which put "Situation room" in its
 * rail, and lib/roles.js `mayOpen` then bounced it back out again. Both tests
 * are applied now, the guard's and the capability's, so the promise this file
 * has always made is finally true. The same audit found the WhatsApp desk had
 * no line at all — a whole room with no door in the navigation — which is why
 * it is in the table below.
 * ───────────────────────────────────────────────────────────────────────────
 */
const SECTIONS = [
  {
    id: "run",
    label: "Running the count",
    items: [
      {
        href: "/admin",
        label: "Overview",
        icon: Gauge,
        capability: "accounts:issue",
        /* Sections of /admin, shown while you are on it. */
        children: [
          { href: "/admin#returns", label: "Returns", icon: FileText, capability: "results:verify" },
          { href: "/admin#accounts", label: "Accounts", icon: KeyRound, capability: "accounts:issue" },
          { href: "/admin#audit", label: "Audit trail", icon: ScrollText, capability: "accounts:issue" },
        ],
      },
      {
        href: "/admin/coordinators",
        label: "Coordinators",
        icon: UserRoundCheck,
        capability: "accounts:issue",
      },
      /* The other queue. It had none: requests arrived from the home page into
         a five-row card on the overview that could be read and not acted on,
         so the act of issuing an account had no relationship to the act of
         asking for one. */
      {
        href: "/admin/requests",
        label: "Access requests",
        icon: Inbox,
        capability: "accounts:issue",
      },
    ],
  },
  {
    id: "field",
    label: "In the field",
    items: [
      {
        href: "/field",
        label: "File a result",
        icon: MapPinned,
        capability: "results:file",
        children: [
          { href: "/field#incident", label: "Report an incident", icon: ShieldAlert, capability: "incidents:file" },
        ],
      },
      /* The desk that reads what arrives by phone. It had no line here at all,
         so the one role whose entire job is this room signed in to a rail
         holding a single link to something else. */
      { href: "/whatsapp", label: "WhatsApp desk", icon: MessageSquare, capability: "whatsapp:read" },
    ],
  },
  {
    id: "night",
    label: "On the night",
    items: [
      {
        href: "/room",
        label: "Situation room",
        icon: Users,
        capability: "gap:read",
        /* ── DOORS INTO A ROOM THAT HAS THREE HEADS ──────────────────────
           The room's own surfaces are local state rather than routes, and a
           hash is the only thing a link from out here can carry into one —
           see HASH_LAYERS in components/dash/SituationRoom.jsx. Six of them
           are listed rather than twenty-two: this is a rail, not a site map,
           and what belongs on it is the handful of surfaces somebody arrives
           looking for. The rest are one press away once you are inside.

           Which six is decided by how somebody arrives, not by the room's own
           ordering. "Alerts" is here because it is what a phone call sends
           people to — "the room says forty-seven booths in Kano" — and
           "Operations" because a verification desk opens the product at the
           queue rather than at the country. */
        children: [
          { href: "/room#overview", label: "Command centre", icon: Activity, capability: "gap:read" },
          { href: "/room#alerts", label: "Alerts", icon: BellRing, capability: "gap:read" },
          { href: "/room#coverage", label: "Coverage", icon: Gauge, capability: "gap:read" },
          { href: "/room#operations", label: "Results operations", icon: ListChecks, capability: "results:verify" },
          { href: "/room#incidents", label: "Incident feed", icon: ShieldAlert, capability: "incidents:read" },
          { href: "/room#integrity", label: "Integrity", icon: ShieldCheck, capability: "results:verify" },

          /* ── THE FOUR TIERS, WHICH ARE ONE MAP AT FOUR DEPTHS ───────────
             Not four screens. The room's map is the same map whether it is
             drawing 37 states or the booths of one ward, and these set how
             deep it opens — see HASH_LEVELS in SituationRoom. The depth is a
             request rather than an instruction, because a ward belongs to a
             local government belongs to a state and a link cannot invent
             which: the room grants as much of it as the ground already on
             screen supports and stops there. So "Wards" from the country
             lands on the country, and from inside Kaduna lands on Kaduna's.
             That is the honest behaviour and the breadcrumb says where you
             actually are. */
          { href: "/room#states", label: "States", icon: Map, group: "Geography", capability: "gap:read" },
          { href: "/room#lgas", label: "LGAs", icon: Landmark, group: "Geography", capability: "gap:read" },
          { href: "/room#wards", label: "Wards", icon: MapPinned, group: "Geography", capability: "gap:read" },
          { href: "/room#units", label: "Polling units", icon: MapPin, group: "Geography", capability: "gap:read" },
          /* The fifth is not a tier. It is the classification laid over
             whichever tier is open — stronghold, competitive, opportunity,
             weak, unknown — for whichever campaign the brief is written for.
             See lib/executive.js. */
          { href: "/room#geography", label: "Geographic intelligence", icon: Compass, group: "Geography", capability: "gap:read" },

          /* ── INTELLIGENCE, WHICH IS FOUR ROOMS THAT ALREADY EXISTED ─────
             Every line here opens a surface this product already had, under
             the name the person looking for it would use. Grassroots strength
             is the coordinators and the wards they hold; community reports
             are what the field files; trend detection is twenty-seven years
             of turnout and volatility; anomaly detection is the screening
             every return goes through. Naming them is the whole change: a
             ward organiser does not go looking for a tab called
             "Coordinators" when what they want is to know how strong the
             ground is. */
          { href: "/room#grassroots", label: "Grassroots strength", icon: Sprout, group: "Intelligence", capability: "gap:read" },
          { href: "/room#community", label: "Community reports", icon: MessagesSquare, group: "Intelligence", capability: "incidents:read" },
          { href: "/room#trends", label: "Trend detection", icon: TrendingUp, group: "Intelligence", capability: "gap:read" },
          { href: "/room#anomalies", label: "Anomaly detection", icon: ShieldAlert, group: "Intelligence", capability: "results:verify" },
          /* The one surface in this cluster that is new: the twelve figures
             a candidate, a political director or a director-general is
             actually asking for, computed once so the map beside them cannot
             disagree. See components/dash/Executive.jsx. */
          { href: "/room#executive", label: "Strategic brief", icon: Target, group: "Intelligence", capability: "gap:read" },
        ],
      },
      {
        href: "/broadcast",
        label: "Broadcast",
        icon: Radio,
        capability: "broadcast:render",
        /* ── DOORS INTO AN ARM WITH SIX HEADS ────────────────────────────
           The same arrangement as the situation room above: the surfaces are
           local state rather than routes, and a hash is the only thing a link
           from out here can carry in — see HASH_LAYERS in
           components/dash/BroadcastRoom.jsx. Five of twenty-eight are listed,
           because this is a rail and not a site map, and what belongs on it is
           the handful somebody arrives looking for. */
        children: [
          { href: "/broadcast#centre", label: "Command centre", icon: Activity, capability: "broadcast:render" },
          { href: "/broadcast#results", label: "Live results", icon: BarChart3, capability: "broadcast:render" },
          { href: "/broadcast#ticker", label: "Ticker", icon: Captions, capability: "broadcast:draft" },
          { href: "/broadcast#breaking", label: "Breaking", icon: Zap, capability: "broadcast:draft" },
          { href: "/broadcast#approvals", label: "Approvals", icon: ShieldCheck, capability: "broadcast:clear" },
        ],
      },
      {
        href: "/gap",
        label: "Declared figures",
        icon: Scale,
        capability: "gap:read",
        children: [
          /* Entering the figures is a narrower grant than reading the
             comparison — the broadcast desk holds one and not the other — so
             it earns its own line rather than riding on the room's. */
          { href: "/gap#enter", label: "Enter what was declared", icon: Upload, capability: "declared:file" },
        ],
      },
    ],
  },
  {
    id: "record",
    label: "Public record",
    /* No capability: who governs each state is public record and carries no
       count, no agent and no incident. A line with no capability is readable
       by every signed-in role, which is the point. */
    items: [{ href: "/governors", label: "Who governs", icon: Landmark }],
  },
  {
    id: "system",
    label: "System",
    /* ── WHY EIGHT LINES HERE DO NOT REPEAT THE MISTAKE AT THE TOP ────────
       The note at the head of this file is about thirteen lines of identical
       weight, four of which were headings inside one page. These are eight
       separate routes, each with its own guard and its own answer, and they
       are not siblings of the rooms above: everything above is about running
       an election, and every line here is about the machine running it. That
       is a real boundary, so it gets a real group.

       It is also the last group on purpose. Nobody arrives at 7am to read
       the audit trail; they arrive to work the count, and this is where you
       go when something is wrong with the thing doing the counting.

       Every line is held by `system:read`, which today is the super
       administrator alone — see lib/roles.js. Everything else in the rail
       filters itself away for a role that lacks the grant, and so does this:
       a broadcast desk's rail ends at "Who governs" and never learns the
       group exists. */
    items: [
      { href: "/admin/users", label: "Users & roles", icon: UsersRound, capability: "system:read" },
      { href: "/admin/organisations", label: "Organisations", icon: Building2, capability: "system:read" },
      { href: "/admin/sources", label: "Data sources", icon: Database, capability: "system:read" },
      { href: "/admin/integrations", label: "Integrations", icon: Plug, capability: "system:read" },
      { href: "/admin/audit", label: "Audit logs", icon: ScrollText, capability: "system:read" },
      { href: "/admin/health", label: "System health", icon: HeartPulse, capability: "system:read" },
      { href: "/admin/api", label: "API & webhooks", icon: Webhook, capability: "system:read" },
      { href: "/admin/settings", label: "Settings", icon: Settings, capability: "system:read" },
    ],
  },
];

/** The page a line lives on, with any in-page anchor stripped off. */
function pageOf(href) {
  return href.split("#")[0];
}

/** Both tests: the guard's, then the capability's. */
function allowed(role, item) {
  if (!mayOpen(role, pageOf(item.href))) return false;
  return item.capability ? can(role, item.capability) : true;
}

/**
 * Which in-page section is being read.
 *
 * ── THE HASH IS SOMEBODY ELSE'S STATE ──────────────────────────────────────
 * It belongs to the address bar, so it is subscribed to rather than copied
 * into React and kept in step by hand. That is not fussiness: the two ways of
 * arriving at /admin#audit are different events. Clicking it from /admin fires
 * `hashchange`; clicking it from /field is a client-side navigation and fires
 * nothing at all. A subscription reads the truth on every render and so covers
 * both, and the server snapshot is empty because a hash is never sent to the
 * server — React resolves the difference after hydration instead of the page
 * arriving with the wrong line lit.
 */
function subscribeHash(onChange) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash;
const noHash = () => "";

/**
 * @param role  the signed-in role, filtered against the same table the guard uses
 * @param rail  true in the retractable sidebar, where CSS, not React, hides the
 *              labels when it is collapsed; false in the phone drawer, which is
 *              never collapsed and must keep every word
 */
export default function DashNav({ role, rail = false }) {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);

  const sections = SECTIONS.map((section) => {
    const items = [];

    for (const item of section.items) {
      const children = (item.children ?? []).filter((child) => allowed(role, child));

      if (allowed(role, item)) items.push({ ...item, children });
      /* A grant can reach a section of a page without reaching the page's own
         line. When that happens the section stands on its own rather than
         disappearing with the parent it was nested under. */
      else for (const child of children) items.push({ ...child, children: [] });
    }

    return { ...section, items };
  }).filter((section) => section.items.length > 0);

  /* Kickers earn their space only when there is more than one group to tell
     apart. A viewer sees one line; it does not need a heading. */
  const kickers = sections.length > 1;

  return (
    <nav aria-label="Dashboard" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
      {sections.map((section, index) => (
        <div key={section.id} className={index > 0 ? "mt-5" : undefined}>
          {kickers && (
            <>
              {/* Collapsed to icons there is no room for the word, so the
                  groups are kept apart by a rule instead. The heading stays in
                  the accessibility tree either way. */}
              {rail && index > 0 && (
                <span aria-hidden="true" className="mx-auto mb-4 hidden h-px w-6 bg-white/15 rail-collapsed:block" />
              )}
              <h2
                className={cn(
                  "text-[0.625rem] font-bold tracking-[0.16em] text-white/40 uppercase",
                  "px-3 pb-1.5",
                  rail && "rail-collapsed:sr-only"
                )}
              >
                {section.label}
              </h2>
            </>
          )}

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const page = pageOf(item.href);
              const here = pathname === page;
              const children = item.children ?? [];
              const inSection = here && children.some((child) => hash === `#${child.href.split("#")[1]}`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={here ? "page" : undefined}
                    /* The label is always in the markup; in the collapsed rail
                       it is only visually hidden, so the link is never an
                       unnamed icon to a screen reader. The tooltip is what a
                       sighted reader gets in its place. */
                    title={rail ? item.label : undefined}
                    className={cn(
                      "flex items-center rounded-dash-sm text-[0.875rem] font-medium transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                      "gap-3 px-3 py-2.5",
                      rail && "rail-collapsed:h-11 rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:px-2 rail-collapsed:py-0",
                      here
                        ? /* Standing in the room: a solid block. Unless one of
                             its own sections is what you are reading, in which
                             case the block belongs to the section and the room
                             steps back to a tint — two solid highlights in one
                             column is one too many. */
                          inSection
                          ? "bg-white/10 text-white"
                          : "bg-white text-dash-ink"
                        : "text-white/65 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <item.icon size={17} strokeWidth={2.25} className="shrink-0" />
                    <span className={cn("truncate", rail && "rail-collapsed:sr-only")}>{item.label}</span>
                  </Link>

                  {/* A room's own sections, while you are in it. Hung off a
                      hairline rather than indented alone, so the column reads
                      as one thing with structure and not as two lists. */}
                  {here && children.length > 0 && (
                    <ul
                      className={cn(
                        "mt-0.5 mb-1 ml-5.5 space-y-px border-l border-white/15 pl-3",
                        rail && "rail-collapsed:hidden"
                      )}
                    >
                      {children.map((child, index) => {
                        const reading = hash === `#${child.href.split("#")[1]}`;
                        /* ── A KICKER INSIDE THE NESTED LIST ──────────────
                           The situation room is one page holding twenty-odd
                           surfaces, and the handful worth arriving at
                           directly is now more than a handful: the count,
                           the four geographic tiers, and the intelligence
                           surfaces are three different questions and a reader
                           scanning sixteen identical lines for one of them is
                           reading a list, not navigating.

                           So a child may name the cluster it opens, and the
                           first child of each cluster prints it. Only where a
                           parent actually has clusters — every other room's
                           children carry no `group` and this renders
                           nothing, which is why the six rooms above did not
                           have to change. */
                        const kicker =
                          child.group && child.group !== children[index - 1]?.group
                            ? child.group
                            : null;

                        return (
                          <li key={child.href}>
                            {kicker && (
                              <span className="mt-2.5 mb-1 block px-2.5 text-[0.5625rem] font-bold tracking-[0.16em] text-white/30 uppercase">
                                {kicker}
                              </span>
                            )}
                            <Link
                              href={child.href}
                              aria-current={reading ? "true" : undefined}
                              className={cn(
                                "flex items-center gap-2.5 rounded-dash-sm px-2.5 py-2 text-[0.8125rem] transition-colors",
                                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                                reading
                                  ? "bg-white/12 font-semibold text-white"
                                  : "font-medium text-white/50 hover:bg-white/8 hover:text-white"
                              )}
                            >
                              <child.icon size={14} strokeWidth={2.25} className="shrink-0" />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
