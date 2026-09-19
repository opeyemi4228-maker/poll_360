/**
 * Roles, and what each one may do.
 *
 * One file, imported by the guard, the chrome, the sign-in redirect and every
 * dashboard. Permissions expressed as a table rather than as `if (role ===
 * "SUPER_ADMIN")` scattered through the app: when somebody asks "who can see
 * the sheets?", the answer has to be readable in one place, and adding a fifth
 * room must not mean auditing forty components.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO ACCOUNTS, NOT FIVE
 *
 *  There were five issuable roles, and four of them turned out to be one job
 *  seen from different desks. A broadcast account read the count and could
 *  not write to it; a WhatsApp desk read the field and could not write to it;
 *  the situation room did both and held every capability either of them had.
 *  So the product was maintaining three sign-ins, three homes and three sets
 *  of chrome to express one distinction — reads the count, or runs it.
 *
 *  The cost was not the code. It was that a collation room ran the night
 *  across three logins, and the thing they needed on screen was always on the
 *  one they were not signed into. Everything a desk does now happens in the
 *  room, under a head of its own, and there are two accounts:
 *
 *    SUPER_ADMIN     runs the deployment and can open everything
 *    SITUATION_ROOM  runs the night: the count, the field and the output
 *
 *  ── WHAT IS NOT A ROLE IN THIS TABLE, AND MUST NOT BECOME ONE ───────────
 *  Agents. A polling unit agent does not hold a `users` row at all: they are
 *  on the roster in `coordinators`, they sign in with a code Data Bank
 *  confirms, and they live on the agents' own domain. That is a separate
 *  identity system on purpose, and collapsing the office roles has nothing to
 *  do with it. See lib/agent-identity.js.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const ROLES = {
  /** Everything, everywhere, plus the ability to issue accounts. */
  SUPER_ADMIN: {
    label: "Super administrator",
    short: "Admin",
    home: "/admin",
    blurb: "Runs the count: every unit, every room, every key.",
  },

  /**
   * The collation room: the count, the field and everything that goes out.
   *
   * One account for the whole night. The broadcast desk and the WhatsApp desk
   * were separate roles with separate homes and are heads inside this room
   * now — see components/dash/SituationRoom.jsx.
   */
  SITUATION_ROOM: {
    label: "Situation & collation room",
    short: "Room",
    home: "/room",
    blurb: "The count, the field and the output — live, on one dashboard.",
  },

  /**
   * ── NOT ISSUABLE, AND KEPT ON PURPOSE ────────────────────────────────
   * Staff polling unit accounts predate the agents' app. They can no longer
   * sign in — see app/actions/auth.js — and no new one can be issued, but the
   * rows they filed still carry this role as their author and lib/watch.js
   * still reads them to build the roster. Removing the entry would not delete
   * those accounts; it would only stop the product being able to name what
   * they are, which is how a returns table ends up with an author nobody can
   * resolve. Agents themselves are in `coordinators` and are unaffected.
   */
  PU_AGENT: {
    label: "Polling unit coordinator (retired)",
    short: "Agent",
    home: "/field",
    blurb: "A staff booth account from before the agents' app. Cannot sign in.",
  },

  /** Signed in, nothing assigned yet. */
  VIEWER: {
    label: "Viewer",
    short: "Viewer",
    home: "/console",
    blurb: "Signed in, awaiting a room.",
  },
};

/**
 * The accounts an administrator may actually create.
 *
 * Deliberately not `ROLE_KEYS`. Two of the entries above describe states an
 * account can be *in* rather than accounts anybody issues, and an issue form
 * built from the full table offers both — which is how somebody ends up
 * creating a viewer who can open nothing, or a retired booth account that
 * cannot sign in, and then reporting it as a bug.
 */
