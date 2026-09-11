FROM node:22-alpine AS workspace

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY api/package.json ./api/package.json
COPY demo-agent/package.json ./demo-agent/package.json
COPY mcp/package.json ./mcp/package.json
COPY prober/package.json ./prober/package.json
COPY services/package.json ./services/package.json
COPY subgraph/package.json ./subgraph/package.json
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile

COPY api ./api
COPY mcp ./mcp
COPY prober ./prober
COPY services ./services
COPY web ./web

FROM workspace AS web
RUN pnpm --filter @agentindex/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@agentindex/web", "start"]

FROM workspace AS mcp
EXPOSE 8787
CMD ["pnpm", "--filter", "@agentindex/mcp", "http"]

FROM workspace AS api
EXPOSE 4030
CMD ["pnpm", "--filter", "@agentindex/api", "start"]

FROM workspace AS services
EXPOSE 4021
CMD ["pnpm", "--filter", "@agentindex/services", "start"]

FROM workspace AS prober
VOLUME ["/app/.agentindex"]
CMD ["pnpm", "--filter", "@agentindex/prober", "start"]
