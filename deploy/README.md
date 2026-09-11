# Hostinger VPS deployment

This deployment runs the dashboard, MCP, trust API, seeded services, and seeded
prober on one VPS. Caddy terminates TLS and routes four public subdomains.

## Prerequisites

- Hostinger **VPS** with Docker Engine and Docker Compose v2
- four DNS `A` records pointing to the VPS IPv4 address
- inbound TCP ports 80 and 443 open
- the repository checked out on the VPS

Production DNS names:

- `agentindex.craftyour.site` — dashboard
- `mcp-agentindex.craftyour.site` — MCP
- `api-agentindex.craftyour.site` — x402 trust API
- `services-agentindex.craftyour.site` — seeded x402 services

## Environment

Keep a root `.env` on the VPS only. Start from `.env.example` and add these
deployment values without committing the file:

```dotenv
WEB_DOMAIN=agentindex.craftyour.site
MCP_DOMAIN=mcp-agentindex.craftyour.site
API_DOMAIN=api-agentindex.craftyour.site
SERVICES_DOMAIN=services-agentindex.craftyour.site
PUBLIC_MCP_URL=https://mcp-agentindex.craftyour.site
```

The Compose file passes only the variables each container needs. In particular,
the web and MCP containers never receive payment or signing keys. Public
registration is disabled because it would otherwise require a deployer key in
the web container.

## Build and launch

Run these commands yourself on the VPS:

```sh
docker compose -f compose.production.yml config
docker compose -f compose.production.yml build
docker compose -f compose.production.yml up -d
docker compose -f compose.production.yml ps
```

The recurring prober is intentionally behind the `worker` profile, so the first
launch cannot spend while DNS and ENS records are still being checked. After
the service manifests point to the new public services host, start it with:

```sh
docker compose -f compose.production.yml --profile worker up -d prober
```

Do not enable external probes in that long-running worker. It is pinned to
`PROBE_EXTERNAL=0`; Base payments remain deliberate one-shot operations.

## Verification

```sh
curl -fsS https://agentindex.craftyour.site/
curl -fsS https://mcp-agentindex.craftyour.site/health
curl -fsS https://mcp-agentindex.craftyour.site/.well-known/mcp.json
curl -fsS https://api-agentindex.craftyour.site/health
curl -fsS https://services-agentindex.craftyour.site/health
```

After all checks pass, replace the placeholder remote URL in `mcp/server.json`,
update the ENS service manifests to the public services URL, and validate all
four MCP tools from a clean client.