export const ISSUABLE_ROLES = ["SITUATION_ROOM", "SUPER_ADMIN"];

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
  /* ── FILE FOR A BOOTH YOU ARE NOT STANDING AT ───────────────────────────
     A separate power from the one above, and deliberately so. A coordinator
     files their own booth and cannot name another: the unit comes from their
     appointment and is not a field on their form. This is the desk's version —
     a return read down the phone from a booth whose agent has no signal, or a
     rehearsal being loaded before polling day — and it must be a different
     grant, because a form that lets somebody type a unit code is a form that
     can file for a booth nobody appointed them to. Every such row records who
     uploaded it, and the desk can see at a glance that it did not come from
     the booth itself. */
  "results:upload": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Mark a result checked against its photographed sheet. Never the filer. */
  "results:verify": ["SUPER_ADMIN"],
  /* See the photographed sheet, evidence, not aggregate. */
  "sheets:read": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Raise an incident from the field. */
  "incidents:file": ["PU_AGENT"],
  /* Read the incident feed. */
  "incidents:read": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Open the broadcast renderer and its frames. */
  "broadcast:render": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* ── THREE POWERS ON THE BROADCAST DESK, NOT ONE ────────────────────────
     Drafting a strap, clearing it, and taking it to air are three different
     acts, and a product that grants them as one has no editorial control at
     all — it has a button.

     All three are held by the same role, which looks like the same thing and
     is not: the separation this desk actually depends on is between *people*,
     and it is enforced on the item rather than on the role. Nobody may clear
     something they drafted themselves, whatever they hold. That check is what
     survived the desks being merged into one account — it never depended on
     there being a separate broadcast role, and it does not now. See
     app/broadcast/actions.js.

     Splitting them here is what makes it possible to issue a desk that can
     write and not clear, on the day a newsroom asks for one, without auditing
     every screen again. */
  "broadcast:draft": ["SUPER_ADMIN", "SITUATION_ROOM"],
  "broadcast:clear": ["SUPER_ADMIN", "SITUATION_ROOM"],
  "broadcast:air": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Download counted returns within scope. */
  "results:export": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* See the gap between our count and the declared figures. */
  "gap:read": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Enter what the commission declared.
     ── THE GRANT SURVIVES, THOUGH THE DESK THAT IT EXCLUDED DOES NOT ──────
     This was the line between the newsroom and the room running the count:
     a broadcast account read the comparison and could not decide what our
     count was being held against, because a wrong entry there manufactures a
     divergence that is entirely our own doing.

     There is no separate newsroom account now, so nothing is excluded by it
     today. It is kept as its own grant rather than folded into the room's
     other powers because the distinction is real whatever the roster looks
     like, and the day somebody is handed a desk that may read the gap and not
     write it, this is the line already drawn. Every row records who entered
     it. */
  "declared:file": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Read the WhatsApp desk: every conversation with every polling unit. This
     is the most sensitive read in the product, because a thread names a booth
     and a person in the same breath. It stays a grant of its own, held by the
     room and the administrator and nobody else, so that handing somebody a
     desk that may read the count never silently hands them the field's
     conversations with it. */
  "whatsapp:read": ["SUPER_ADMIN", "SITUATION_ROOM"],
  /* Tie a phone number to a real account, which is what allows figures from
     that number to enter the count. The one action on the desk that changes
     what is counted, so it is the administrator's alone. */
  "whatsapp:claim": ["SUPER_ADMIN"],
  /* ── THE SYSTEM CONSOLE ─────────────────────────────────────────────────
     Not "the count", but the thing running it: who holds an account, which
     bodies those accounts belong to, where every figure entered from, what
     this deployment is wired to, and everything it has recorded about itself.

     A separate grant from `accounts:issue` even though one role holds both
     today, because they are separate questions. Issuing a credential is an
     act inside one election; reading the console is standing outside every
     election and looking at the machine. The day somebody wants a technical
     operator who can read the wiring and cannot issue a key — or an auditor
     who can read the trail and touch nothing — this is the line that already
     exists to be moved, rather than forty screens to be re-audited. */
  "system:read": ["SUPER_ADMIN"],
};

