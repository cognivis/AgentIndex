// The dashboard runs with cwd inside web/, so Next won't auto-load the
// monorepo-root .env (RPC url, contract addresses, the demo signer key).
// Load it once, server-side, without pulling in a dependency.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  // already provided by the environment (e.g. Vercel) — nothing to do
  if (process.env.AGENTINDEX_REGISTRY_ADDRESS) return;
  try {
    const txt = readFileSync(resolve(process.cwd(), '../.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  } catch {
    // no root .env (e.g. hosted with real env vars) — carry on
  }
}
