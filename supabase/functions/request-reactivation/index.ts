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
  } catch { return null; }
}

function appRootForRequest(request: Request): URL | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const configured = Deno.env.get('DB_DOCGEN_APP_URLS')?.split(',').map((entry) => entry.trim()) ?? [];
  const roots = [...fixedAppRoots, ...configured].map(validAppRoot).filter((root): root is URL => root !== null);
  return roots.find((root) => root.origin === origin) ?? null;
}

function response(root: URL, body: Record<string, unknown>, status = 200): Response {
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

function preflight(root: URL): Response {
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

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing server-side Supabase configuration');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function validIp(value: string | null): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 64) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(candidate)) {
    const parts = candidate.split('.');
    return parts.every((part) => Number(part) <= 255) ? parts.map(Number).join('.') : null;
  }
  if (candidate.includes(':') && /^[0-9a-f:.]+$/i.test(candidate)) {
    try {
      const hostname = new URL(`http://[${candidate}]/`).hostname;
      return hostname.startsWith('[') ? hostname.slice(1, -1).toLowerCase() : null;
    } catch { return null; }
  }
  return null;
}

async function clientHash(request: Request): Promise<string | null> {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',') ?? [];
  const forwardedIp = forwarded.map(validIp).filter((ip): ip is string => ip !== null).at(-1);
  const ip = validIp(request.headers.get('cf-connecting-ip')) ?? forwardedIp ?? validIp(request.headers.get('x-real-ip'));
  if (!ip) return null;
  const salt = Deno.env.get('DB_DOCGEN_RATE_LIMIT_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!salt) throw new Error('Missing rate-limit salt');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  const root = appRootForRequest(request);
  if (!root) return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') return preflight(root);
  if (request.method !== 'POST') return response(root, { error: 'Método no permitido.' }, 405);

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response(root, { error: 'Sesión requerida.' }, 401);
  let admin;
  try { admin = serviceClient(); }
  catch { return response(root, { error: 'Servicio no disponible.' }, 503); }

  const { data: identity, error: identityError } = await admin.auth.getUser(token);
  if (identityError || !identity.user?.id || !identity.user.email) {
    return response(root, { error: 'Sesión no válida.' }, 401);
  }
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('email, is_active, has_ever_been_active').eq('id', identity.user.id).maybeSingle();
  if (profileError) return response(root, { error: 'No se ha podido comprobar el perfil.' }, 503);
  if (!profile || profile.is_active || !profile.has_ever_been_active
      || profile.email?.trim().toLowerCase() !== identity.user.email.trim().toLowerCase()) {
    return response(root, { error: 'No se puede solicitar la reactivación de esta cuenta.' }, 403);
  }

  try {
    const hash = await clientHash(request);
    if (!hash) return response(root, { error: 'Servicio no disponible.' }, 503);
    const { data: result, error: submitError } = await admin.rpc('submit_reactivation_request', {
      account_id: identity.user.id,
      p_client_hash: hash,
    });
    if (submitError) throw submitError;
    if (['submitted', 'already_pending', 'processing'].includes(result)) {
      return response(root, { ok: true, message: 'Solicitud de reactivación recibida.' });
    }
    if (result === 'registration_processing') {
      return response(root, { code: 'registration_processing', error: 'Tu alta inicial sigue en proceso. Comprueba el estado más tarde.' }, 409);
    }
    if (result === 'ineligible') return response(root, { error: 'No se puede solicitar la reactivación de esta cuenta.' }, 403);
    if (result === 'rate_limited') return response(root, { error: 'Inténtalo más tarde.' }, 429);
    return response(root, { error: 'No se ha podido registrar la solicitud.' }, 503);
  } catch (error) {
    console.error('request-reactivation failed', error);
    return response(root, { error: 'No se ha podido registrar la solicitud.' }, 503);
  }
});
