# Poll360 at scale

What this deployment can carry, what was changed to get it there, what to set
before a big night, and — the part most documents like this leave out — where
the ceiling still is.

Everything here is derived from the code or measured against the live database.
Where a figure is an estimate it says so.

---

## 1. The three numbers the product is shaped by

| | |
|---|---|
| **176,846** | polling units in Nigeria (INEC's published figure, enforced by `scripts/import-units.mjs`) |
| **5** | contests a booth can report — presidential, governorship, senate, representatives, assembly/LGA |
| **~884,000** | returns in a finished general election, which is 176,846 × 5 |

Every return can also produce two records at Data Bank — the photograph of Form
EC8A and the figures read off it — plus registrations, situation reports and
WhatsApp messages. **Ten million records across an election cycle is the right
order of magnitude**, and the storage and the pipeline are both sized for it.

Returns do not arrive evenly. They arrive in a **three-hour tail after polls
close**, and the busiest hour is the one everything below is designed around.

---

## 2. What was wrong, and what each fix bought

Five things decided whether this survived a busy night. None of them announced
itself — every one failed in a way that looks like the product working.

### The board read every row, on every refresh, for every viewer

`results.counted` returned every counted return and the totals were added up in
the application. For 447 rows against the live database that is **1,211 ms**, and
almost all of it is transferring the rows. At 884,000 rows it is not a slow page,
it is a page that does not finish.

Two changes:

- **`results.totals`** asks the database for the totals instead. Measured on the
  same data: **283 ms**, and — this is the point — that figure does not grow with
  the number of returns, because the rows never leave the database.
- **The answer is shared.** The figures on a board do not depend on who is
  looking, so the first person through the door pays for the query and everyone
  arriving in the next five seconds is handed what they got. Measured: a repeat
  read costs **1 ms** against 339 ms for the first. See `lib/cache.js`.

The second one is the one that matters most, because it breaks the link between
**how many people are watching** and **how much work the database does**. Load now
follows the number of *distinct questions* — a few dozen — not the number of
viewers.

### Narrowing the board to a place read the whole table

Rooms filter by ground, and `within()` writes that as
`substr(unit_code, 1, 5) IN (…)`. No plain index can serve a `substr` of a
column, so the database read every return in the project and tested each one.

An index **on the expression** fixes it. Verified with `EXPLAIN (ANALYZE)` against
the live database:

```
Index Scan using results_counted_by_lga on results
  Index Cond: ((election_id = …) AND (race = …) AND (substr(unit_code, 1, 5) = '25/07'))
  Execution Time: 0.047 ms
```

Twelve indexes were added in total. **Build them before deploying, not during**:

```
npm run db:indexes -- --check   # what is missing
npm run db:indexes              # build it, concurrently, no lock held
```

A plain `CREATE INDEX` blocks writes to the table until it finishes. On an empty
database that is instant; on a table holding a general election it is minutes of
agents unable to file, at boot. The script builds them without the lock. The
statements in `lib/db.js` then find them already there and do nothing.

### Every viewer refreshed at the same instant

A fixed twenty-second interval preserves whatever alignment it starts with, and
viewers arrive together — when a bulletin says the figures are in, when a shift
starts, when a link goes into a group. **A thousand viewers were not fifty
requests a second. They were a thousand in one second and nothing for nineteen.**

Each refresh now books the next one at a slightly different distance, so a crowd
that started together comes apart within a few cycles. The average interval is
unchanged. `lib/live-state.js`, and the arithmetic is tested.

The same component also stops asking when the device is offline, backs off when
refreshes are failing, and — this was a correctness bug as much as a load one —
now actually knows when a refresh finished. It previously waited 500 ms and
claimed success whether or not the server had answered.

### Every signed-in request was a database query

Reading who is asking from the database on every request is what makes revoking
a session take effect immediately, and it is the busiest query in the product.
At 100,000 people with a dashboard open it is 5,000 lookups a second before a
single figure has been counted.

The answer is now held for a few seconds per instance. **Read
`lib/session-cache.js` before relying on this** — it changes a stated guarantee,
and the file sets out exactly which cases move and which do not. Signing out is
unaffected; disabling an account takes effect within the window instead of on the
next click.

### The pipeline to Data Bank had no bound on anything

Forwarding a return to the hub is deliberately never awaited, so that a hub
having a bad night cannot become an agent who could not file. That was right and
it never meant the forward was free: each one holds a socket for as long as the
hub takes, and the hub's measured tail is ten seconds.

Unbounded, the busiest hour is every return of that hour in flight at once,
competing with the agents' own requests for the same file descriptors.

- **Sixteen in flight at a time**, with a bounded queue behind them. Anything past
  the queue goes to the outbox rather than into memory.
- **A breaker**: five consecutive failures and it stops calling for thirty
  seconds, doubling. Measured in the tests: forty forwards against a dead hub now
  cost five attempts, not forty.
- **The outbox drains itself**, oldest first, with a growing and jittered gap. It
  used to wait for somebody to run a script, which meant it waited until somebody
  noticed — and nothing visible happens when a forward fails.

---

## 3. What to set before a big night

| Setting | Why |
|---|---|
| `DATABASE_URL` / `DATABANK_DATABASE_URL` | Use the **pooled** connection string — the host with `-pooler` in it. Without it every instance opens its own connections and the database reaches its connection limit long before it reaches its capacity. The health screen says so if this looks wrong. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Where the sign-in limit is counted. Without them it falls back to Postgres, which is correct and costs a round trip; without a database it falls back to this process's memory, which is not a limit at all across instances. |
| `TRUSTED_PROXY_HOPS` | How many proxies sit in front of this deployment. **1 on Vercel.** Getting it wrong in one direction puts every caller in the world in one rate-limit bucket; in the other it lets anybody have a fresh one. |
| `DATABANK_SIGNING_SECRET` | Signs every delivery to Data Bank. The same long random string on both products. Deliveries keep working while only one end has it, so it can be rolled out in either order. |
| `SESSION_CACHE_SECONDS` | How long a session is recognised from memory. `5` in production by default, `0` switches it off. See §5. |
| `ENCRYPTION_KEY` | 32 random bytes, base64. The product refuses to start without it in production. |

Then open **Administration → System health**. The card headed *What is
protecting this deployment* reads the environment and names anything that is
configured in a way that looks like working and is not.

---

## 4. Where the traffic actually goes

```
                    the public internet
                            │
              ┌─────────────┴─────────────┐
              │   the platform's router    │   ← asks /api/health
              └─────────────┬─────────────┘      before sending work here
                            │
        ┌───────────┬───────┴───────┬───────────┐
     instance    instance        instance    instance      ← as many as the
        │           │               │           │            traffic asks for
        └───────────┴───────┬───────┴───────────┘
                            │
              ┌─────────────┴─────────────┐
              │  Postgres, pooled          │
              │  Redis, for shared counts  │
              └────────────────────────────┘
```

**There is no load balancer to configure.** On Vercel the platform routes to as
many instances as the traffic asks for, and the thing it was missing was a way to
ask an instance whether it was well. `/api/health` is that: it times a real query
and answers **503** rather than 200 when the database cannot be reached, which is
the signal anything in front of this acts on. It prints no key, no address and no
figure from the count, because a health endpoint cannot be signed in to.

Behind a load balancer of your own — nginx, HAProxy, a cloud balancer — point its
check at `/api/health`, treat any non-200 as unhealthy, and set
`TRUSTED_PROXY_HOPS` to the number of proxies in the chain.

Each instance keeps its own short-lived caches. That is deliberate: a shared
cache needs a network round trip to answer, and the whole value of these is
answering without one. The cost is that each instance warms separately, which at
five seconds is not a cost anybody can measure.

---

## 5. Where the ceiling is now

The honest part.

**Reading results scales.** Board figures are shared per instance, totals are
computed in the database, and the ground filter is an index scan. Adding viewers
adds instances; it does not add database work. This is the part that is genuinely
solved.

**Writing results scales.** A filed return is one indexed upsert. 884,000 of them
over a three-hour tail is an average of 82 a second with peaks several times
that, which is unremarkable for Postgres. The forward to Data Bank is off the
path and bounded.

**Signed-in request volume is the ceiling.** Every request from a signed-in person
still needs to establish who they are. With `SESSION_CACHE_SECONDS=5` and a
twenty-second refresh, *every poll is still a lookup* — the window is shorter
than the interval, so the cache helps page loads and navigations and not the
steady poll. The arithmetic:

- 10,000 concurrent dashboards ≈ 500 lookups/second — comfortable.
- 100,000 ≈ 5,000/second — needs the pooled connection and a database instance
  sized for it; reachable.
- 1,000,000 ≈ 50,000/second — **not reachable with this design as it stands.**

Two ways past it, in order of how much they change:

1. **Raise `SESSION_CACHE_SECONDS` to at least the refresh interval** (say `30`).
   Lookups then drop by roughly the ratio of the window to the interval. The cost
   is that disabling an account takes up to thirty seconds. That is a decision for
   whoever runs the deployment, which is why it is a setting and not a default.

2. **Serve the board to the public without a session.** A million people watching
   results are *readers*, not operators: they need the same figures as each other
   and none of them needs to be recognised. A public, CDN-cached results endpoint
   would be served entirely by the edge and would never reach an instance at all.
   That is the real answer for mass viewership and it is a **product decision, not
   an engineering one** — every board in this product is currently behind a
   sign-in on purpose. It has deliberately not been done unilaterally.

**Storage.** Photographs live in the database rather than in object storage — a
deliberate trade, recorded on the health screen, where the megabyte figure is
what decides when it has to stop being one. Ten million rows of results, audit
and intake records are fine; ten million photographs are not, and that is the
thing to watch.

---

## 6. How to check any of this yourself

```
npm test                          # 1,089 tests, no test dependency to install
npm run db:indexes -- --check     # every performance index, and whether it is there
curl -s localhost:3000/api/health # what one instance thinks of itself
POLL360_SQL_LOG=count npm run dev # a running count of queries per page
POLL360_SQL_LOG=1 npm run dev     # every statement with its timing
```

The last two are the fastest way to find the loop that should have been a join:
a page that takes thirty seconds against a database answering in three hundred
milliseconds is not a slow database.
