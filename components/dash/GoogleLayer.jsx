"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { COMMERCIAL_CENTRES } from "@/lib/geo";
import { tuningFor } from "@/lib/map-tuning";

/**
 * Voters, turnout and clusters on the real Earth.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE IMAGERY IS THE POINT, NOT A SKIN
 *
 *  Three of this room's layers ask questions that a drawn map physically
 *  cannot answer, because the answer is what is on the ground:
 *
 *    Voters   — where are the people? Settlements, not shapes.
 *    Clusters — is that crowding a market, a campus, or a floodplain?
 *    Turnout  — which places went quiet, and what is around them?
 *
 *  A choropleth of 37 polygons answers none of those. It paints Nasarawa and
 *  Kano the same size and it has nothing underneath it. So on these layers the
 *  satellite imagery *is* the map, and our figures sit on top of it, rather
 *  than the imagery being an optional decoration behind our own drawing.
 *
 *  This is Google's satellite basemap through the Maps JavaScript API — the
 *  Earth view. Google Earth's photorealistic 3D tiles are a different product
 *  with its own API and its own bill; if the room wants the tilted 3D city
 *  view, that is a deliberate next step and not a toggle.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── EACH LAYER IS TUNED, NOT SKINNED ──────────────────────────────────────
 * The three do not share a treatment, because they are not the same kind of
 * quantity and pretending they are is how a dashboard misleads:
 *
 *   VOTERS is a mass. It gets a wide density field, a cool ramp, and pins
 *   carrying the register, because the question is where the people are.
 *
 *   CLUSTERS is a pressure. It gets a tight field, a hazard ramp from amber to
 *   red, and the country's real commercial centres pinned on top — because a
 *   cluster's meaning is whatever is physically underneath it, and the markets
 *   are where the crowding is. This is the layer the imagery earns its place
 *   on.
 *
 *   TURNOUT is a rate, and a rate has no density. It gets no field at all: a
 *   heat map of percentages adds the percentages of neighbouring states
 *   together, which is arithmetic nobody should look at. Fills and pins only.
 *
 * ── THE OUTLINES ARE REAL DEGREES, NOT OUR PROJECTION ─────────────────────
 * lib/geo.js can turn a point on our canvas back into a coordinate, and its
 * own header says that transform is good to about two kilometres — fine for
 * placing a marker, not for drawing a border. Over imagery a boundary two
 * kilometres out is a visible, specific, wrong claim about where a state ends.
 * So the polygons come from the boundary data in the degrees it was published
 * in: public/geo/map/states-latlng.json, built by scripts/build-latlng.mjs
 * from the same geoBoundaries release the drawn map was made from.
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

/* Near-black roads, for the times somebody wants the map rather than the
   ground. The imagery view is left alone: restyling a photograph is how you
   get a photograph nobody can read. */
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


