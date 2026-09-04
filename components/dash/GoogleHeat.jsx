"use client";

import { useEffect, useRef, useState } from "react";

import { unproject } from "@/lib/geo";

/**
 * The same field, on Google's basemap.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS OPTIONAL AND WHY IT IS NOT THE DEFAULT
 *
 *  Everything else in this product renders from files this repository ships.
 *  The fonts are self-hosted specifically so that a room on a venue's wifi,
 *  or on a phone tethered in a collation centre, draws the same screen it
 *  drew in the office. A basemap fetched from Google is the opposite of that
 *  bargain: it is prettier, it is somebody else's uptime, it needs a key with
 *  a billing account behind it, and on the one night this product exists for
 *  it is a dependency nobody can fix from the room.
 *
 *  So it is a layer you can turn on, not the map you are given. Our own heat
 *  field is the default and is drawn from the same numbers; this adds roads,
 *  terrain and satellite imagery under them, which is genuinely useful when
 *  the question is "what is actually there" — whether a cluster is a market,
 *  a campus or a floodplain.
 *
 *  With no key configured this component renders nothing and the control that
 *  offers it is never shown. Nothing degrades, because nothing depended on it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE POINTS ARE THE SAME POINTS ─────────────────────────────────────────
 * They arrive in the map's own 1000×812 grid and are turned back into real
 * longitude and latitude by the inverse of the projection the boundary files
 * were drawn with. So the Google layer and our own are the same figures at
 * the same places, and switching between them can never show two different
 * countries.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/** Whether this room can offer Google at all. Read by the control, not by us. */
export const googleAvailable = Boolean(KEY);

/* Loaded once per page, however many maps ask for it. */
let loading = null;

function loadMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps?.visualization) return Promise.resolve(window.google.maps);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      KEY
    )}&libraries=visualization&v=weekly`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Google Maps did not load"));
    document.head.appendChild(script);
  });

  return loading;
}

/* Near-black, so the imagery sits in the same room as the rest of the board
   rather than arriving as a bright white rectangle in the middle of it. */
const DARK = [
  { elementType: "geometry", stylers: [{ color: "#0d0f13" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a909b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d0f13" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a2f3a" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1b1f27" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "simplified" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1520" }] },
];

export default function GoogleHeat({ points = [], satellite = false }) {
  const host = useRef(null);
  const map = useRef(null);
  const heat = useRef(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!KEY || !host.current) return undefined;
    let live = true;

    loadMaps()
      .then((maps) => {
        if (!live || !host.current) return;

        map.current ??= new maps.Map(host.current, {
          center: { lat: 9.05, lng: 8.35 },
          zoom: 6,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          mapTypeId: satellite ? "hybrid" : "roadmap",
          styles: satellite ? undefined : DARK,
        });

        heat.current?.setMap(null);
        heat.current = new maps.visualization.HeatmapLayer({
          data: points.map((point) => {
            const [lon, lat] = unproject(point.x, point.y);
            return {
              location: new maps.LatLng(lat, lon),
              /* Google wants a positive weight; a zero-weight point is simply
                 not drawn, which is the right thing for a place holding
                 nothing. */
              weight: Math.max(0.001, point.weight ?? 0),
            };
          }),
          radius: 46,
          opacity: 0.75,
          dissipating: true,
        });
        heat.current.setMap(map.current);
      })
      .catch((error) => live && setFailed(error.message));

    return () => {
      live = false;
    };
  }, [points, satellite]);

  useEffect(() => {
    if (!map.current) return;
    map.current.setMapTypeId(satellite ? "hybrid" : "roadmap");
    map.current.setOptions({ styles: satellite ? null : DARK });
  }, [satellite]);

  if (!KEY) return null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-dash-sm">
      <div ref={host} className="h-full w-full" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center bg-board/85 px-6 text-center text-[0.8125rem] text-white/60">
          Google&rsquo;s map did not load ({failed}). Everything on this screen is still on our own
          map — switch back and nothing is lost.
        </p>
      )}
    </div>
  );
}
