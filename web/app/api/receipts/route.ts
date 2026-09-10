// Recent real x402 payment receipts for one service — the on-chain proof
// behind a verdict. Reads probes the prober already settled; no fresh spend.
import { loadReceipts } from '../../../lib/data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const label = new URL(req.url).searchParams.get('label')?.trim();
  if (!label) return Response.json({ error: 'label is required' }, { status: 400 });
  try {
    return Response.json(await loadReceipts(label));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
