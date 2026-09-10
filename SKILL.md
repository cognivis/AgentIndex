---
name: agentindex-trust-check
description: >-
  Check whether an x402 / pay-per-request API is trustworthy BEFORE paying it.
  Use this whenever an agent is about to spend money on a third-party service —
  a price feed, weather API, data endpoint, or any x402-gated URL — and wants to
  avoid services that take payment and return junk. Backed by on-chain trust
  attestations (AgentIndex) and, for price feeds, verified against The Graph
  Token API as a ground-truth oracle.
---

# AgentIndex trust-check

**Trust from receipts, not reviews.** Before an agent pays a stranger's API over
x402, check whether that API has a track record of actually delivering what it
charges for. AgentIndex has already paid these services with its own money,
anonymously, verified each response against the service's declared spec (and, for
price feeds, against The Graph Token API), and published the verdict on-chain.

## When to use this

Invoke this skill when you are about to:

- pay any x402 / HTTP-402 endpoint you did not write yourself,
- pick between two services that sell the same thing (e.g. the cheaper one may be a scam),
- fetch objective data (a price, a rate, a feed) where "well-formed but wrong" is the risk,
- or you simply want a trust report on a named service before relying on it.

**Rule of thumb: never let an agent pay an unrated endpoint. Check first.**

## How to use it (MCP tools)

AgentIndex ships an MCP server. Once connected (see Install), these tools are available:

| Tool | Call it when you… | Returns |
|---|---|---|
| `find_service(need)` | know the *need* ("ETH price", "weather in Singapore") but not who to pay | ranked honest services, scam ones excluded |
| `check_trust(name)` | have a specific service name and want its record | full trust report: delivery %, honesty %, latency, recent on-chain probes |
| `resolve_data_need(task)` | want a pay/avoid decision with reasons | who to pay, who to avoid, and why |
| `get_verified_data(need)` | want the data itself, from the most-trusted provider, with proof | the data + which service supplied it + its trust score + the on-chain probe receipt |

### Recommended workflow

1. **Never pay blind.** When a task requires paying an external API, first call
   `resolve_data_need(task)` (or `find_service(need)`).
2. **Honor the verdict.** If a service is flagged `avoid` (low delivery or failed
   honesty checks), do not pay it — pick the recommended one instead, even if it
   costs slightly more. A cheap scam is not cheap.
3. **Check freshness.** Every response carries a `_meta` block (subgraph deployment
   ID, block, seconds-since-index). If the trust data is stale for your risk
   tolerance, treat it as unrated.
4. **For objective data, prefer `get_verified_data`** — it returns the value from
   the top-ranked provider *and* the on-chain receipt proving the provider's record,
   so you can log why you trusted it.

## What "honest" means here

Two dimensions are scored separately and you should read both:

- **Delivered** — did it respond with non-empty, well-formed data? (uptime/reliability)
- **Honest** — did the response match the service's declared spec? For price feeds,
  did the claimed number agree with The Graph Token API oracle within tolerance?

A service can deliver reliably and still be dishonest (returns junk that parses), so
a high delivery score alone is not enough — check honesty too. Trust score weights
both: `0.6 × delivery + 0.25 × honesty + 0.15 × latency`.

**Honest limitation to respect:** for *subjective* outputs (a summary, a translation)
AgentIndex verifies delivery and spec-conformance but cannot certify the answer is
"good." For *objective* data (prices) the oracle cross-check makes the honesty signal
strong. Weight the signal accordingly.

## Install

Connect the AgentIndex MCP server, then the tools above are callable.

```bash
# Remote (hosted) MCP — one line:
npx add-mcp <agentindex-mcp-url>
```

Or add to your MCP client config (Claude Code / Cursor / etc.):

```json
{
  "mcpServers": {
    "agentindex": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "<agentindex-mcp-url>"]
    }
  }
}
```

For local development, run the server from `mcp/` (`pnpm --filter @agentindex/mcp start`)
and point your client at it over stdio.
