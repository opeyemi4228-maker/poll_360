import { MapPinned, TriangleAlert } from "lucide-react";

/**
 * What this room is looking at, said on the screen rather than assumed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A narrowed room looks exactly like an unnarrowed one. Same map, same
 *  colours, same coverage dial — and the figures are a district's while the
 *  screen says nothing about which district. Somebody reads "38% counted" and
 *  has no way to know whether the denominator is 176,623 booths or 4,100.
 *
 *  So the ground is printed once, at the top, with the number of local
 *  governments behind it. It is one line and it is the difference between a
 *  percentage that means something and a percentage that is merely formatted.
 *
 *  ── THE TWO THINGS IT HAS TO SAY OUT LOUD ───────────────────────────────
 *  A seat that shares its local government with another seat, because the
 *  booths on this screen belong to both of them and no line this product can
 *  draw separates them.
 *
 *  And a ground that no longer resolves. That room is empty, and the reason
 *  is not that nobody has reported — it is that this account's district key
 *  names nothing we hold any more. An empty screen with no explanation is
 *  read as "the count has not started", which is the most expensive wrong
 *  conclusion available at nine at night.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function GroundBanner({ territory, ground, unresolved = false, lgaNames = [] }) {
  if (unresolved) {
    return (
      <p className="mb-5 flex gap-3 rounded-dash border-l-2 border-red-500 bg-red-50 px-4 py-3 text-[0.875rem] leading-relaxed text-dash-ink">
        <TriangleAlert size={17} strokeWidth={2.5} className="mt-0.5 shrink-0 text-red-600" />
        <span>
          This account is tied to a place this system no longer holds, so it is showing nothing
          rather than showing you the whole country. Nothing is wrong with the count. Ask an
          administrator to set the ground on this account again.
        </span>
      </p>
    );
  }

  /* An account over the whole federation has nothing to be told: the map is
     the country and the country is what it is looking at. */
  if (!territory || territory.level === "NATION") return null;

  return (
    <p className="mb-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-dash border border-dash-line bg-dash-bg px-4 py-3 text-[0.875rem] text-dash-muted">
      <MapPinned size={15} strokeWidth={2.5} className="shrink-0 self-center text-dash-muted" />
      <span className="font-semibold text-dash-ink">{ground}</span>
      <span>
        · every figure on this screen is this ground and nothing outside it
        {lgaNames.length > 0 && `, across ${lgaNames.length} local government${lgaNames.length === 1 ? "" : "s"}`}
      </span>
      {territory.shared && (
        <span className="w-full text-amber-700">
          {territory.shared.join(" and ")} are both elected inside this local government, and the
          line between them runs between wards, which nobody publishes in a form we hold. These
          booths are both seats&rsquo; booths.
        </span>
      )}
    </p>
  );
}
