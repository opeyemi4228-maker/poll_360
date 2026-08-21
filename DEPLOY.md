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
| `WHATSAPP_VERIFY_TOKEN` | for WhatsApp | Any string you also paste into Meta's webhook setup. |
| `WHATSAPP_APP_SECRET` | for WhatsApp | From the Meta app. Every delivery is signature checked against it. |
| `WHATSAPP_TOKEN` | for WhatsApp | Meta access token, used to send replies and download photographs. |
| `WHATSAPP_PHONE_ID` | for WhatsApp | The number's id in the Meta console. |
| `GOOGLE_VISION_API_KEY` | optional | Turns on reading result sheets from photographs. Without it the bot asks its questions instead. |

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