/** Does this role hold this capability? */
/**
 * Roles that were merged away, and what an account still holding one means.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A RETIRED ROLE IS NOT QUIETLY PROMOTED
 *
 *  The broadcast desk and the WhatsApp desk stopped being roles when they
 *  became heads inside the situation room. Accounts issued under them are
 *  still in the database, and they now hold no capability at all: they sign
 *  in, land on the viewer's console and find the desk missing.
 *
 *  It is tempting to answer them as the room they became. That is wrong, and
 *  the reason is the one the broadcast desk was separated for in the first
 *  place: the room unseals incident narratives for whoever opens it, and a
 *  newsroom account must not be handed those, nor the ability to change a
 *  figure it is about to put on air (see tests/access.test.js).
 *
 *  So they stay unprivileged, and the fact is surfaced instead — an
 *  administrator is told the account is stranded and re-issues it. Silence
 *  was the bug; promotion would have been a worse one.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const RETIRED_ROLES = ["BROADCASTER", "WHATSAPP_DESK"];

/** Is this an account nobody can use until it is re-issued? */
export const isStranded = (role) => !ROLES[role];

export function can(role, capability) {
  return Boolean(GRANTS[capability]?.includes(role));
}

/**
 * What every capability is, said in words a person uses.
 *
 * ── WHY THE IDS ARE NOT SHOWN TO ANYBODY ───────────────────────────────────
 * `results:verify` is a good key and a terrible sentence. The people who read
 * the roles screen are the ones deciding whether a newsroom should be handed
 * an account an hour before polls close, and "may open the broadcast renderer
 * and its frames" is not a decision they can make from a colon-separated
 * identifier. So the identifier stays in the code, where it belongs, and the
 * screen renders this.
 *
 * Kept beside the grant table rather than in the component, so the two are
 * read together and edited together. `tests/system.test.js` fails the build if
 * a capability is added to one and not the other — a permission with no
 * sentence would otherwise appear on the screen as a blank line, which reads
 * as "this role may do nothing" rather than "somebody forgot".
 */
export const CAPABILITY_LABEL = {
  "accounts:issue": "Issue accounts and keys",
  "results:file": "File a result from their own booth",
  "results:upload": "File a result for a booth they are not standing at",
  "results:verify": "Mark a return checked against its sheet",
  "sheets:read": "See the photographed result sheets",
  "incidents:file": "Report an incident from the field",
  "incidents:read": "Read the incident feed",
  "broadcast:render": "Open the broadcast desk and render frames",
  "broadcast:draft": "Write straps, graphics, posts and running orders",
  "broadcast:clear": "Clear somebody else's work for air",
  "broadcast:air": "Take a cleared item to air, and take it off again",
  "results:export": "Download counted returns",
  "gap:read": "Compare our count with the declared figures",
  "declared:file": "Enter what the commission declared",
  "whatsapp:read": "Read every WhatsApp conversation with the field",
  "whatsapp:claim": "Tie a phone number to a real account",
  "system:read": "Open the system console",
};

/** Every capability in the table, in the order it is declared. */
export const CAPABILITIES = Object.keys(GRANTS);

/**
 * Everything one role may do, for the screen that lists roles.
 *
 * Derived from the same table the guard consults, so a roles screen cannot
 * describe a permission the product does not actually enforce. A page that
 * lists permissions from its own hard-coded copy is a page that will one day
 * tell an administrator a desk cannot do something it can.
 */
export function capabilitiesOf(role) {
  return CAPABILITIES.filter((capability) => can(role, capability)).map((capability) => ({
    id: capability,
    label: CAPABILITY_LABEL[capability] ?? capability,
  }));
}

/** Which roles hold one capability. The other way round, for the same screen. */
export function rolesWith(capability) {
  return [...(GRANTS[capability] ?? [])];
}

