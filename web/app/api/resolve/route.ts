// Free public endpoint powering the Playground: describe a task, get back the
// service to pay and the ones to avoid — the same call resolve_data_need makes
// over MCP, exposed over HTTP so the site can show the decision live.
import { resolveNeed } from '../../../lib/data';

export const dynamic = 'force-dynamic';

async function run(task: string) {
  const t = (task ?? '').trim();
  if (!t) return Response.json({ error: 'task is required' }, { status: 400 });
  try {
    return Response.json(await resolveNeed(t));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { task?: string };
  return run(body.task ?? '');
}

export async function GET(req: Request) {
  const task = new URL(req.url).searchParams.get('task') ?? '';
  return run(task);
}
