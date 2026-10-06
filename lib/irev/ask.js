/**
 * Ask the server for one turn of the INEC gatherer. Browser only.
 *
 * One place, because two things ask — the INEC screen's runner and the
 * dashboard-wide heartbeat — and the header that marks the request as this
 * site's own has to be the same in both. Throws where the server could not be
 * reached; the callers each decide what that means for them.
 */
export async function askForTurn() {
  const answer = await fetch("/api/irev/turn", {
    method: "POST",
    headers: { "x-poll360-turn": "1" },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!answer.ok) throw new Error(`The server answered ${answer.status}.`);
  return answer.json();
}
