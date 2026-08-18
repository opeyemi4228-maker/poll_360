/**
 * Roles, and what each one may do.
 *
 * One file, imported by the guard, the chrome, the sign-in redirect and every
 * dashboard. Permissions expressed as a table rather than as `if (role ===
 * "SUPER_ADMIN")` scattered through the app: when somebody asks "who can see
 * the sheets?", the answer has to be readable in one place, and adding a fifth
 * room must not mean auditing forty components.
 */

export const ROLES = {
  /** Everything, everywhere, plus the ability to issue accounts. */
  SUPER_ADMIN: {
    label: "Super administrator",
    short: "Admin",
    home: "/admin",
    blurb: "Runs the count: every unit, every room, every key.",
  },

  /** One booth, one person. The account that produces the data. */
  PU_AGENT: {
    label: "Polling unit coordinator",
    short: "Agent",
    home: "/field",
    blurb: "Files the result and the situation from one polling unit.",
  },

  /** A newsroom or studio. Reads and renders; never writes a result. */
  BROADCASTER: {
    label: "Broadcast desk",
    short: "Broadcast",
    home: "/broadcast",
    blurb: "Air-ready boards, analysis and export for a newsroom.",
  },

  /** A party or coalition war room. */
  SITUATION_ROOM: {
    label: "Situation room",
    short: "Room",
    home: "/room",
    blurb: "Coverage, incidents and the declared-figure gap, live.",
  },

  /** Signed in, nothing assigned yet. */
  VIEWER: {
    label: "Viewer",
    short: "Viewer",
    home: "/console",
    blurb: "Signed in, awaiting a room.",
  },
};

export const ROLE_KEYS = Object.keys(ROLES);

/**
 * The permission table.
 *
 * Read it as: this capability is held by these roles, and nobody else.
 */
const GRANTS = {
  /* Create accounts and issue keys for the rooms. The defining power of the
     super administrator, and deliberately held by that role alone. */
  "accounts:issue": ["SUPER_ADMIN"],
  /* File or amend a result from a booth. Only the person standing at one. */
  "results:file": ["PU_AGENT"],
  /* Mark a result checked against its photographed sheet. Never the filer. */
  "results:verify": ["SUPER_ADMIN"],
  /* See the photographed sheet — evidence, not aggregate. */
  "sheets:read": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Raise an incident from the field. */
  "incidents:file": ["PU_AGENT"],
  /* Read the incident feed. */
  "incidents:read": ["SUPER_ADMIN", "SITUATION_ROOM", "BROADCASTER"],
  /* Open the broadcast renderer and its frames. */
  "broadcast:render": ["SUPER_ADMIN", "BROADCASTER"],
  /* Download counted returns within scope. */
  "results:export": ["SUPER_ADMIN", "BROADCASTER", "SITUATION_ROOM"],
  /* See the gap between our count and the declared figures. */
  "gap:read": ["SUPER_ADMIN", "SITUATION_ROOM", "BROADCASTER"],
};

/** Does this role hold this capability? */
export function can(role, capability) {
  return Boolean(GRANTS[capability]?.includes(role));
}

/** Where a role lands after signing in. */
export function homeFor(role) {
  return ROLES[role]?.home ?? ROLES.VIEWER.home;
}

export function labelFor(role) {
  return ROLES[role]?.label ?? role;
}

/** Which dashboards a role may open at all — used by the guard and the nav. */
export function dashboardsFor(role) {
  const routes = new Set([homeFor(role)]);
  if (role === "SUPER_ADMIN") {
    /* The administrator can open every room, because they have to be able to
       see what each room is seeing when somebody rings at 1am. */
    routes.add("/field");
    routes.add("/broadcast");
    routes.add("/room");
  }
  return [...routes];
}

/** The guard: may this role open this path? */
export function mayOpen(role, pathname) {
  if (role === "SUPER_ADMIN") return true;
  return dashboardsFor(role).some((route) => pathname.startsWith(route));
}
