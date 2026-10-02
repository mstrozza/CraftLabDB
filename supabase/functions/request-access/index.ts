import { appRootForRequest, preflight, response, serviceClient } from '../_shared/access.ts';

const success = { ok: true, message: 'Solicitud recibida. Si corresponde, recibirás instrucciones por correo.' };

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
    } catch {
      return null;
    }
  }
  return null;
}

async function clientHash(request: Request): Promise<string | null> {
  const cloudflareIp = validIp(request.headers.get('cf-connecting-ip'));
  const forwardedIps = request.headers.get('x-forwarded-for')?.split(',') ?? [];
  const forwardedIp = forwardedIps.map(validIp).filter((ip): ip is string => ip !== null).at(-1);
  const clientId = cloudflareIp ?? forwardedIp ?? validIp(request.headers.get('x-real-ip'));
  if (!clientId) return null;
  const salt = Deno.env.get('DB_DOCGEN_RATE_LIMIT_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!salt) throw new Error('Missing rate-limit salt');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${clientId}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  const root = appRootForRequest(request);
  if (!root) return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') return preflight(root);
  if (request.method !== 'POST') return response(root, { error: 'Método no permitido.' }, 405);

  let email: string;
  try {
    const body = await request.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return response(root, { error: 'Indica un correo válido.' }, 400);
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response(root, { error: 'Indica un correo válido.' }, 400);
  }

  try {
    const hash = await clientHash(request);
    if (!hash) return response(root, success);
    const admin = serviceClient();
    const { data: allowed, error: limitError } = await admin.rpc('allow_access_request_attempt', {
      client_hash: hash,
    });
    if (limitError) throw limitError;
    if (!allowed) return response(root, success);
    const { error } = await admin.from('access_requests').upsert(
      { email },
      { onConflict: 'email', ignoreDuplicates: true },
    );
    if (error) throw error;
    return response(root, success);
  } catch (error) {
    console.error('request-access failed', error);
    return response(root, { error: 'No se ha podido registrar la solicitud. Inténtalo más tarde.' }, 503);
  }
});
