# Pinnacle Summit Q&A

The Summit addition uses the existing React/Vite website, PNCL Supabase project
`dpnajpojbxgsckwrmvnm`, and the existing PNCL Vercel project. It does not replace
the homepage or use a separate hosted site.

## Routes

- `https://thepncl.com/summit` — presentation screen and high-contrast QR.
- `https://thepncl.com/summit/ask` — anonymous, mobile-friendly question form.
- `https://thepncl.com/summit/presenter` — public ranked questions, originals, and slides; no sign-in required.

The apex domain follows the site's existing redirect to `www.thepncl.com`.
The QR asset encodes the exact canonical ask URL above.

## Persistence and live updates

`summit-submit` validates requests and commits each original question to Postgres
before returning confirmation. It stores no name, email, portal user ID, IP, or
fingerprint. A random browser identifier provides an eight-submissions-per-minute
throttle. It is a basic accidental-spam guard, not strong bot protection.
Each request carries an idempotency ID; retrying a lost response doesn't inflate
counts. The original text is retained without rewriting.

`summit-presenter` intentionally allows signed-out visitors to read all Summit
groups, counts, and original submissions, including questions awaiting grouping.
The ask form explains this public visibility before submission. The endpoint
exposes only the Summit summary and paginated originals; service-role and OpenAI
credentials remain server-side. Raw tables and RPCs remain inaccessible to
anonymous and ordinary authenticated clients. Other PNCL access rules are unchanged.
The dashboard polls the server every three seconds, also refreshing on window
focus and retrying connection errors. An atomic summary snapshot includes every
group and count; unchanged snapshots return a small revision response. Originals
are fetched only when expanded, automatically following 200-row cursor pages
until all originals are shown. New arrivals append after the last loaded cursor.
There is no top-three cap and no REST 1,000-row truncation.

Table mode remains live during collection and processing. Slides become available
when at least one group exists and the pending count is zero. Entering slides
captures all groups in descending-count order. Every group gets one slide with
rank and count. Arrow keys and Previous/Next navigate without auto-advance; Escape
returns to the live table. Fullscreen is optional. Refresh order is an explicit
action. New polling results never replace the current slide or reorder its
snapshot. There is no submission-closing workflow.

## Semantic processing

The server calls OpenAI's Responses API with structured JSON output. The default
model is `gpt-4.1-mini`; optional `SUMMIT_OPENAI_MODEL` overrides it. `OPENAI_API_KEY`
must exist only in Supabase Edge Function secrets, never a `VITE_*` variable.
OpenAI response storage is disabled (`store: false`). Attendee text is supplied
as untrusted input, never as instructions.

A durable pending queue and a fenced, expiring database lease serialize semantic
grouping. Each batch includes up to 100 questions. Existing groups are considered
in pages of 100 with no group-rank cutoff; unmatched questions are then grouped
with one another. When there are at most 100 existing groups, matching and new
grouping happen in one API call. Compact integer output is constrained to exactly
one valid group index per input, reducing output tokens. Representatives are
actual original questions. Every model
result is validated for complete, unique assignments and valid group references
before its atomic database commit. Counts are calculated from the originals,
not supplied by AI or maintained with lossy client increments.

Submission wakeups are coalesced to at most one per five seconds. Presenter polling
can also wake the worker. A one-minute cron job independently recovers pending
work even when no presenter is open. It authenticates with an expiring single-use
token, not a secret embedded in SQL. Failed batches back off for 30 seconds;
abandoned leases expire after 120 seconds. The presenter sees the pending count
and can expand saved pending originals if AI is delayed. No keyword fallback is
used. A worker performs bounded work for at most 110 seconds, below Supabase's
150-second free / 400-second paid wall-clock limits.

## Deployment and checks

Apply the Summit migration, then deploy only the new endpoints:

```sh
supabase functions deploy summit-submit summit-presenter summit-worker --project-ref dpnajpojbxgsckwrmvnm --use-api
```

Use the existing GitHub/Vercel branch-preview workflow for frontend review. Push
the approved release to the existing production branch when ready. No new Vercel
project or domain configuration is needed.

```sh
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

The SQL test in `supabase/tests/summit_questions.sql` runs in a transaction and
rolls back its fixtures. It requires an empty Summit database. It checks retry
idempotency, concurrent-worker exclusion, assignment completeness, rank ordering,
original retention beyond 1,000 submissions, and access restrictions. React tests
cover validation, honest confirmation, retry identity, all groups, expansion,
rank changes, automatic polling, and pending visibility. HTTP access tests verify
signed-out summary and original-question reads, cursor validation, and rejected
mutation actions. Grouping contract tests
use fixtures and must not be represented as a live semantic-quality evaluation.

## Capacity evidence (November 9, 2026)

User target: approximately 2,000 questions in the busiest minute. Acceptance
confirms committed storage and never waits for AI. Grouping may finish afterward.

An isolated PostgreSQL 14 database with the actual Summit SQL functions, a Node
HTTP intake adapter, and a 20-connection pool accepted 2,000 unique questions over
60 seconds plus 100 concurrent retries. Results: 2,100 successful requests, zero
errors, exactly 2,000 durable records; p50 2.51 ms, p95 5.97 ms, p99 34.49 ms.
The surge produced only 12 worker wakes. Simulated provider-429 and expired-lease
tests retained every original and recovered the queue; 20 test-assigned batches
drained all 2,000. Those drain assignments used a deterministic fixture, not AI.
The 25-group summary was 4,190 bytes, with originals excluded.

An additional local stress run sent 2,000 unique questions in one second plus
100 retries, again with zero errors and exactly 2,000 durable records. Its p95
was 74.74 ms, p99 86.93 ms, and maximum 90.62 ms; wake coalescing produced one
worker wake. This is also local evidence, not a hosted throughput guarantee.

Real OpenAI checks with `gpt-4.1-mini` verified nine semantic fixtures as five
groups (3/2/2/1/1), a later paraphrase joining an existing group, and a separate
100-question synthetic batch matching every expected group in 2.42 seconds.
The batch used 2,045 input / 204 output tokens. One earlier batch check caught
an incomplete assignment; the final schema now enforces exact length and an enum
of valid groups. The observed rate-limit headers reported 10,000 requests/minute
and 10,000,000 tokens/minute for this key/model at test time.

Twenty comparable batches project about 49 seconds of model time, plus database,
cron/worker handoff, retry, and network overhead. This is not a measured full-event
AI run. Longer questions, more than 100 distinct groups, provider load, changing
quotas, and payment/account restrictions can increase the drain time.

PNCL's hosted Supabase plan is Pro; observed database `max_connections` was 60
(23 in use at inspection). Edge Functions call the pooled REST/RPC API instead of
opening a new direct database connection per request. The local tests do not
prove hosted Edge capacity, end-user network reliability, or other production
workload headroom. No thousands-of-requests production load test was performed.
A representative staging rehearsal remains the strongest launch-readiness check.

The key provisioned for this event on November 9, 2026 was configured by its owner
with a seven-day expiration. Replace it in Supabase before it expires if Summit
will run later; originals remain saved if the key expires.
