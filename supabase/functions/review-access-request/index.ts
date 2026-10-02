import { appRootForRequest, preflight, response, serviceClient } from '../_shared/access.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const { data: reviewer, error: reviewerError } = await admin.from('profiles')
    .select('role, is_active').eq('id', identity.user.id).maybeSingle();
  if (reviewerError) return response(root, { error: 'No se ha podido comprobar el permiso.' }, 503);
  if (reviewer?.role !== 'admin' || reviewer?.is_active !== true) {
    return response(root, { error: 'Permiso insuficiente.' }, 403);
  }

  let id: string;
  let action: string;
  try {
    const body = await request.json();
    id = String(body?.id ?? '');
    action = String(body?.action ?? '');
  } catch {
    return response(root, { error: 'Solicitud no válida.' }, 400);
  }
  if (!uuidPattern.test(id) || !['approve', 'reject', 'retry'].includes(action)) {
    return response(root, { error: 'Solicitud no válida.' }, 400);
  }

  const { data: claimed, error: claimError } = await admin.rpc('claim_access_review', {
    target_id: id,
    reviewer_id: identity.user.id,
    review_action: action,
  });
  if (claimError) return response(root, { error: 'No se ha podido revisar la solicitud.' }, 503);
  if (!claimed?.id) return response(root, { error: 'La solicitud ya fue revisada o cambió de estado.' }, 409);
  if (action === 'reject') return response(root, { ok: true, status: 'rejected' });

  try {
    const rememberUser = async (userId: string) => {
      const { data: saved, error: saveError } = await admin.from('access_requests')
        .update({ auth_user_id: userId })
        .eq('id', claimed.id).eq('status', 'processing')
        .select('id').maybeSingle();
      if (saveError || !saved) throw saveError ?? new Error('Could not remember auth user');
    };

    let userId = claimed.auth_user_id as string | null;
    if (!userId) {
      const { data: existingId, error: lookupError } = await admin.rpc('find_auth_user_by_email', {
        target_email: claimed.email,
      });
      if (lookupError) throw lookupError;
      userId = existingId as string | null;
    }

    if (userId) {
      if (!claimed.auth_user_id) await rememberUser(userId);
      const redirectTo = new URL('?auth=recovery', root).toString();
      const { error: resetError } = await admin.auth.resetPasswordForEmail(claimed.email, { redirectTo });
      if (resetError) throw resetError;
    } else {
      const redirectTo = new URL('?auth=setup', root).toString();
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(claimed.email, { redirectTo });
      if (inviteError) throw inviteError;
      userId = invited.user?.id ?? null;
      if (!userId) throw new Error('Invitation returned no user');
      // Auth devuelve el ID después de aceptar el envío; persistirlo enseguida
      // reduce la posibilidad de repetir una invitación tras un fallo posterior.
      await rememberUser(userId);
    }

    const { data: completed, error: completionError } = await admin.rpc('complete_access_approval', {
      target_id: claimed.id,
      approved_user_id: userId,
    });
    if (completionError || !completed) throw completionError ?? new Error('Approval did not complete');
    return response(root, { ok: true, status: 'invited' });
  } catch (error) {
    console.error('review-access-request approval failed', error);
    const { data: failed, error: failureUpdateError } = await admin.from('access_requests').update({
      status: 'invite_failed',
      error: 'No se pudo completar el envío o la activación. Reintenta la invitación.',
    }).eq('id', claimed.id).eq('status', 'processing').select('id').maybeSingle();
    if (failureUpdateError || !failed) {
      console.error('review-access-request could not record invite_failed', failureUpdateError);
    }
    return response(root, { error: 'No se ha podido completar la aprobación. Puedes reintentarlo.' }, 503);
  }
});
