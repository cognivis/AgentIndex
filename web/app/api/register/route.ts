// Demo-wallet registration endpoint. Guarded by REGISTER_ENABLED so the
// funded signer is only exposed when Yash turns it on for a demo — otherwise
// a public host could be spammed into draining gas.
import { registerService, RegisterError, type RegisterInput } from '../../../lib/register';

export const dynamic = 'force-dynamic';
// on-chain registration is several sequential txs (~60–90s)
export const maxDuration = 120;

export async function POST(req: Request) {
  if (process.env.REGISTER_ENABLED !== 'true') {
    return Response.json(
      { error: 'registration is disabled on this host' },
      { status: 403 },
    );
  }

  let body: Partial<RegisterInput>;
  try {
    body = (await req.json()) as Partial<RegisterInput>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const input: RegisterInput = {
    label: (body.label ?? '').trim().toLowerCase(),
    url: (body.url ?? '').trim(),
    method: (body.method ?? 'GET').trim().toUpperCase(),
    price: (body.price ?? '').trim(),
    description: (body.description ?? '').trim(),
    requiredFields: Array.isArray(body.requiredFields)
      ? body.requiredFields.map((f) => String(f).trim()).filter(Boolean)
      : [],
  };

  try {
    const result = await registerService(input);
    return Response.json({
      ok: true,
      ...result,
      message: `${result.ensName} registered — the prober will pick it up within a cycle.`,
    });
  } catch (err) {
    if (err instanceof RegisterError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
