import { redirect } from "next/navigation";

export const metadata = { title: "Broadcast", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The address the broadcast desk used to live at.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A DOOR, NOT A PAGE
 *
 *  This was a product: its own login, its own six heads, twenty-eight
 *  surfaces. It is a head inside the situation room now — see
 *  components/dash/RoomBroadcast.jsx for what it became and why.
 *
 *  The page is gone; the address is not. /broadcast is on briefing sheets, in
 *  bookmarks, in the rail of older builds and in messages somebody sent during
 *  a bulletin last week. Deleting the route would answer every one of those
 *  with a 404, which reads as "the product is broken" rather than "this moved
 *  one press to the left".
 *
 *  It lands on the desk's Control dashboard, which is where /broadcast itself
 *  opened. Every one of the twenty-eight old surface names still works too,
 *  as a hash — see HASH_LAYERS in components/dash/SituationRoom.jsx, which
 *  spreads them out of the desk's own redirect table rather than repeating
 *  them by hand.
 *
 *  ── NO GUARD HERE, DELIBERATELY ─────────────────────────────────────────
 *  It redirects rather than reading anything, and /room runs the same check
 *  this page used to. Guarding both would mean an account that may not open
 *  the room is told so by two different screens, and the second one is this
 *  file pretending to be a page.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function BroadcastPage() {
  redirect("/room#broadcast");
}
