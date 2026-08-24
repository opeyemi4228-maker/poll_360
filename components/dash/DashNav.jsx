"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Landmark,
  BarChart3,
  FileText,
  Gauge,
  KeyRound,
  MapPinned,
  Radio,
  Scale,
  ScrollText,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";

import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * The rail's navigation.
 *
 * Built from the same permission table the guard uses, so a link can never
 * appear for a room the account would be redirected out of. Nobody is shown a
 * door they cannot walk through, an empty-handed 403 is a worse experience
 * than never having offered.
 */
const ITEMS = [
  { href: "/admin", label: "Overview", icon: Gauge, capability: "accounts:issue" },
  { href: "/admin#returns", label: "Returns", icon: FileText, capability: "results:verify" },
  { href: "/admin#accounts", label: "Accounts", icon: KeyRound, capability: "accounts:issue" },
  { href: "/admin#audit", label: "Audit trail", icon: ScrollText, capability: "accounts:issue" },

  { href: "/field", label: "File a result", icon: MapPinned, capability: "results:file" },
  { href: "/field#incident", label: "Report an incident", icon: ShieldAlert, capability: "incidents:file" },

  { href: "/broadcast", label: "Broadcast desk", icon: Radio, capability: "broadcast:render" },
  { href: "/broadcast#analysis", label: "Analysis", icon: BarChart3, capability: "broadcast:render" },

  { href: "/room", label: "Situation room", icon: Users, capability: "gap:read" },
  { href: "/room#incidents", label: "Incident feed", icon: ShieldAlert, capability: "incidents:read" },

  { href: "/gap", label: "Declared figures", icon: Scale, capability: "gap:read" },
  /* Entering the figures is a narrower grant than reading the comparison —
     the broadcast desk holds one and not the other — so it earns its own line
     rather than riding on the room's. */
  { href: "/gap#enter", label: "Enter what was declared", icon: Upload, capability: "declared:file" },

  /* No capability: who governs each state is public record and carries no
     count, no agent and no incident. A line with no capability is readable by
     every signed-in role, which is the point. */
  { href: "/governors", label: "Who governs", icon: Landmark },
];

export default function DashNav({ role, collapsed = false }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => can(role, item.capability));

  /* De-duplicate: an administrator holds every capability, so the same room
     can qualify twice through two different grants. */
  const seen = new Set();
  const visible = items.filter((item) => (seen.has(item.href) ? false : seen.add(item.href)));

  return (
    <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="space-y-0.5">
        {visible.map((item) => {
          const [base] = item.href.split("#");
          const active = pathname === base && !item.href.includes("#");

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-dash-sm py-2.5 text-[0.875rem] font-medium transition-colors",
                  collapsed ? "justify-center px-2" : "gap-3 px-3",
                  active
                    ? "bg-white text-dash-ink"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon size={17} strokeWidth={2.25} className="shrink-0" />
                {!collapsed && item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
