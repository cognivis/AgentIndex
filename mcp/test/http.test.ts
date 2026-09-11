import { describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleHttpRequest, mcpManifest } from '../src/http-handler.js';
import { createAgentIndexServer } from '../src/server.js';

describe('remote MCP transport', () => {
  async function get(path: string) {
    let status = 0;
    let body = '';
    const req = { method: 'GET', url: path } as IncomingMessage;
    const res = {
      headersSent: false,
      writeHead(code: number) {
        status = code;
      },
      end(chunk?: string) {
        body = chunk ?? '';
      },
    } as unknown as ServerResponse;
    await handleHttpRequest(req, res);
    return { status, body: JSON.parse(body) as Record<string, unknown> };
  }

  it('publishes a well-known streamable HTTP endpoint', () => {
    expect(mcpManifest('https://agentindex.example')).toMatchObject({
      name: 'agentindex',
      authentication: { required: false },
      transport: {
        type: 'streamable-http',
        url: 'https://agentindex.example/mcp',
      },
      capabilities: {
        tools: ['find_service', 'check_trust', 'resolve_data_need', 'get_verified_data'],
      },
    });
  });

  it('creates isolated MCP servers for stateless requests', () => {
    const first = createAgentIndexServer();
    const second = createAgentIndexServer();
    expect(first).not.toBe(second);
  });

  it('serves discovery and health routes without starting a daemon', async () => {
    const health = await get('/health');
    const discovery = await get('/.well-known/mcp.json');
    expect(health).toMatchObject({ status: 200, body: { ok: true } });
    expect(discovery).toMatchObject({
      status: 200,
      body: { name: 'agentindex', transport: { type: 'streamable-http' } },
    });
  });
});
