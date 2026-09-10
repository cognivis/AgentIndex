// find_service over HTTP: search the index by capability. Powers the
// in-dashboard MCP console; mirrors the MCP find_service tool exactly.
import { findServices } from '../../../lib/data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const need = new URL(req.url).searchParams.get('need')?.trim();
  if (!need) return Response.json({ error: 'need is required' }, { status: 400 });
  try {
    return Response.json(await findServices(need));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
