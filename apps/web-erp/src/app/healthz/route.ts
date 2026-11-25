// Liveness of the web server itself, used by smoke tests and hosting probes.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'up' }, { headers: { 'cache-control': 'no-store' } });
}
