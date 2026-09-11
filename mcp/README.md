# AgentIndex MCP

Four tools let an AI agent check x402 providers before paying:

- `find_service`
- `check_trust`
- `resolve_data_need`
- `get_verified_data`

## Local stdio

From the repository root:

```sh
pnpm --filter @agentindex/mcp dev
```

## Streamable HTTP

Set `PUBLIC_MCP_URL` to the public origin (without `/mcp`) and optionally set
`MCP_PORT` (default `8787`), then run:

```sh
pnpm --filter @agentindex/mcp http
```

The process exposes:

- `POST /mcp` — stateless Streamable HTTP MCP
- `GET /.well-known/mcp.json` — discovery manifest
- `GET /health` — deployment health check

The included `Dockerfile` uses the repository root as its build context:

```sh
docker build -f mcp/Dockerfile -t agentindex-mcp .
```

After deployment, clients can install it with:

```sh
npx add-mcp https://YOUR_HOST/mcp
```

Replace the placeholder URL in `server.json` before submitting it to an MCP
registry. Do not publish the template as-is.