/** Where a role lands after signing in. */
export function homeFor(role) {
  return ROLES[role]?.home ?? ROLES.VIEWER.home;
}

export function labelFor(role) {
  return ROLES[role]?.label ?? `${role} (retired — re-issue this account)`;
}

/**
 * Which dashboards a role may open at all, used by the guard and the nav.
 *
 * ── ROUTES FOLLOW CAPABILITIES, THEY DO NOT SHADOW THEM ────────────────────
 * The WhatsApp desk is not anybody's home, so listing homes alone locked out
 * the very rooms the capability table had just granted it to: the route guard
 * runs first and refused the path before the capability was ever consulted.
 * A screen that is not a role's home has to earn its route from the same
 * grant that governs its contents, or the two drift apart and the symptom is
 * a room being told to go home from a page it is entitled to read.
 *
 * ── AND WHY /broadcast IS NO LONGER ONE OF THEM ────────────────────────────
 * The broadcast desk was a screen of its own and is a head inside the room
 * now, so there is no route to grant: whoever may open /room opens it, and
 * the grants above still decide what the head is allowed to draw. The old
 * address still answers — it sends the reader to the head that replaced it,
 * because a link on a briefing sheet should not stop working because the
 * product got tidier.
 *
 * ── AND WHY /whatsapp IS STILL HERE, THOUGH THE DESK'S ROLE IS NOT ─────────
 * The WhatsApp role was folded into the room; the screen was not, and the
 * reason is arithmetic rather than taste. The broadcast head cost the room
 * two extra queries because it is built from returns the room had already
 * fetched. This desk is built from conversations, contacts, open sessions,
 * positions and sheet readings — thirteen queries that nothing else in the
 * room reads. Folded in, every reader sitting on Command would pay for all
 * thirteen every fifteen seconds, to render a screen they are not looking at.
 *
 * So it keeps its address and earns it from the capability, exactly as the
 * note above describes. It is a desk somebody sits at, not a head somebody
 * glances between.
 */
export function dashboardsFor(role) {
  const routes = new Set([homeFor(role)]);

  if (can(role, "whatsapp:read")) routes.add("/whatsapp");

  /* The divergence room earns its route from the same grant that governs its
     contents rather than from being somebody's home. This is exactly the
     lesson the WhatsApp desk taught above: a screen whose route and capability
     are decided separately becomes a screen a role is entitled to read and is
     sent home from. */
  if (can(role, "gap:read")) routes.add("/gap");

  /* Who governs each state is public record and carries no count, no agent
     and no incident. Every signed-in role may read it, including a viewer,
     because withholding a map of the standing governorships protects nothing
     and the first thing somebody new to a desk needs is the lie of the land. */
  routes.add("/governors");

  if (role === "SUPER_ADMIN") {
    /* The administrator can open every room, because they have to be able to
       see what each room is seeing when somebody rings at 1am. */
    routes.add("/field");
    routes.add("/room");
  }
  return [...routes];
}

/**
 * The guard: may this role open this path?
 *
 * ── WHY THE BOUNDARY IS A SLASH AND NOT A PREFIX ───────────────────────────
 * This matched on a bare prefix, which is right for "/console/settings" and
 * quietly wrong for anything that merely begins the same way. A coordinator
 * holds "/field", so "/fieldwork" opened for them; a broadcaster holds
 * "/broadcast", so "/broadcasting-house" did too.
 *
 * Nothing in the product is named that way today, which is exactly what makes
 * it dangerous: it costs nothing now and grants a room to the wrong desk on
 * the day somebody adds a route whose name happens to start with an existing
 * one. A path is the route itself, or something beneath it. There is no third
 * case, and "begins with the same letters" was never meant to be one.
 */
export function mayOpen(role, pathname) {
  if (role === "SUPER_ADMIN") return true;
  const path = String(pathname ?? "");
  return dashboardsFor(role).some((route) => path === route || path.startsWith(`${route}/`));
}
