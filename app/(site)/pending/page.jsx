import { redirect } from "next/navigation";

/**
 * The waiting room moved, with the sign-up it belongs to.
 *
 * See the note in app/(site)/join/page.jsx: coordinators are held in their own
 * table with their own session, and /agent/pending is the screen that reads it.
 * This address is kept alive rather than removed because it may be sitting in
 * somebody's browser history from the hour the two existed side by side.
 */
export const metadata = { robots: { index: false } };

export default function PendingPage() {
  redirect("/agent/pending");
}
