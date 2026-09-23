# Scalability: designing for 1,000,000+ concurrent users

Last reviewed: 2026-09-24 · Status: **TARGET / PLANNED design**

> One million simultaneous users is the **future design target**. It has **not** been load-tested.
> Every number in this document marked *illustrative* is an assumption for planning, not a measurement.
> The phases that get there are in the [roadmap](ROADMAP.md). The earlier detailed gate list is kept in
> [architecture/CAPACITY-AND-RELIABILITY.md](../architecture/CAPACITY-AND-RELIABILITY.md).

## 1. Define the load before sizing anything

"1M users" can mean three very different things. Each is measured separately.

| Measure | Definition | Why it matters |
|---|---|---|
| Registered accounts | Identities stored | Storage, identity-provider pricing, erasure workload |
| Monthly active users (MAU) | Distinct users active in 30 days | Identity pricing tiers, support load |
| **Concurrent users (the target)** | Users with an open session at the same moment | Connections, request rate, database throughput, cost |

A concurrent-user target also needs a **workload model**. The planning model below is *illustrative*:

| Activity (share of 1M concurrent) | Illustrative share | Load it creates |
|---|---|---|
| Browsing content, articles, doctor search | 60% | Mostly cacheable reads (CDN) |
| Signed in, dashboard and records | 30% | Authenticated reads, some writes |
| Booking or paying | 3% | Strongly consistent writes, payment calls |
| Chat or waiting room (WebSocket) | 5% | Long-lived connections, fan-out |
| Live video consultation | 1–2% | Media traffic through a media provider (not the API) |
| AI assistant queries | 1% | Expensive, rate-limited model calls |

*Illustrative request math:* if an active session averages one API call every 30 seconds, 1M
sessions produce about 33,000 requests per second. Planning for a 3× peak gives about **100,000
requests per second** at the edge, most of which must be served from cache.

## 2. Target architecture: regional cells

Scaling one giant shared backend makes every failure global. MediConnect's target shape is
**cells**: independent, identical copies of the stack, each with a hard size limit.

```text
                     Global DNS + CDN + WAF  (static assets, cached content, bot/DDoS filtering)
                                   │
                 ┌─────────────────┴──────────────────┐
             US region                            EU region            ← data never crosses
          ┌──────┴──────┐                     ┌──────┴──────┐
        Cell US-1   Cell US-2 …             Cell EU-1   Cell EU-2 …    ← each cell ≤ N users
   (API pods, WebSocket pods, workers, cache, queues; own quotas and limits)
                 │                                   │
     Regional data layer (DynamoDB, S3, KMS, Cognito, Redis) with per-cell partition keys
```

- A thin **cell router** maps each tenant or user to a cell inside the user's legal data region.
- Cells are sized from load-test results (for example *illustratively* 100,000 concurrent users per
  cell, so 1M needs about 10 cells plus spare capacity).
- A bad deploy or overload affects one cell, not every user. New releases go to one cell first.
- Adding capacity means adding cells, not making one system ever bigger.

Status: **PLANNED**. Today's Kubernetes templates (1–5 replicas per service) are a small historical
footprint and are **not** million-user sizing.

## 3. Layer by layer

