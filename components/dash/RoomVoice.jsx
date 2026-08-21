"use client";

import { createContext, useContext } from "react";

/**
 * The seam between Poll360 AI and the room it is standing in.
 *
 * ── WHY THE ASSISTANT DOES NOT KNOW HOW TO DRIVE ANYTHING ──────────────────
 * The assistant rides along with the chrome, so it appears on every dashboard
 * in the product. Each of those rooms is different: the situation room has a
 * map with four levels and eight surfaces, the field desk has neither. If the
 * assistant held the knowledge of how to move a map, it would hold it on the
 * screens that have no map, and every new dashboard would mean editing the
 * assistant.
 *
 * So it holds none of it. It works out what was asked for and hands that over
 * as an intention. A room that can carry the intention out publishes a `run`
 * here and does so. A room that cannot publishes nothing, and the assistant
 * says where the thing lives instead of failing silently.
 *
 * ── WHAT `run` HANDS BACK ──────────────────────────────────────────────────
 * A sentence, or nothing. Nothing means the room did what it was told and the
 * assistant should say what it planned to say. A sentence means the room knows
 * better: it is the only thing that can tell you the board was already empty,
 * or that this election is fought in one state and there is nowhere to zoom
 * out to. The room owns the truth about itself; the assistant owns the voice.
 * ───────────────────────────────────────────────────────────────────────────
 */
const RoomVoice = createContext(null);

export function RoomVoiceProvider({ value, children }) {
  return <RoomVoice.Provider value={value}>{children}</RoomVoice.Provider>;
}

/**
 * @returns the room's controls, or null on a dashboard that has not offered
 * any, which is a normal state and not an error.
 */
export function useRoomVoice() {
  return useContext(RoomVoice);
}
