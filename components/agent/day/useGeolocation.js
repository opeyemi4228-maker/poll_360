"use client";

import { useCallback, useRef, useState } from "react";

/**
 * One reading of where the phone is, when the agent presses a button.
 *
 * ── ONE READING, NEVER A STREAM ────────────────────────────────────────────
 * No watchPosition. There is no continuous or background tracking of agents,
 * and a hook that opened a stream "because it settles faster" would quietly
 * make that untrue. Ported from Agent360's companion app, which states the
 * same rule.
 *
 * ── THIRTY SECONDS, WITH HIGH ACCURACY ─────────────────────────────────────
 * Without a data connection — the normal state at a rural polling unit — a
 * cold fix takes one to two minutes. The five-second timeout most examples use
 * fails on exactly the phones this is for.
 */
export default function useGeolocation() {
  const [state, setState] = useState({ status: "idle", position: null, error: null });
  const pending = useRef(false);

  const read = useCallback(() => {
    if (pending.current) return;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        status: "error",
        position: null,
        error: "This browser cannot find your location. Open this page in Chrome and try again.",
      });
      return;
    }

    pending.current = true;
    setState((prior) => ({ ...prior, status: "reading", error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        pending.current = false;
        setState({
          status: "ready",
          error: null,
          position: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy == null ? null : Math.round(position.coords.accuracy),
          },
        });
      },
      (error) => {
        pending.current = false;
        setState({ status: "error", position: null, error: messageFor(error) });
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 30_000 }
    );
  }, []);

  return { ...state, read };
}

/* Three failures, told apart, because "location unavailable" for all of them
   sends somebody outside to fix a permission they turned down. */
function messageFor(error) {
  switch (error?.code) {
    case 1:
      return "Your phone is blocking location for this page. Tap the lock beside the address, allow location, and try again.";
    case 2:
      return "Your phone could not find you. Step outside, away from walls, and try again.";
    case 3:
      return "Still looking. With no data signal this can take two minutes. Wait a moment and press again.";
    default:
      return "Your location could not be found. Try again in a moment.";
  }
}