| Layer | Target design | Main bottleneck to watch |
|---|---|---|
| Edge | CDN for the web app, images, video posters and published CMS content; WAF and rate limits at the edge; HTTP/2 and HTTP/3; long cache lifetimes for hashed assets | Cache hit ratio. Every miss becomes origin load. |
| Identity | Cognito regional user pools; token verification locally using cached public keys (no network call per request) | Identity-provider API request-rate quotas for sign-in and token refresh must be raised ahead of launches. |
| API compute | Stateless containers on Kubernetes with horizontal autoscaling on request rate and latency, not only CPU; spread across three availability zones | Per-pod throughput (must be benchmarked), cold start and connection pools. |
| Real-time | Dedicated WebSocket tier separate from REST pods; connection draining on deploy; shared pub/sub for fan-out; heartbeats and idle timeouts | Connections per pod and memory. *Illustrative:* 25,000 connections per pod → about 40 pods for 1M plus headroom. |
| Video | Managed WebRTC media service (Amazon Chime SDK in the retained code); API only issues join tokens | Media-provider concurrency quotas and cost per participant-minute. |
| Data | DynamoDB on-demand with high-cardinality partition keys (user or tenant ID); no table scans on hot paths; pagination everywhere; conditional writes for bookings | Hot partitions. A single partition key serves about 3,000 reads and 1,000 writes per second, so popular doctors' calendars need sharded keys. |
| Caching | Redis cluster per cell for sessions, rate-limit counters, doctor availability and AI answer cache (tenant-safe keys, no PHI in shared cache keys) | Cache stampede on expiry. Use request coalescing and jittered TTLs. |
| Async work | SQS or Kafka between services; idempotent consumers; dead-letter queues; bounded retries with backoff | Queue age and consumer lag alarms. |
| Search | Dedicated search index for doctors and articles instead of database scans | Index refresh lag. |
| AI | Per-tier quotas, concurrency caps, response caching, graceful "assistant unavailable" state, never a fake answer | Provider rate limits and cost. AI must never be on the critical path of booking or records. |
| Payments | Stripe with idempotency keys on every write and webhook replay protection | Duplicate charges under retries. Needs a transactional outbox and reconciliation job. |
| Files and imaging | Direct-to-S3 pre-signed uploads, virus scanning, asynchronous DICOM processing | Large uploads must never pass through API pods. |

## 4. Rules that make scaling safe

1. **Stateless services.** No user session in pod memory. Any pod can serve any request in its cell.
2. **Idempotency everywhere.** Every create, pay or book operation takes a client operation key and is safe to retry.
3. **Backpressure, not collapse.** When a dependency is slow, shed low-priority load (analytics, AI) first and return clear "try again" responses.
4. **Timeouts and circuit breakers** on every outbound call, with budgets smaller than the caller's timeout.
5. **No cross-region data calls** on the request path. EU requests are served entirely in the EU.
6. **Priority order under stress:** sign-in and records access, then booking, then messaging, then content, then AI.

## 5. Proving it: the load-test plan

Capacity is only claimed after these tests pass on the same release and configuration that will run in production.

| Test | Goal | Pass condition (TARGET) |
|---|---|---|
| Per-service benchmark | Find sustainable requests per second per pod | p95 < 300 ms, p99 < 800 ms, error rate < 0.1% at the measured rate |
| Ramp to 1 cell | Validate a full cell at its design size | All SLOs held for 60 minutes |
| Multi-cell 1M soak | Run the full workload model at 1M concurrent for 4+ hours | SLOs held; no memory growth; queue age bounded |
| Spike | 3× traffic within 60 seconds | Autoscaling reacts; shedding protects critical journeys |
| Failure injection | Kill a zone, a cell, the cache, and the AI provider | Critical journeys stay within SLO; no data loss; no duplicate bookings or charges |
| Regional isolation | Force EU traffic with US-only failures | EU users unaffected; no cross-region data flow |

Tools: k6 or Locust for HTTP and WebSocket load, synthetic users and synthetic data only, and a
separate load-generator fleet so the test tool is not the bottleneck. The offline calculator in
`scripts/capacity-plan.mjs` converts measured per-pod throughput into replica counts; it refuses to
guess when a measurement is missing.

## 6. Cost awareness

Running 1M concurrent users is a large, continuous cloud bill (compute, data transfer, identity,
video minutes, AI tokens). No cost figure is published here because none has been measured. Before
any scale test, the operator produces a priced plan from current provider pricing and approves it
explicitly. Scale-to-zero development environments and per-cell budgets keep idle cost bounded.

## 7. Current gaps before any scale claim

- No load test of any kind has been run against the backend.
- Per-service throughput is unmeasured, so replica counts cannot be calculated yet.
- Booking and payment idempotency, outbox and reconciliation are open work items.
- The rate limiter falls back to per-process memory if Redis is unavailable. That must change before multi-pod production.
- Cell routing, per-cell quotas and search are not implemented.
