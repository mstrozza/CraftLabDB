import { createClient } from 'npm:@supabase/supabase-js@2.117.1';

const fixedAppRoots = [
  'http://localhost:5173/',
  'https://mstrozza.github.io/CraftLabDB/',
];

function validAppRoot(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null;
    if (!url.pathname.endsWith('/')) return null;
    return url;
  } catch {
    return null;
  }
}

export function appRootForRequest(request: Request): URL | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const configured = Deno.env.get('DB_DOCGEN_APP_URLS')?.split(',').map((entry) => entry.trim()) ?? [];
  const roots = [...fixedAppRoots, ...configured].map(validAppRoot).filter((root): root is URL => root !== null);
  return roots.find((root) => root.origin === origin) ?? null;
}

export function response(root: URL, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': root.origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  });
}

export function preflight(root: URL): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': root.origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  });
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing server-side Supabase configuration');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
