"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Voters, turnout and clusters on a real basemap.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS OPTIONAL AND WHY IT IS NOT THE DEFAULT
 *
 *  Everything else in this product renders from files this repository ships.
 *  The fonts are self-hosted precisely so a room on a venue's wifi, or on a
 *  phone tethered in a collation centre, draws the same screen it drew in the
 *  office. A basemap fetched from Google is the opposite bargain: prettier,
 *  somebody else's uptime, a key with a billing account behind it, and on the
 *  one night this product exists for it is a dependency nobody in the room
 *  can fix.
 *
 *  So it is a layer you turn on, not the map you are given. Our own field is
 *  the default and is drawn from the same numbers. This adds what only a real
 *  basemap can: roads, terrain and imagery under the figures, which is what
 *  answers "is that cluster a market, a campus or a floodplain".
 *
 *  With no key configured this renders nothing and the control offering it is
 *  never shown. Nothing degrades, because nothing depended on it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE OUTLINES ARE REAL DEGREES, NOT OUR PROJECTION ─────────────────────
 * lib/geo.js can turn a point on our canvas back into a coordinate, and its
 * own header says that transform is good to about two kilometres — fine for
 * placing a marker, not fine for drawing a border. Over satellite imagery a
 * boundary two kilometres out is a visible, specific, wrong claim about where
 * a state ends. So the polygons come from the boundary data in the degrees it
 * was published in: public/geo/map/states-latlng.json, built by
 * scripts/build-latlng.mjs from the same geoBoundaries release the SVG map
 * was made from.
 *
 * ── THREE THINGS ON ONE MAP, AND WHY EACH EARNS ITS PLACE ─────────────────
 *   · The state, filled by its own figure, so the country reads at a glance.
 *   · A pin at each state's true centre of area, carrying the figure as text,
 *     because a colour cannot be quoted out loud and a number can.
 *   · The density field, optional, for where the mass actually is — a
 *     choropleth paints Nasarawa and Kano the same size.
 */

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/** Whether this room can offer Google at all. Read by the control, not by us. */
export const googleAvailable = Boolean(KEY);

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

/* Near-black, so the imagery arrives in the same room as the rest of the board
   rather than as a bright white rectangle in the middle of it. */
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

/** The ramp, as literal colours: this runs outside our stylesheet. */
const RAMP = ["#3b0a12", "#6d1220", "#a3182c", "#d11f38", "#f43f5e"];

const shadeFor = (weight) =>
  RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round((weight ?? 0) * (RAMP.length - 1))))];

