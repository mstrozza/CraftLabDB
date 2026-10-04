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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedRoles = ['admin', 'editor', 'reader'];

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
  if (identityError || !identity.user) return response(root, { error: 'Sesión no válida.' }, 401);
  const { data: actor, error: actorError } = await admin.from('profiles')
    .select('role, is_active').eq('id', identity.user.id).maybeSingle();
  if (actorError) return response(root, { error: 'No se ha podido comprobar el permiso.' }, 503);
  if (actor?.role !== 'admin' || actor?.is_active !== true) return response(root, { error: 'Permiso insuficiente.' }, 403);

  let targetId: string;
  let action: string;
  let role: string | null = null;
  let active: boolean | null = null;
  try {
    const body = await request.json();
    targetId = body?.targetId;
    action = body?.action;
    if ((action === 'set_role' && body?.active !== undefined)
      || (action === 'set_active' && body?.role !== undefined)) {
      return response(root, { error: 'Solicitud no válida.' }, 400);
    }
    if (action === 'set_role') role = body?.role;
    if (action === 'set_active') active = body?.active;
  } catch {
    return response(root, { error: 'Solicitud no válida.' }, 400);
  }
  if (typeof targetId !== 'string' || !uuidPattern.test(targetId)
      || !((action === 'set_role' && allowedRoles.includes(role ?? '') && active === null)
        || (action === 'set_active' && typeof active === 'boolean' && role === null))) {
    return response(root, { error: 'Solicitud no válida.' }, 400);
  }

  const { data: result, error: updateError } = await admin.rpc('manage_profile_access', {
    actor_id: identity.user.id,
    target_id: targetId,
    access_action: action,
    target_role: role,
    target_active: active,
  });
  if (updateError) {
    if (updateError.message.includes('last_active_admin')) return response(root, { error: 'Debe quedar al menos un administrador activo.' }, 409);
    return response(root, { error: 'No se ha podido cambiar el acceso.' }, 503);
  }
  if (result === 'invalid') return response(root, { error: 'Solicitud no válida.' }, 400);
  if (result === 'forbidden') return response(root, { error: 'Permiso insuficiente.' }, 403);
  if (['not_found', 'self_change', 'last_admin'].includes(result)) {
    return response(root, { error: result === 'not_found' ? 'Usuario no encontrado.' : 'Cambio no permitido.' }, 409);
  }
  if (result !== 'updated') return response(root, { error: 'No se ha podido cambiar el acceso.' }, 503);
  return response(root, { ok: true });
});
