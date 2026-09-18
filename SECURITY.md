# Poll360 security

What protects this product, what each defence is actually for, and the things it
deliberately does not do.

Written for whoever is responsible for a deployment. Every claim here is
something the code does; where a defence has a limit, the limit is stated rather
than left to be discovered.

---

## The threat this is built against

Not a generic web application's. Poll360 holds, on one night:

- **Figures somebody has a motive to change.** A vote total that is wrong by one
  booth in the right place is worth more than the whole system.
- **Names of people at risk.** Incident narratives say who did what at which
  polling unit. An agent named in one is a person somebody can find.
- **Evidence for a tribunal.** A photograph of Form EC8A before anybody read it,
  and the reading taken off it, eighteen months before anybody asks for them.

So the ordering is: **nobody may alter a figure**, **nobody may learn who an agent
is**, and **nothing may stop a return being filed** — including any defence listed
below. A security control that can take the count down has failed at the thing
the product exists for, which is why several of the controls here fail *open* and
say so.

---

## Who can be here at all

Two populations, two tables, two session systems, two cookies.

**Staff** — administrators, the situation room, the broadcast desk, upload desks —
sign in with an email or phone number and a password. **Polling unit
coordinators** sign in on their own domain with a code, and no password at all.

They are separate by construction, not by a flag: a coordinator's token is
meaningless to the staff lookup and a staff token is meaningless to the
coordinators', because neither function ever reads the other's table. The cost is
two of everything and it is paid on purpose — parameterising one module over a
table name would have turned a mistyped argument into a privilege escalation.

- Passwords: **scrypt**, from Node's own crypto, parameters stored in the hash so
  the cost can be raised later and old hashes still verify. Verified with a
  constant-time comparison, and verified even when there is no such account, so
  response time cannot be used to enumerate the register.
- Sessions: the cookie carries **an opaque random token and nothing else** — no
  user id, no role, no expiry the client can edit. The token is stored **hashed**,
  so a leaked database backup contains no usable session credentials, exactly as
  it contains no usable passwords.
- Cookies are `httpOnly`, `SameSite=Lax`, `Secure` in production, and carry the
  **`__Host-` prefix**, which a browser only accepts on a cookie that names no
  domain — so nothing on a neighbouring host can set a cookie this product will
  read. Sessions created before that change keep working until they expire;
  nobody was signed out for it.
- Every dashboard page calls `requireUser` as its **first statement**. Not in
  middleware, not in a layout a client route change can skip, never in the
  browser.

**Revocation takes effect within a few seconds, not instantly.** That is a
deliberate trade made for capacity and it is documented in
`lib/session-cache.js`: signing out is unaffected, and disabling an account or
revoking a session takes up to `SESSION_CACHE_SECONDS` (5 by default, `0` to
switch it off). Nothing else about a session is cached.

---

## What a browser is allowed to run

The content security policy is **enforced**, with a fresh nonce per request. It
was report-only for a long time, with an honest note saying it should be run for
a day and then switched on; that day never came, which is what always happens to
a header that has to be switched on by hand.

- `script-src` on every signed-in page is **`'nonce-…' 'strict-dynamic'`** and
  nothing else. No `'unsafe-inline'`, no `'unsafe-eval'` outside development.
- `connect-src 'self'` — the directive a stolen script would use to send what it
  read somewhere else.
- `form-action 'self'` and `base-uri 'self'` — an injected form cannot post a
  password elsewhere, and an injected `<base>` cannot rewrite where the real ones
  post to.