export default function GoogleLayer({
  /** [{ code, name, value, label, weight }] — weight normalised 0–1. */
  places = [],
  satellite = false,
  heat = true,
  onOpen,
}) {
  const host = useRef(null);
  const map = useRef(null);
  const drawn = useRef({ polygons: [], markers: [], heat: null, info: null });
  const [shapes, setShapes] = useState(null);
  const [failed, setFailed] = useState(null);

  /* The outlines, once. They are 72KB and they never change, so they are
     fetched on first use of this layer rather than shipped to every reader of
     every dashboard whether they open it or not. */
  useEffect(() => {
    if (!KEY) return undefined;
    let live = true;
    fetch("/geo/map/states-latlng.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("boundaries"))))
      .then((data) => live && setShapes(data.states))
      .catch(() => live && setFailed("the state outlines did not load"));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!KEY || !host.current || !shapes) return undefined;
    let live = true;

    loadMaps()
      .then((maps) => {
        if (!live || !host.current) return;

        map.current ??= new maps.Map(host.current, {
          center: { lat: 9.05, lng: 8.35 },
          zoom: 6,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          gestureHandling: "greedy",
          mapTypeId: satellite ? "hybrid" : "roadmap",
          styles: satellite ? null : DARK,
        });

        /* Everything from the last render comes off before anything goes on:
           a layer that adds without removing is a layer that draws 2019 under
           2023 and calls the result a map. */
        for (const polygon of drawn.current.polygons) polygon.setMap(null);
        for (const marker of drawn.current.markers) marker.setMap(null);
        drawn.current.heat?.setMap(null);
        drawn.current.polygons = [];
        drawn.current.markers = [];

        drawn.current.info ??= new maps.InfoWindow();
        const byCode = new Map(places.map((place) => [place.code, place]));

        for (const state of shapes) {
          const place = byCode.get(state.code);
          const weight = place?.weight ?? 0;

          for (const ring of state.rings) {
            const polygon = new maps.Polygon({
              paths: ring.map(([lat, lng]) => ({ lat, lng })),
              strokeColor: "#ffffff",
              strokeOpacity: 0.45,
              strokeWeight: 1,
              fillColor: place ? shadeFor(weight) : "#4b5563",
              /* Deep enough to read the country by, sheer enough that the
                 imagery underneath is still the point of being here. */
              fillOpacity: place ? 0.3 + weight * 0.35 : 0.15,
              map: map.current,
              zIndex: 1,
            });

            polygon.addListener("click", () => {
              if (!place) return;
              drawn.current.info.setContent(
                `<div style="font:600 13px system-ui;color:#111">${place.name}<br>` +
                  `<span style="font-weight:400;color:#555">${place.label}</span><br>` +
                  `<span style="font-weight:400;color:#555;font-size:11px">${state.at[0].toFixed(4)}°N ${state.at[1].toFixed(4)}°E</span></div>`
              );
              drawn.current.info.setPosition({ lat: state.at[0], lng: state.at[1] });
              drawn.current.info.open(map.current);
              onOpen?.(place.code);
            });

            drawn.current.polygons.push(polygon);
          }

          if (!place) continue;

          /* The pin carries the figure as text. A colour cannot be read out
             loud in a bulletin and a number can, and this is the layer people
             screenshot. */
          const marker = new maps.Marker({
            position: { lat: state.at[0], lng: state.at[1] },
            map: map.current,
            title: `${place.name} — ${place.label}`,
            label: {
              text: place.code,
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: "700",
            },
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 13,
              fillColor: shadeFor(weight),
              fillOpacity: 0.95,
              strokeColor: "#ffffff",
              strokeWeight: 1.5,
            },
            zIndex: 3,
          });

          marker.addListener("click", () => {
            drawn.current.info.setContent(
              `<div style="font:600 13px system-ui;color:#111">${place.name}<br>` +
                `<span style="font-weight:400;color:#555">${place.label}</span><br>` +
                `<span style="font-weight:400;color:#555;font-size:11px">${state.at[0].toFixed(4)}°N ${state.at[1].toFixed(4)}°E</span></div>`
            );
            drawn.current.info.setPosition({ lat: state.at[0], lng: state.at[1] });
            drawn.current.info.open(map.current);
            onOpen?.(place.code);
          });

          drawn.current.markers.push(marker);
        }

        if (heat) {
          drawn.current.heat = new maps.visualization.HeatmapLayer({
            data: places
              .map((place) => {
                const state = shapes.find((item) => item.code === place.code);
                if (!state) return null;
                return {
                  location: new maps.LatLng(state.at[0], state.at[1]),
                  /* Google will not draw a zero-weight point, which is the
                     right thing for a place holding nothing. */
                  weight: Math.max(0.001, place.weight ?? 0),
                };
              })
              .filter(Boolean),
            radius: 52,
            opacity: 0.6,
            dissipating: true,
          });
          drawn.current.heat.setMap(map.current);
        }
      })
      .catch((error) => live && setFailed(error.message));

    return () => {
      live = false;
    };
  }, [shapes, places, satellite, heat, onOpen]);

  /* The ground changes without redrawing everything on it. */
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

      {/* Attribution for the outlines, which are not Google's and are the one
          thing on this map that came from us. */}
      <p className="pointer-events-none absolute bottom-1 left-2 text-[0.5625rem] text-white/50">
        State outlines: geoBoundaries gbOpen, CC BY 4.0
      </p>
    </div>
  );
}
