-- Solicitudes de acceso administradas. Los perfiles existentes conservan su estado.
create type public.access_request_status as enum ('pending', 'processing', 'invited', 'rejected', 'invite_failed');

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (
    email = lower(btrim(email)) and length(email) between 3 and 254
  ),
  status public.access_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  processing_started_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  auth_user_id uuid references auth.users(id),
  attempts integer not null default 0 check (attempts >= 0),
  error text
);

create index access_requests_status_requested_idx
  on public.access_requests (status, requested_at desc);

-- Una fila por huella de IP. La función Edge sólo envía SHA-256, nunca la IP.
create table public.access_request_rate_limits (
  client_hash text primary key check (client_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

alter table public.access_request_rate_limits enable row level security;
revoke all on public.access_request_rate_limits from anon, authenticated;

create function public.allow_access_request_attempt(client_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid client hash';
  end if;

  insert into public.access_request_rate_limits (client_hash, window_started_at, attempt_count)
  values (client_hash, now(), 1)
  on conflict (client_hash) do update
  set window_started_at = case
        when public.access_request_rate_limits.window_started_at <= now() - interval '1 hour' then now()
        else public.access_request_rate_limits.window_started_at
      end,
      attempt_count = case
        when public.access_request_rate_limits.window_started_at <= now() - interval '1 hour' then 1
        else public.access_request_rate_limits.attempt_count + 1
      end
  returning attempt_count into current_count;

  return current_count <= 10;
end;
$$;

revoke all on function public.allow_access_request_attempt(text) from public;
grant execute on function public.allow_access_request_attempt(text) to service_role;

create trigger access_requests_touch_updated_at
before update on public.access_requests
for each row execute function public.touch_updated_at();

-- El cambio de default no modifica ninguna fila de perfiles ya creada.
alter table public.profiles alter column is_active set default false;

alter table public.access_requests enable row level security;

create policy access_requests_admin_read
on public.access_requests for select
to authenticated
using (public.is_admin());

revoke all on public.access_requests from anon, authenticated;
grant select on public.access_requests to authenticated;

-- La función Edge reclama una solicitud de forma atómica antes de llamar a Auth.
create function public.claim_access_review(
  target_id uuid,
  reviewer_id uuid,
  review_action text
)
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.access_requests;
begin
  if not exists (
    select 1 from public.profiles
    where id = reviewer_id and role = 'admin'::public.app_role and is_active
  ) then
    raise exception 'Reviewer is not an active admin';
  end if;

  update public.access_requests
  set status = case
        when review_action = 'reject' then 'rejected'::public.access_request_status
        else 'processing'::public.access_request_status
      end,
      reviewed_by = reviewer_id,
      reviewed_at = now(),
      processing_started_at = case when review_action = 'reject' then null else now() end,
      attempts = attempts + case when review_action = 'reject' then 0 else 1 end,
      error = null
  where id = target_id
    and (
      (review_action in ('approve', 'reject') and status = 'pending'::public.access_request_status)
      or (
        review_action = 'retry'
        and status in ('invite_failed'::public.access_request_status, 'processing'::public.access_request_status)
        and coalesce(processing_started_at, updated_at) <= now() - interval '15 minutes'
      )
    )
  returning * into claimed;

  return claimed;
end;
$$;

-- Se activan el perfil y la solicitud en la misma transacción, después del envío.
create function public.complete_access_approval(target_id uuid, approved_user_id uuid)
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed public.access_requests;
begin
  if not exists (
    select 1
    from public.access_requests request
    join auth.users account on account.id = approved_user_id
    where request.id = target_id
      and request.status = 'processing'::public.access_request_status
      and lower(account.email) = request.email
  ) then
    raise exception 'Approved user does not match the processing request';
  end if;

  update public.profiles set is_active = true where id = approved_user_id;
  if not found then
    raise exception 'No profile for approved user';
  end if;

  update public.access_requests
  set status = 'invited'::public.access_request_status,
      auth_user_id = approved_user_id,
      error = null,
      processing_started_at = null
  where id = target_id and status = 'processing'::public.access_request_status
  returning * into completed;

  if completed.id is null then
    raise exception 'Request is not processing';
  end if;
  return completed;
end;
$$;

-- Buscar un usuario existente evita crear otra identidad al aprobar su correo.
create function public.find_auth_user_by_email(target_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(target_email)) limit 1;
$$;

revoke all on function public.claim_access_review(uuid, uuid, text) from public;
revoke all on function public.complete_access_approval(uuid, uuid) from public;
revoke all on function public.find_auth_user_by_email(text) from public;
grant execute on function public.claim_access_review(uuid, uuid, text) to service_role;
grant execute on function public.complete_access_approval(uuid, uuid) to service_role;
grant execute on function public.find_auth_user_by_email(text) to service_role;

comment on table public.access_requests is 'Peticiones de alta gestionadas por administradores activos.';