- **HSTS**, two years, subdomains included, preload. Without it the first request
  of every day is plain HTTP and the session cookie crosses a network in the
  clear before the redirect happens.
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` are
  `same-origin`, so another tab cannot hold a handle on this one.

**Four pages get a weaker policy**, and it is worth knowing which: the website,
sign in, sign up and the waiting-for-approval page are built once at deploy time,
so there is no request to make a nonce for and their policy has to allow inline
scripts. They hold no session and display nothing belonging to anybody.
`tests/security-headers.test.js` checks that the list of pages rendered per
request matches the list of pages kept out of shared caches — that test is what
found `/governors` missing from the second list.

**One outside origin is named, and only when a feature asks for it.** With
`NEXT_PUBLIC_GOOGLE_MAPS_KEY` set, the rooms can put Google's imagery under the
cluster layers; the Maps script loads fine under `'strict-dynamic'`, but its
tiles and its API calls would be refused by `img-src 'self'` and
`connect-src 'self'`. Those origins are added **only when that key is set**. A
deployment that does not use the Google ground — which is the default — gets a
policy that names nothing outside this origin at all.

**`frame-ancestors` is deliberately absent.** The broadcast board is *meant* to be
embedded in vMix and OBS. Framing is denied everywhere else by an
`X-Frame-Options` rule that names the exception.

---

## Rate limiting, and the bug it had

Every limit in this product was keyed on the first entry of `X-Forwarded-For`,
which is a value **the caller sends**. Set it to something different each time and
every request is a new caller: the limiter kept counting, kept firing, kept
looking correct, and stopped nobody. Eight attempts per account was unlimited
attempts per account for anybody who thought to try.

`lib/client-ip.js` now establishes an address by counting in from the right past
the proxies actually in front of this deployment, or by reading a header the
platform sets and strips. **Set `TRUSTED_PROXY_HOPS`** — 1 on Vercel. When an
address cannot be established, every such caller shares one bucket, which is
blunt and is the safe direction to be blunt in.

The counts also used to live in one process's memory, so on a platform running
forty instances there were forty budgets. They now live in Redis, or in Postgres,
or — if neither is configured — in memory, which the health screen reports as a
problem rather than hiding.

**The limiter fails open.** If the shared store cannot be reached it lets the
caller through, and the in-process limiter still applies underneath. A Redis
hiccup at nine o'clock on election night must not lock four thousand agents out
of the product.

Limits in force: 30 sign-in failures per address and 8 per account in ten
minutes; 10 agent-code attempts per address in fifteen minutes; 5 sign-ups per
address per hour; 3 access requests per address per day. **A successful sign-in
costs nothing** — only failures are spent — so six people arriving at one office
address do not burn a shared budget by turning up.

---

## The pipeline to Data Bank

Everything this product receives is also delivered to Data Bank, where it is
sealed and chained as evidence. That pipeline carried a shared key and nothing
else.

A key proves somebody knew the key. It does not prove **this body** was the body
that was sent, and it does not prove the request is **recent**. Anything able to
alter the body in transit could change a figure and the key would still check
out. *Evidence that can be altered in transit is not evidence.*

Every delivery is now **signed**: an HMAC-SHA256 over `<timestamp>.<body>`, the
timestamp carried alongside so a receiver can refuse anything older than five
minutes, compared in constant time. It is the same scheme this codebase already
uses between Poll360 and Agent360, because one scheme in a codebase is a scheme
people get right and two is a scheme people get right once.

The signature is an **extra header beside the key**, not a replacement, so it can
be deployed on either side first. Set `DATABANK_SIGNING_SECRET` to the same long
random string on both products.

The pipeline is also bounded, broken open when the hub is down, and drains its
own outbox — see [SCALE.md](SCALE.md) §2 for why each of those is a security
property as much as a performance one. Anything that did not land is kept with
the reason and can be sent again; **a hub that quietly missed four thousand
returns on the one night that mattered is worse than no hub.**

---

## What is encrypted, and what is not

Not everything, and the rule is stated rather than assumed: **aggregate figures
stay in the clear, and anything that identifies or endangers a person is sealed.**
A product that encrypted vote totals could not draw a map.

| Sealed | In the clear |
|---|---|
| Incident narratives (they name people and places) | Vote counts |
| Agent contact details | Coverage and timestamps |
| Result-sheet object keys | Unit codes |

**AES-256-GCM**, which authenticates as well as encrypts: a row tampered with in
the database fails to decrypt rather than quietly returning different plaintext.
For election evidence that distinction is the whole point — silent corruption is
worse than loud failure. A row that fails its check renders as
`[unreadable: this record failed its integrity check]` and never as the original
text.

Sealed values that have to be looked up by equality use a **keyed blind index**, so
a phone number can be found without the column being decryptable by anyone
without the key.

**`ENCRYPTION_KEY` is not optional in production** — the product refuses to start
without it. In development it falls back to a key printed in this repository and
warns loudly, because a deployment that inherits the development key is a
deployment with no encryption at all.

---

## What is written down

Every privileged action is appended to an audit log that is never updated. Each
entry carries who, what, the subject, and the caller's address — and, since the
address fix above, an address that could not be established is recorded as
`unverified` with the claimed value in the note, rather than written into the
record as though it were established. An address anybody could have typed is
worse than none in a tribunal: it looks like evidence.

The payment ledger is hash-chained and the chain is **walked on request** by the
health screen rather than cached, because a proof of integrity that was true ten
minutes ago is not what anybody came to that page for.

---

## The doors from outside

Every address the product answers on is declared in `lib/endpoints.js`, and
`tests/system.test.js` walks `app/api` at test time and fails if the two ever
disagree — so a route cannot be added without appearing on the screen that
describes it.

| | |
|---|---|
| `/api/whatsapp/webhook` | Signature-checked against `WHATSAPP_APP_SECRET` before the body is read. **Set it**: with a token but no secret, anybody who finds the address can file a situation report as any number, and the health screen calls that out. |
| `/api/export/results`, `/api/graphic`, `/api/lookup`, `/api/me`, `/api/media/[id]` | Signed-in session, narrowed to the ground and contest the account holds. |
| `/api/health` | **Open to anybody**, and the only one. A router cannot sign in, and an instance that has lost its database would otherwise keep answering a guarded check with 401 forever while the router concluded nothing was wrong. It prints a yes/no, a build id and a number of milliseconds — no key, no address, no figure from the count. The test suite requires any open door to carry a written explanation of why. |

---

## What this deliberately does not do

- **No public API key.** There is no anonymous read of any figure, photograph or
  person's details.
- **No open redirect.** The sign-in page never echoes a `next` parameter back into
  its redirect; a role's own home is where they land.
- **One error message.** Wrong password, no such account, disabled account: all
  answer *"those details do not match an account"*. Distinguishing them turns the
  form into a way of asking whether a phone number belongs to an agent.
- **Agents cannot sign in when Data Bank is unreachable.** This is designed
  behaviour — the agent list is not held here — and it is a hard dependency on
  polling morning. The form says so rather than calling a good code wrong, and an
  agent already signed in keeps filing.
- **No CAPTCHA, no device fingerprinting, no bot scoring.** They would fire on the
  one population this product cannot afford to obstruct: somebody standing at a
  booth, on a cheap handset, on a shared mobile network, at nine at night.

---

## Reporting something

Security issues in this product should go to whoever runs the deployment before
they go anywhere else. There is no bug bounty and no public disclosure process;
the product is operated by a named organisation for a named election.

---

## Checking the posture of a deployment

Open **Administration → System health**. The card headed *What is protecting this
deployment* reads the environment and names anything configured in a way that
looks like working and is not — a sealing key that is a placeholder, a pipeline
nobody can prove was not tampered with, a sign-in limit that is per instance,
WhatsApp accepting unsigned deliveries.

Every item on it is a setting whose absence changes nothing anybody can see. That
is the whole reason it needs a screen.
