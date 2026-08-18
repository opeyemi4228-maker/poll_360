/**
 * The arithmetic of a ballot box.
 *
 * In its own module, imported by both the browser and the server, so there is
 * exactly one definition of a valid return. The copy that runs as the agent
 * types is a courtesy that catches a mistyped figure while the sheet is still
 * in their hand; the copy that runs in the action is the one that counts. They
 * cannot drift apart, because they are the same function.
 *
 * (It cannot live in the action file: a "use server" module may only export
 * async functions, and a validator that has to run synchronously on every
 * keystroke is not one.)
 */
export function validateReturn({ registered, accredited, rejected, votes }) {
  const errors = {};
  const cast = Object.values(votes).reduce((sum, count) => sum + count, 0);

  /* Checked first: a negative vote also makes the accreditation test pass by
     cancelling a real one. */
  const negative = [registered, accredited, rejected, ...Object.values(votes)].some((n) => n < 0);
  if (negative) errors.figures = "No figure can be negative.";

  if (accredited > registered) {
    errors.accredited = "More people cannot be accredited than are registered here.";
  }

  if (cast + rejected > accredited) {
    errors.votes = `${cast} votes and ${rejected} rejected is more than the ${accredited} accredited.`;
  }

  if (cast === 0) errors.votes = "A return of nothing is not a return.";

  return { errors, cast, ok: Object.keys(errors).length === 0 };
}
