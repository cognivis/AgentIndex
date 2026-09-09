import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });

import { buildApp } from './app.js';
import { createSubgraphClient } from '../../mcp/src/subgraph.js';
import { createManifestReader } from '../../mcp/src/ens.js';

const PORT = Number(process.env.API_PORT ?? 4030);
const paywall = process.env.PAYWALL !== 'off';
const payTo = process.env.HEDERA_SERVICE_ACCOUNT_ID;

if (paywall && !payTo) {
  console.error('HEDERA_SERVICE_ACCOUNT_ID is required unless PAYWALL=off');
  process.exit(1);
}

const app = buildApp(
  { subgraph: createSubgraphClient(), manifests: createManifestReader() },
  { paywall, payTo },
);

app.listen(PORT, () => {
  console.log(`agentindex api on :${PORT} (paywall ${paywall ? 'on' : 'off'}, $0.01/query)`);
});
