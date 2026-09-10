# AgentIndex

**A credit bureau for AI agents that pay APIs.**

AI agents now pay strangers' APIs autonomously over x402 (HTTP 402, pay-per-request).
Some of those APIs take the money and return junk. Agents have no way to know who is
honest — reviews can be faked, and there is no human in the loop to notice. **AgentIndex
pays the APIs itself, anonymously, verifies each response against the service's own
declared spec, and publishes an on-chain trust score that any agent can check before it
spends a cent.**

> **Trust from receipts, not reviews.**

A credit bureau needs three things, and each maps to one of our sponsors:

| A credit bureau needs… | AgentIndex uses… | Sponsor |
|---|---|---|
| an **identity** for every entity it rates | an **ENSv2 name** per service, owning its own manifest via a permissioned resolver | **ENS** |
| a **payment history** built from real behavior | **real HBAR probes over x402** on Hedera testnet, with a hard spend cap | **Hedera** |
| a **database + a way to pull a report** | a **live subgraph** for scores + an **MCP server** agents query | **The Graph** |

- **Live demo:** _<hosted URL — fill on deploy>_
- **Demo video (≤4 min):** _<link>_
- **Repo:** https://github.com/cognivis/AgentIndex

---

## The problem, concretely

An agent needs weather data. Two services offer it:

- **weatherpro** — honest, ~99% delivery, slightly pricier
- **scamco** — **the cheaper one**, takes payment and returns empty/junk (~12% delivery, 0% spec match)

A naive agent optimizes for price and **pays the scam**. AgentIndex catches it: it has
already paid both services with its own money, seen scamco fail, and tells the agent
**"pay weatherpro, avoid scamco"** — with on-chain receipts proving why.

## How it works (the pipeline)

```
Service registers    →   Prober pays it    →   Prober attests    →   Subgraph indexes   →   Agent queries
(ENSv2 subname +          (real HBAR over       (verdict on-chain,     (trust score,          (MCP tools /
 manifest text records)   x402, spend-capped)   Sepolia)               freshness _meta)       x402 API)
        │                        │                     │                     │                      │
      ENS                     Hedera              Sepolia/ours          The Graph            The Graph + Hedera
```

The prober is anonymous — services can't tell a probe from a real customer, so they can't
cheat only the auditor. **"Delivered"** (did it respond?) and **"honest"** (did the response
match its declared spec?) are scored separately; a service that delivers junk is the scam
case. Trust score = `0.6 × delivery + 0.25 × honesty + 0.15 × latency`, all in basis points,
computed in the subgraph.

## The seeded index (6 services, each a real x402 endpoint)

| Service | Sells | Behavior | Teaches |
|---|---|---|---|
| weatherpro | Weather | Honest, fast, ~99% | the hero / "pay this" |
| **scamco** | "Weather" | **Planted scam**, ~12%, 0% spec match | the "avoid this" catch |
| pricefeed | Token prices | Honest | clean happy path |
| summarize | Text summaries | Honest but slow | latency dimension |
| geocode | Geocoding | Honest, ~85% flaky | "usable, retry — don't distrust" |

---

## What we integrated, per sponsor

