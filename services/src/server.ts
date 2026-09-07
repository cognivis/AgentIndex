import { config } from 'dotenv';
import { resolve } from 'node:path';

// env lives at the repo root, shared by all workspaces
config({ path: resolve(import.meta.dirname, '../../.env') });
import { buildApp } from './app.js';
import { services } from './catalog.js';

const PORT = Number(process.env.SERVICES_PORT ?? 4021);
const paywall = process.env.PAYWALL !== 'off';
// services receive on their own account — buyers (prober, agents) pay from theirs
const payTo = process.env.HEDERA_SERVICE_ACCOUNT_ID;

if (paywall && !payTo) {
  console.error('HEDERA_SERVICE_ACCOUNT_ID is required unless PAYWALL=off');
  process.exit(1);
}

const app = buildApp({ paywall, payTo });

app.listen(PORT, () => {
  console.log(`services listening on :${PORT} (paywall ${paywall ? 'on' : 'off'})`);
  for (const s of services) {
    console.log(`  ${s.method.padEnd(4)} ${s.path}  ${s.priceUsd}`);
  }
});
