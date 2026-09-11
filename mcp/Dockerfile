FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY mcp/package.json ./mcp/package.json
RUN pnpm install --frozen-lockfile --filter @agentindex/mcp...

COPY mcp ./mcp

ENV NODE_ENV=production
ENV MCP_PORT=8787
EXPOSE 8787

CMD ["pnpm", "--filter", "@agentindex/mcp", "http"]
