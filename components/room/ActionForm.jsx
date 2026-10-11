"use client";

import { useActionState, useEffect, useRef, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import { roomDo } from "@/app/room/actions";
import { cn } from "@/lib/utils";

/**
 * A form that does one thing in the room, and says plainly what happened.
 *
 * Every write on every room screen goes through this, so three behaviours
 * are the same everywhere: the server's refusal is shown in its own words
 * beside the button that caused it; a button cannot be pressed twice while
 * its first press is in flight; and with no connection the button is
 * disabled. Nothing is queued. A write that did not happen is one the
 * person has to press again, knowingly, when they are back.
 */
const subscribe = (notify) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/* "{id}" and "{key}" in a message or an address are filled from what the
   server answered, so a server component can say where to go next without
   handing a function across to the browser. */
const fill = (text, state) => String(text).replace(/\{(\w+)\}/g, (_, name) => (state?.[name] == null ? "" : String(state[name])));

export default function ActionForm({ what = "", action: given = null, hidden = {}, confirm = null, reset = true, onDone = null, done = null, goto = null, className, children }) {
  const router = useRouter();
  /* `action` is for the few forms that post to another desk's own action
     (the broadcast desk's). Everything else posts to the room's one. */
  const [state, action] = useActionState(given ?? roomDo, null);
  const form = useRef(null);

  useEffect(() => {
    if (!state?.ok) return;
    if (reset) form.current?.reset();
    onDone?.(state);
    if (goto) router.push(fill(goto, state));
  }, [state, reset, onDone, goto, router]);

  return (
    <form
      ref={form}
      action={action}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="do" value={what} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value ?? ""} />
      ))}
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 text-[0.8125rem] leading-snug font-semibold text-light-red">
          {state.error}
        </p>
      )}
      {state?.ok && done && (
        <p role="status" className="mt-2 text-[0.8125rem] font-semibold text-light-green">
          {fill(done, state)}
        </p>
      )}
    </form>
  );
}

export function Submit({ children, variant = "dash", size = "sm", className, ...props }) {
  const { pending } = useFormStatus();
  const online = useOnline();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || !online} aria-busy={pending} className={cn(pending && "opacity-60", className)} title={online ? undefined : "No connection"} {...props}>
      {children}
    </Button>
  );
}

const FIELD = "h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] text-dash-ink placeholder:text-dash-muted focus:border-dash-ink focus:outline-none";

export function Field({ label, className, ...props }) {
  return (
    <label className={cn("block text-[0.8125rem] font-semibold text-dash-ink", className)}>
      {label}
      <input className={cn(FIELD, "mt-1 font-normal")} {...props} />
    </label>
  );
}

export function Area({ label, className, rows = 2, ...props }) {
  return (
    <label className={cn("block text-[0.8125rem] font-semibold text-dash-ink", className)}>
      {label}
      <textarea rows={rows} className={cn(FIELD, "mt-1 h-auto py-2 font-normal")} {...props} />
    </label>
  );
}

export function Choice({ label, options, className, ...props }) {
  return (
    <label className={cn("block text-[0.8125rem] font-semibold text-dash-ink", className)}>
      {label}
      <select className={cn(FIELD, "mt-1 font-normal")} {...props}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
