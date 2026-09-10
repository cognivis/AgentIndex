// check_trust over HTTP: full trust report for one service, with its recent
// paid probes. Mirrors the MCP check_trust tool.
import { checkTrust } from '../../../lib/data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name')?.trim();
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 });
  try {
    return Response.json(await checkTrust(name));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
