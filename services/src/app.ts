import express, { type Express } from 'express';
import { paymentMiddleware } from '@x402/express';
import type { RoutesConfig } from '@x402/core/server';
import { services } from './catalog.js';
import * as handlers from './handlers.js';
import { createResourceServer } from './x402.js';

export interface AppOptions {
  // paywall off = free mode for local dev/tests before payments are wired
  paywall: boolean;
  payTo?: string; // Hedera account id receiving payments
}

// rough testnet conversion: $1 ~= 3.3 HBAR, 1 HBAR = 100M tinybars
function usdToTinybars(money: string): string {
  const usd = Number(money.replace('$', ''));
  return String(Math.round(usd * 3.3 * 100_000_000));
}

const routeHandlers: Record<string, (req: express.Request, res: express.Response) => Promise<void>> = {
  weatherpro: handlers.weather,
  scamco: handlers.scamWeather,
  pricefeed: handlers.spotPrice,
  summarize: handlers.summarize,
  geocode: handlers.geocode,
  newsfeed: handlers.newsfeed,
};

export function buildApp(opts: AppOptions): Express {
  const app = express();
  // Production traffic arrives through the loopback Nginx proxy. Trusting only
  // loopback lets x402 advertise the original HTTPS resource URL without
  // accepting spoofed forwarding headers from direct public clients.
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '1mb' }));

  if (opts.paywall) {
    if (!opts.payTo) throw new Error('payTo is required when the paywall is on');

    const routes: RoutesConfig = {};
    for (const svc of services) {
      routes[`${svc.method} ${svc.path}`] = {
        accepts: [
          {
            scheme: 'exact',
            // priced in HBAR tinybars; USDC option returns once faucet funds arrive
            price: { asset: '0.0.0', amount: usdToTinybars(svc.priceUsd) },
            network: 'hedera:testnet',
            payTo: opts.payTo,
          },
        ],
        description: svc.description,
        mimeType: 'application/json',
      };
    }
    app.use(paymentMiddleware(routes, createResourceServer()));
  }

  for (const svc of services) {
    const handler = routeHandlers[svc.label];
    if (svc.method === 'GET') app.get(svc.path, handler);
    else app.post(svc.path, handler);

    // spec is free to read — buyers need it before deciding to pay
    app.get(`/${svc.label}/spec`, (_req, res) => {
      res.json({
        label: svc.label,
        method: svc.method,
        path: svc.path,
        priceUsd: svc.priceUsd,
        description: svc.description,
        spec: svc.spec,
      });
    });
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', services: services.map((s) => s.label), paywall: opts.paywall });
  });

  return app;
}
