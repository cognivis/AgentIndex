import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgentIndexServer } from './server.js';

const server = createAgentIndexServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('agentindex mcp ready (stdio)');
