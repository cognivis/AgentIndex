import { createServer } from 'node:http';
import { handleHttpRequest } from './http-handler.js';

const port = Number(process.env.MCP_PORT ?? process.env.PORT ?? 8787);
const server = createServer((req, res) => {
  void handleHttpRequest(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.error(`agentindex mcp ready (streamable HTTP on :${port})`);
});
