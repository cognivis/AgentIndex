const path = require('node:path');

const root = path.resolve(__dirname, '..');
const node = process.env.AGENTINDEX_NODE || 'node';

module.exports = {
  apps: [
    {
      name: 'agentindex-prober',
      cwd: root,
      script: path.join(root, 'prober/node_modules/tsx/dist/cli.mjs'),
      args: ['prober/src/index.ts'],
      interpreter: node,
      env: {
        NODE_ENV: 'production',
        AGENTINDEX_ENV_FILE: '/etc/agentindex/prober.env',
        PAYWALL: 'on',
        PROBE_EXTERNAL: '0',
        SERVICES_URL: 'http://127.0.0.1:4103',
        BASE_SPEND_LEDGER_PATH: '/var/lib/agentindex/base-spend-ledger.json',
      },
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
