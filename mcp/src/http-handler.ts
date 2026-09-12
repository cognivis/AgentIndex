import { config } from 'dotenv';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';

config({ path: process.env.AGENTINDEX_ENV_FILE ?? resolve(import.meta.dirname, '../../.env') });

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAgentIndexServer } from './server.js';

const port = Number(process.env.MCP_PORT ?? process.env.PORT ?? 8787);
const publicBaseUrl = (process.env.PUBLIC_MCP_URL ?? `http://localhost:${port}`).replace(/\/$/, '');

export function mcpManifest(baseUrl = publicBaseUrl) {
  return {
    name: 'agentindex',
    title: 'AgentIndex',
    description: 'Trust scores and on-chain payment receipts for x402 services.',
    version: '0.2.0',
    repository: 'https://github.com/cognivis/AgentIndex',
    authentication: { required: false },
    transport: {
      type: 'streamable-http',
      url: `${baseUrl.replace(/\/$/, '')}/mcp`,
    },
    capabilities: {
      tools: ['find_service', 'check_trust', 'resolve_data_need', 'get_verified_data'],
    },
  };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(body));
}

export async function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', publicBaseUrl);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept, mcp-protocol-version',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'agentindex-mcp', transport: 'streamable-http' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/.well-known/mcp.json') {
    json(res, 200, mcpManifest());
    return;
  }

  if (url.pathname !== '/mcp') {
    json(res, 404, { error: 'not found' });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'stateless MCP accepts POST requests only' });
    return;
  }

  const mcp = createAgentIndexServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP HTTP request failed', error);
    if (!res.headersSent) {
      json(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  } finally {
    await transport.close().catch(() => undefined);
    await mcp.close().catch(() => undefined);
  }
}
