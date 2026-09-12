const path = require('node:path');

const root = path.resolve(__dirname, '..');
const node = process.env.AGENTINDEX_NODE || 'node';

module.exports = {
  apps: [
    {
      name: 'agentindex-web',
      cwd: path.join(root, 'web'),
      script: path.join(root, 'web/node_modules/next/dist/bin/next'),
      args: ['start', '-p', '4100'],
      interpreter: node,
      env: {
        NODE_ENV: 'production',
        AGENTINDEX_ENV_FILE: '/etc/agentindex/web.env',
        PORT: '4100',
        PUBLIC_MCP_URL: 'https://mcp-agentindex.craftyour.site',
        REGISTER_ENABLED: '0',
      },
      autorestart: true,
      max_memory_restart: '700M',
      time: true,
    },
    {
      name: 'agentindex-mcp',
      cwd: root,
      script: path.join(root, 'mcp/node_modules/tsx/dist/cli.mjs'),
      args: ['mcp/src/http.ts'],
      interpreter: node,
      env: {
        NODE_ENV: 'production',
        AGENTINDEX_ENV_FILE: '/etc/agentindex/mcp.env',
        MCP_PORT: '4101',
        PUBLIC_MCP_URL: 'https://mcp-agentindex.craftyour.site',
      },
      autorestart: true,
      max_memory_restart: '500M',
      time: true,
    },
    {
      name: 'agentindex-api',
      cwd: root,
      script: path.join(root, 'api/node_modules/tsx/dist/cli.mjs'),
      args: ['api/src/server.ts'],
      interpreter: node,
      env: {
        NODE_ENV: 'production',
        AGENTINDEX_ENV_FILE: '/etc/agentindex/api.env',
        API_PORT: '4102',
        PAYWALL: 'on',
      },
      autorestart: true,
      max_memory_restart: '500M',
      time: true,
    },
    {
      name: 'agentindex-services',
      cwd: root,
      script: path.join(root, 'services/node_modules/tsx/dist/cli.mjs'),
      args: ['services/src/server.ts'],
      interpreter: node,
      env: {
        NODE_ENV: 'production',
        AGENTINDEX_ENV_FILE: '/etc/agentindex/services.env',
        SERVICES_PORT: '4103',
        PAYWALL: 'on',
      },
      autorestart: true,
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
