import { Suspense } from "react";

import NavPulse from "@/components/room/NavPulse";

/**
 * Around every screen under /room: the line that says a press was heard
 * while the dashboard it asked for is on its way.
 */
export default function RoomLayout({ children }) {
  return (
    <>
      <Suspense fallback={null}>
        <NavPulse />
      </Suspense>
      {children}
    </>
  );
}
