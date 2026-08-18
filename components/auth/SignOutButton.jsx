"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";

import Button from "@/components/ui/Button";
import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Sign out.
 *
 * ── IT CLEARS THE OFFLINE CACHE FIRST ──────────────────────────────────────
 * The service worker keeps a copy of every page visited so they still open
 * without a signal. Those copies were rendered while somebody was signed in,
 * which means their name is in the markup. Signing out has to take the cached
 * copies with it, or the next person to pick up the phone and go offline sees
 * the previous user's chrome.
 *
 * The clear runs before the form is submitted and never blocks it: if the
 * Cache API is unavailable or throws, signing out still happens. Ending a
 * session is the one action that must not be able to fail.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function SignOutButton({ variant = "inverseOutline", size = "md", full = false, iconOnly = false, className }) {
  return (
    <form
      action={signOut}
      onSubmit={() => {
        try {
          caches?.keys().then((names) => {
            for (const name of names) {
              if (name.includes("pages")) caches.delete(name);
            }
          });
        } catch {
          /* No Cache API, nothing to clear. Carry on and sign out. */
        }
      }}
      className={cn("contents", className)}
    >
      <Submit variant={variant} size={size} full={full} iconOnly={iconOnly} />
    </form>
  );
}

function Submit({ variant, size, full, iconOnly }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      full={full}
      disabled={pending}
      title={iconOnly ? "Sign out" : undefined}
      aria-label={iconOnly ? "Sign out" : undefined}
    >
      <LogOut size={15} strokeWidth={2.75} className="shrink-0" />
      {/* In the collapsed rail the word is dropped rather than allowed to wrap
          underneath the icon, which is what produced the overlap. */}
      {!iconOnly && (pending ? "Signing out" : "Sign out")}
    </Button>
  );
}
