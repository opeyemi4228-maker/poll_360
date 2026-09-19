/**
 * A moment, however the driver handed it over.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BUG THIS REPLACES SHIFTED EVERY TIME BY THE SERVER'S OWN OFFSET
 *
 *  Timestamps used to be read as `new Date(`${row.created_at}Z`)`, written
 *  when this driver returned strings. It returns Date objects. Interpolating
 *  one produces "Sat Sep 19 2026 16:29:48 GMT+0100 (West Africa Standard
 *  Time)Z", and the trailing Z makes the parser ignore the offset it just
 *  read: the instant comes back shifted by however far the machine is from
 *  UTC, and loses its milliseconds on the way.
 *
 *  On a host running in UTC — which is where this deploys — the shift is
 *  zero and nobody sees it. On a laptop in Lagos every time on every screen
 *  is an hour out, and on any host with a zone set it would be silently
 *  wrong on the night. So the conversion is done once, here, and it accepts
 *  what the driver actually gives: a Date, or a string, with or without a
 *  zone marker. A bare string is UTC, because that is what Postgres sends.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function at(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  const marked = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text);
  const date = new Date(marked ? text : `${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