export default function GoogleLayer({
  /** [{ code, name, value, label, weight }] — weight normalised 0–1. */
  places = [],
  /** Which dashboard this is: register, turnout or density. */
  layer = "register",
  /** "earth" for imagery, "map" for roads. */
  ground = "earth",
  onOpen,
}) {
  const host = useRef(null);
  const map = useRef(null);
  const drawn = useRef({ polygons: [], markers: [], centres: [], field: null, info: null });
  const [shapes, setShapes] = useState(null);
  const [failed, setFailed] = useState(null);

  const tuned = useMemo(() => tuningFor(layer), [layer]);

  const shadeFor = useMemo(
    () => (weight) => {
      const at = Math.max(tuned.floor, Math.min(1, weight ?? 0));
      return tuned.ramp[Math.min(tuned.ramp.length - 1, Math.round(at * (tuned.ramp.length - 1)))];
    },
    [tuned]
  );

  /* The outlines, once. 72KB that never change, so they are fetched the first
     time this layer is opened rather than shipped to every reader of every
     dashboard whether they ever open it or not. */
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
          minZoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          scaleControl: true,
          gestureHandling: "greedy",
          tilt: 0,
          mapTypeId: ground === "earth" ? "hybrid" : "roadmap",
          styles: ground === "earth" ? null : DARK,
        });

        /* Everything from the last render comes off before anything goes on. A
           layer that adds without removing draws last week under this week and
           calls the result a map. */
        for (const item of [...drawn.current.polygons, ...drawn.current.markers, ...drawn.current.centres]) {
          item.setMap(null);
        }
        drawn.current.field?.setMap(null);
        drawn.current.polygons = [];
        drawn.current.markers = [];
        drawn.current.centres = [];
        drawn.current.field = null;

        drawn.current.info ??= new maps.InfoWindow();
        const byCode = new Map(places.map((place) => [place.code, place]));

        const card = (place, at) =>
          `<div style="font:600 13px system-ui;color:#111;line-height:1.5">${place.name}` +
          `<div style="font-weight:800;font-size:16px">${place.label}</div>` +
          `<div style="font-weight:400;color:#666;font-size:11px">${at[0].toFixed(4)}°N ${at[1].toFixed(4)}°E</div></div>`;

        for (const state of shapes) {
          const place = byCode.get(state.code);
          const weight = place?.weight ?? 0;

          for (const ring of state.rings) {
            const polygon = new maps.Polygon({
              paths: ring.map(([lat, lng]) => ({ lat, lng })),
              strokeColor: "#ffffff",
              strokeOpacity: 0.5,
              strokeWeight: 1,
              fillColor: place ? shadeFor(weight) : "#4b5563",
              /* Deep enough to read the country by, sheer enough that the
                 ground underneath is still the reason to be here. */
              fillOpacity: place ? 0.26 + weight * 0.3 : 0.12,
              map: map.current,
              zIndex: 1,
            });

            polygon.addListener("click", () => {
              if (!place) return;
              drawn.current.info.setContent(card(place, state.at));
              drawn.current.info.setPosition({ lat: state.at[0], lng: state.at[1] });
              drawn.current.info.open(map.current);
              onOpen?.(place.code);
            });

            drawn.current.polygons.push(polygon);
          }

          if (!place) continue;

          /* The pin carries the figure as text. A colour cannot be read out
             loud in a bulletin and a number can, and this is the view people
             screenshot. */
          const marker = new maps.Marker({
            position: { lat: state.at[0], lng: state.at[1] },
            map: map.current,
            title: `${place.name} — ${place.label}`,
            label: { text: place.code, color: "#ffffff", fontSize: "11px", fontWeight: "700" },
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 13,
              fillColor: shadeFor(weight),
              fillOpacity: 0.95,
              strokeColor: "#ffffff",
              strokeWeight: 1.5,
            },
            zIndex: 4,
          });

          marker.addListener("click", () => {
            drawn.current.info.setContent(card(place, state.at));
            drawn.current.info.setPosition({ lat: state.at[0], lng: state.at[1] });
            drawn.current.info.open(map.current);
            onOpen?.(place.code);
          });

          drawn.current.markers.push(marker);
        }

        /* ── WHAT IS ACTUALLY UNDER A CLUSTER ────────────────────────────
           Only on the crowding layer, and only because it answers that
           layer's own question: the country's principal markets and ports,
           at their real coordinates. A dense booth beside Onitsha market is a
           different operational problem from a dense booth in a suburb, and
           on imagery you can see which you are looking at. */
        if (tuned.centres) {
          for (const centre of COMMERCIAL_CENTRES) {
            const pin = new maps.Marker({
              position: { lat: centre.lat, lng: centre.lon },
              map: map.current,
              title: `${centre.name} — ${centre.note}`,
              icon: {
                path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                scale: centre.tier === 1 ? 5 : 3.5,
                fillColor: "#ffffff",
                fillOpacity: 0.95,
                strokeColor: "#111111",
                strokeWeight: 1,
              },
              zIndex: 5,
            });
            drawn.current.centres.push(pin);
          }
        }

        if (tuned.field) {
          drawn.current.field = new maps.visualization.HeatmapLayer({
            data: places
              .map((place) => {
                const state = shapes.find((item) => item.code === place.code);
                if (!state) return null;
                return {
                  location: new maps.LatLng(state.at[0], state.at[1]),
                  /* Google draws nothing for a zero weight, which is the right
                     thing for a place holding nothing. */
                  weight: Math.max(0.001, place.weight ?? 0),
                };
              })
              .filter(Boolean),
            radius: tuned.field.radius,
            opacity: tuned.field.opacity,
            dissipating: true,
          });
          drawn.current.field.setMap(map.current);
        }
      })
      .catch((error) => live && setFailed(error.message));

    return () => {
      live = false;
    };
  }, [shapes, places, ground, onOpen, tuned, shadeFor]);

  /* The ground changes without redrawing everything standing on it. */
  useEffect(() => {
    if (!map.current) return;
    map.current.setMapTypeId(ground === "earth" ? "hybrid" : "roadmap");
    map.current.setOptions({ styles: ground === "earth" ? null : DARK });
  }, [ground]);

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

      {/* ── THE LEGEND BELONGS ON THE MAP ────────────────────────────────
          Over imagery a fill is competing with a photograph, so what a shade
          means has to be readable in the same glance as the shade. */}
      <div className="pointer-events-none absolute top-2 left-2 max-w-[19rem] rounded-dash-sm bg-board/85 px-3 py-2 backdrop-blur-sm">
        <p className="text-[0.625rem] font-bold tracking-[0.1em] text-white uppercase">
          {tuned.title}
        </p>
        <div className="mt-1.5 flex items-center gap-1">
          {tuned.ramp.map((colour) => (
            <span
              key={colour}
              aria-hidden="true"
              className="h-2.5 flex-1 rounded-[2px]"
              style={{ background: colour }}
            />
          ))}
        </div>
        <p className="mt-1 flex justify-between text-[0.5625rem] text-white/50">
          <span>fewer</span>
          <span>more</span>
        </p>
        <p className="mt-1.5 text-[0.625rem] leading-relaxed text-white/55">{tuned.caption}</p>
        {tuned.centres && (
          <p className="mt-1 flex items-center gap-1.5 text-[0.625rem] text-white/55">
            <span aria-hidden="true" className="inline-block size-2 rotate-45 bg-white" />
            Principal markets and ports
          </p>
        )}
      </div>

      {/* Attribution for the outlines, which are not Google's and are the one
          thing on this map that came from us. */}
      <p className="pointer-events-none absolute bottom-1 left-2 text-[0.5625rem] text-white/50">
        State outlines: geoBoundaries gbOpen, CC BY 4.0
      </p>
    </div>
  );
}
