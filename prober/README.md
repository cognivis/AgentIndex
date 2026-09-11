# AgentIndex prober

The prober pays x402 services, checks their declared response shape, applies the
strongest verification available, and publishes the final verdict on Sepolia.

## Verification strength

1. Delivery and required-field checks apply to every service.
2. The Graph Token API oracle checks objective crypto prices.
3. Same-symbol provider consensus identifies median outliers when three or more
   comparable providers are available. A two-provider disagreement stays
   neutral because there is no defensible majority.
4. The subgraph aggregates the service's track record across probes.

Subjective output such as summaries or translations cannot be proven correct by
an oracle. AgentIndex reports delivery, spec compliance, latency, and track
record for those services without claiming semantic truth.

## External Base probes

External spending is opt-in, one-shot only, and limited to explicitly adapted
providers:

```sh
PROBE_EXTERNAL=1 EXTERNAL_FEED_ALLOWLIST=tickersfeed,onchain-query-api \
  pnpm --filter @agentindex/prober run once
```

Do not enable a provider until its adapter and response schema have been
reviewed. The payment client independently enforces:

- Base mainnet only;
- canonical Base USDC only;
- at most $0.01 per payment;
- at most $0.05 per round by default;
- at most $0.10 per UTC day by default;
- persistent daily accounting in a local, gitignored mode-0600 ledger.

Configuration can lower these limits. Hard ceilings prevent configuration above
$0.10 per round or $0.25 per day.

Directory metadata is used only for discovery and payment terms; AgentIndex
does not reuse directory ratings. Data source attribution: x402-list.com,
licensed CC BY 4.0.