### ENS — Best Use of ENSv2
**Each service in the index is an ENSv2 name that owns its own trust identity.** We deployed
our own **subname registrar** and **permissioned resolver** on Sepolia (built on the real
`ensdomains/contracts-v2` interfaces, following ENS's own tutorial), and every service is a
revocable subname of `agentindex.eth`.

- **Service manifests live entirely in ENS text records** — `url`, `description`,
  `x402:method`, `x402:price`, `x402:spec`. The prober reads the endpoint and the spec to
  verify against **straight from ENS**, not from our own database. ENS *is* the registry.
- **Permissioned resolver:** each subname owns its own records via role-based access — a
  service can publish its manifest but can't touch anyone else's. This is a direct use of
  ENSv2 Enhanced Access Control.
- **Revocable subnames as enforcement:** delisting a caught scam = revoking its subname
  on-chain, and it drops out of the index. (Demonstrated live in the video via `delist`.)
- **Hits their explicit bonus** — "agents/services as namespaces, each with their own
  identity and permissions": every rated entity is exactly that.
- **Functional, not hard-coded:** registration is a live on-chain write during the demo
  (`/register` → commit-reveal + 5 `setText` calls), and reads come back off the resolver.

Key contracts (Sepolia): ServiceRegistrar `0xdeB458892c7702Fe0112161EEa28C0F46eFd6379` ·
PermissionedResolver `0xDEb75A113E4A072F182bAF24B14B148Fe6377416` ·
UserRegistry `0xEFb0a4696145598C9d4d74df15Dd5D3CaAeD2F9D`.

**Feedback for ENS:** PublicResolverV2 authorizes via the v1 NameWrapper, which is a dead end
for v2-native names — we had to route authorization differently. Worth documenting for other
v2 builders.

### Hedera — AI & Agentic Payments
**The trust data is built from real money moving on Hedera.** The prober pays each service a
real HBAR x402 payment on Hedera testnet, settled through the **Blocky402 facilitator**, then
verifies what it got back.

- **At least one real paid request, end to end:** first settled probe tx
  `0.0.7162784@1788780226.792924152`; the prober has run continuously on a 15-min cycle since
  Sep 7. The dashboard shows real payment receipts (HashScan links).
- **Fund-safety by design (their hard requirement):** the prober wallet uses `setSpendControls`
  — an HBAR allowlist and a **1 HBAR per-request cap** — so it is *impossible* to drain it
  even if a malicious service tries. Payer and payee are separate accounts so payments don't
  net to zero. This is our answer to "agents must not risk user funds."
- **The x402 rail is two-sided:** the same Hedera x402 flow gates our own trust API (agents
  pay us per query), so the payment standard runs in both directions.

**Feedback for Hedera:** x402 client spend-controls reject non-default assets until
`setSpendControls` is called explicitly; and payer==payee silently nets to zero. Both cost us
debugging time — worth a note in the Blocky402 quickstart.

### The Graph — Composable Subgraph + AI Tooling
**The trust score is a live subgraph query, and the MCP server is reusable AI tooling other
agents plug into** — which is exactly their AI Tooling track (MCP servers, x402 payment tooling).

- **Live data, meaningful work:** our subgraph (`agentindex-sepolia`) indexes registration and
  attestation events from Sepolia and computes each service's delivery/honesty/latency and
  trust score on-chain-derived, in real time — no mocked or static data. The MCP tools reason
  over it (rank, decide pay/avoid), they don't just print a raw query.
- **Reusable infrastructure, not a single app:** the **AgentIndex MCP server** exposes four
  tools any agent (Claude, Cursor, etc.) can call —
  - `find_service(need)` — ranked honest services for a need
  - `check_trust(name)` — a full trust report for one service
  - `resolve_data_need(task)` — task → who to pay / who to avoid, with reasons
  - `get_verified_data(need)` — the data itself from the most-trusted provider, returned
    with its trust score and latest on-chain probe receipt as proof
  It also ships as a **SKILL** (`SKILL.md`, Claude Code plugin format): "trust-check before
  paying any x402 service."
- **Freshness as a first-class citizen:** every MCP response carries a `_meta` block —
  subgraph deployment ID, current block, and seconds-since-index — so an agent knows how fresh
  the trust data is before trusting it.
- **Composability — two Graph products compose to produce a verdict.** For objective-data
  services (price feeds), the prober pays a real x402 feed, then cross-checks the number it
  returns against the **Graph Token API as a ground-truth oracle**; the pass/fail folds into the
  service's on-chain honesty score, which our **subgraph** then aggregates into its trust score.
  So a well-formed price that is simply *wrong* gets caught — Token API (the answer key) ⊕ our
  subgraph (the ledger) = a trust signal neither could produce alone. We rate real third-party
  feeds this way, not just our seeded set.

Subgraph query URL: `https://api.studio.thegraph.com/query/1759003/agentindex-sepolia/v0.0.1`.

---

## Repo map

| Path | What's there |
|---|---|
| `contracts/` | `ServiceRegistrar.sol`, `AttestationRegistry.sol` (Foundry, 27 tests) |
| `services/` | The 6 seeded x402 services (one Express app, `paymentMiddleware` per service) |
| `prober/` | Discovery → pay over x402 → verify vs spec → attest on-chain |
| `subgraph/` | Sepolia subgraph: registrations, attestations, trust scores |
| `mcp/` | MCP server + 4 tools (`find_service`, `check_trust`, `resolve_data_need`, `get_verified_data`) + `SKILL.md` |
| `api/` | x402-gated REST wrapper over the same query layer (1¢/trust query) |
| `web/` | Next.js dashboard: Playground, per-service evidence, /register, /connect (MCP console), /how |
| `demo-agent/` | End-to-end agent: task → MCP query → x402 payment to the honest service |

## Chains & addresses (all testnet)

- **Payments:** Hedera testnet, Blocky402 facilitator (`api.testnet.blocky402.com`)
- **Identity + attestations:** Sepolia (ENSv2 + our registry — one chain, one subgraph indexes both)
- AttestationRegistry `0x33406801acD2A16549462153261A224F779768CC`
- ServiceRegistrar `0xdeB458892c7702Fe0112161EEa28C0F46eFd6379`
- PermissionedResolver `0xDEb75A113E4A072F182bAF24B14B148Fe6377416`
- UserRegistry `0xEFb0a4696145598C9d4d74df15Dd5D3CaAeD2F9D`

## AI tool usage

Development was assisted by AI coding tools (Claude Code). All architecture decisions, the
trust model, contract design, and integration work were directed by the team; spec/planning
artifacts are in the repo. All code was written during the hackathon (From Scratch track).
