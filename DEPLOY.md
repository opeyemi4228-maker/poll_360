# Deploying Poll360

## Why the Vercel build was failing

`/login` returned **"This page couldn't load. A server error occurred"** because
storage was a SQLite file on disk. Vercel's filesystem is read only, so opening
the database threw on every page that touched it, and every page that signs
somebody in touches it.

Worse than the error: on any host where the disk *is* writable but temporary,
it would have appeared to work and then quietly lost every result filed since
the last deploy. Storage is now Postgres on Neon, reached over HTTP, which
needs no disk and no connection held open between requests.

---

## Environment variables

Set these in **Vercel → your project → Settings → Environment Variables**, for
Production, Preview and Development.

| Name | Required | What it is |
|---|---|---|
| `DATABASE_URL` | **yes** | The Neon **pooled** connection string. Without it the app cannot start. |
| `ENCRYPTION_KEY` | **yes** | 32 random bytes, base64. Seals phone numbers and message bodies at rest. |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://poll-360.vercel.app`, used for canonical URLs and the sitemap. |
| `NEXT_PUBLIC_AGENT_URL` | optional | The agents' own domain, e.g. `https://poll360agents.com`. Add that domain to this same Vercel project, and set this for **Production only** — on previews the agent pages stay at `/agent`. Once set, the agents' pages are served at its root and `/agent/...` on the main site forwards there, while staff pages answer "not found" on it. Changing it needs a redeploy. To try it locally, set `http://agent.localhost:3001` in `.env.local` and restart `npm run dev`; browsers resolve `*.localhost` to this machine with no hosts-file edit. |
| `DATABANK_AGENTS_KEY` | for agents | A key issued in Data Bank for `POLL360` with the scopes `agents:register`, `agents:approve` and `agents:confirm`. Agents sign in with a code only, and Data Bank confirms it; without this key no agent can sign in and the approval page cannot read the list. `DATABANK_URL` (or the older `DUMPSITE_URL`) must point at Data Bank. |
| `AGENT360_URL` | optional | Agent360's address, for check-ins, the SOS and the day's record on the agents' app. Without it the app simply has no check-in section. |
| `AGENT_DOOR_SECRET` | with `AGENT360_URL` | Any long random string. Agent360 holds the same value; it signs every request between the two. |
| `WHATSAPP_VERIFY_TOKEN` | for WhatsApp | Any string you also paste into Meta's webhook setup. |
| `WHATSAPP_APP_SECRET` | for WhatsApp | From the Meta app. Every delivery is signature checked against it. |
| `WHATSAPP_TOKEN` | for WhatsApp | Meta access token, used to send replies and download photographs. |
| `WHATSAPP_PHONE_ID` | for WhatsApp | The number's id in the Meta console. |
| `ANTHROPIC_API_KEY` | recommended | The sheet reader that can read handwriting, which is what the figures on an EC8A actually are. Without it the sheet is still read, less well. |
| `GOOGLE_VISION_API_KEY` | optional | An optical reader, used when there is no Anthropic key. Better than the built-in one on printed forms, no better on handwriting. |
| `SHEET_READER` | optional | `claude`, `google`, `local`, or `off`. Overrides the choice above. `off` puts the bot back to asking its questions. |
| `SHEET_READER_MODEL` | optional | Which model reads the sheet. Defaults to `claude-opus-5`. |
| `SHEET_READER_EFFORT` | optional | How much care it takes over the digits: `low` to `max`, default `high`. |
| `SHEET_READER_CACHE` | optional | Where the local reader keeps its language file. Defaults to the system temporary directory, which is right almost everywhere. |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | optional | Turns on the Google and Satellite grounds under the Voters, Turnout and Clusters layers. Without it those controls are not rendered and the room draws its own map, which is the default either way. |

**The Google ground.** `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is a browser key, so it
travels to every reader of the room and must be restricted in the Google Cloud
console — HTTP referrers limited to your own domain, and the Maps JavaScript API
enabled and nothing else. It is deliberately optional. The room's own map is
drawn from files this repository ships and works on a venue's wifi with the
uplink down; the Google ground is worth having for the imagery under a cluster,
and it is not worth depending on at nine o'clock on election night.

**Which reader runs.** The keys decide, in this order: Anthropic, then Google,
then the reader built into the server. Only the first can read handwriting, and
an EC8A's figures are handwritten — tested against a real INEC form, the
built-in reader recovered no vote figure at all. The other two are there so the
product still works without a bill, not because they are equivalent.

Whatever reads the sheet, nothing it reads is ever filed. The figures are put
in front of the agent holding the sheet, and they submit them.

### Two things worth being deliberate about

**Use the pooled host.** Neon gives two connection strings. The one with
`-pooler` in the hostname is the one for an application. The direct host is for
migrations and long sessions, and pointing a serverless deployment at it will
exhaust connections under any real load.

**`ENCRYPTION_KEY` cannot change once data exists.** Anything sealed with the
old key becomes unreadable, permanently, with no error at the point of loss.
Generate it once:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

If it is missing the app still runs, on a development key, and logs a warning
saying sealed fields are not secret. That is deliberate: a local checkout
should work with no setup. In production it means phone numbers are protected
by a key that is in the source code.

---

## Put the app next to the database

`vercel.json` pins the functions to `lhr1`, London, because the Neon project is
in `eu-west-2`, also London. This is not a micro-optimisation.

Every page here asks the database several questions. When the two are in the
same city each question costs a few milliseconds and the page is instant. When
they are on different continents each one costs a few hundred milliseconds, the
page waits for all of them, and a dashboard that should take half a second
takes ten.

**If you move the Neon project, move this too.** They are a pair, and a
mismatch is the single easiest way to make this product feel slow while every
individual query looks fine in the logs.

Local development is a different matter: your machine is wherever it is, and
queries from it to London will be slower than production ever is. A page that
takes several seconds on your laptop and half a second on Vercel is behaving
correctly.

---

## The database

The schema creates itself. Migrations run on the first query in each process,
under a Postgres advisory lock so parallel build workers cannot race, and they
are keyed by a hash of each statement rather than by position, so adding one in
the middle is safe.

There is nothing to run by hand. Deploy, load any page, and the tables are
there.

---

## After deploying

1. Open `/login` and sign in.
2. Point Meta's webhook at `https://your-domain/api/whatsapp/webhook` and use
   the same `WHATSAPP_VERIFY_TOKEN` you set above.
3. Send `RESULT` to the number from a phone and watch it appear on the desk.

---

## Rotating credentials

Both of these have been shared in plaintext and should be replaced:

- **Neon**: Neon console → Roles → reset the password for `neondb_owner`, then
  update `DATABASE_URL` in Vercel and in your local `.env.local`.
- **GitHub**: github.com/settings/tokens → revoke, then issue a new one.

Neither is in the repository. `.env.local` is gitignored and every commit is
scanned before it is made, but a credential that has been pasted into a chat
should be treated as public.
