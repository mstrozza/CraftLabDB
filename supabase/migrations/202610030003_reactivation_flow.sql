-- Authenticated reactivation is separate from anonymous first registration.
-- All three administrative paths use the same transaction advisory lock as
-- manage_profile_access, so direct activation and request review serialize.
alter table public.profiles
  add column has_ever_been_active boolean not null default false;

-- Current active users and completed invitations are known to have held access.
-- Older inactive accounts activated only by an out-of-band operation cannot
-- be inferred automatically; review those profiles before enabling this flow.
update public.profiles profile
set has_ever_been_active = true
where profile.is_active or exists (
  select 1 from public.access_requests request
  where request.auth_user_id = profile.id and request.status = 'invited'::public.access_request_status
);

create function public.remember_profile_activation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.has_ever_been_active := new.has_ever_been_active or new.is_active;
  else
    new.has_ever_been_active := old.has_ever_been_active or new.is_active;
  end if;
  return new;
end;
$$;

create trigger profiles_remember_activation
before insert or update of is_active, has_ever_been_active on public.profiles
for each row execute function public.remember_profile_activation();

comment on column public.profiles.has_ever_been_active is
  'Sticky marker: this profile has held active access; distinguishes reactivation from first registration.';

create index access_requests_reactivation_account_idx
  on public.access_requests (auth_user_id, status)
  where request_kind = 'reactivation'::public.access_request_kind;

create function public.submit_reactivation_request(account_id uuid, p_client_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  account_email text;
  account_profile public.profiles%rowtype;
  existing_request public.access_requests%rowtype;
  inserted_id uuid;
begin
  if p_client_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(18499241);
  select lower(btrim(email)) into account_email from auth.users where id = account_id;
  select * into account_profile from public.profiles where id = account_id for update;
  if account_email is null or not found or account_profile.is_active or not account_profile.has_ever_been_active
     or lower(btrim(coalesce(account_profile.email, ''))) <> account_email then
    return 'ineligible';
  end if;

  -- The unique email constraint serializes a concurrent first insert. No
  -- limiter is charged until we know this is a real new/reopened transition.
  insert into public.access_requests (email, request_kind, auth_user_id)
  values (account_email, 'reactivation'::public.access_request_kind, account_id)
  on conflict (email) do nothing returning id into inserted_id;
  if inserted_id is not null then
    if not public.allow_access_request_attempt(p_client_hash) then
      delete from public.access_requests where id = inserted_id;
      return 'rate_limited';
    end if;
    return 'submitted';
  end if;

  select * into existing_request from public.access_requests where email = account_email for update;
  if existing_request.id is null then return 'conflict'; end if;
  if existing_request.status = 'pending'::public.access_request_status
     and existing_request.request_kind = 'reactivation'::public.access_request_kind
     and existing_request.auth_user_id = account_id then
    return 'already_pending';
  end if;
  if existing_request.status = 'processing'::public.access_request_status then
    return case when existing_request.request_kind = 'registration'::public.access_request_kind
      then 'registration_processing' else 'processing' end;
  end if;
  if not public.allow_access_request_attempt(p_client_hash) then return 'rate_limited'; end if;

  update public.access_requests
  set request_kind = 'reactivation'::public.access_request_kind,
      auth_user_id = account_id,
      status = 'pending'::public.access_request_status,
      requested_at = now(),
      reviewed_at = null,
      reviewed_by = null,
      processing_started_at = null,
      attempts = 0,
      error = null
  where id = existing_request.id;
  return 'submitted';
end;
$$;

-- One RPC handles both outcomes; no Auth mail API is involved.
create function public.review_reactivation_request(target_id uuid, reviewer_id uuid, review_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  requested public.access_requests%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(18499241);
  if not exists (select 1 from public.profiles
    where id = reviewer_id and role = 'admin'::public.app_role and is_active) then return 'forbidden'; end if;
  if review_action not in ('approve', 'reject') then return 'invalid'; end if;
  select * into requested from public.access_requests where id = target_id for update;
  if requested.id is null or requested.request_kind <> 'reactivation'::public.access_request_kind
     or requested.status <> 'pending'::public.access_request_status then return 'conflict'; end if;
  if requested.auth_user_id is null or not exists (
    select 1 from public.profiles profile
    join auth.users account on account.id = profile.id
    where profile.id = requested.auth_user_id and not profile.is_active and profile.has_ever_been_active
      and lower(btrim(coalesce(profile.email, ''))) = requested.email
      and lower(btrim(coalesce(account.email, ''))) = requested.email
  ) then return 'conflict'; end if;

  if review_action = 'approve' then
    update public.profiles set is_active = true
      where id = requested.auth_user_id and not is_active;
    if not found then return 'conflict'; end if;
  end if;
  update public.access_requests
  set status = case when review_action = 'approve' then 'reactivated'::public.access_request_status
                    else 'rejected'::public.access_request_status end,
      reviewed_by = reviewer_id,
      reviewed_at = now(),
      processing_started_at = null,
      error = null
  where id = target_id;
  return case when review_action = 'approve' then 'reactivated' else 'rejected' end;
end;
$$;

-- Registration mail paths may never claim a reactivation row.
create or replace function public.claim_access_review(target_id uuid, reviewer_id uuid, review_action text)
returns public.access_requests language plpgsql security definer set search_path = '' as $$
declare
  claimed public.access_requests;
begin
  perform pg_catalog.pg_advisory_xact_lock(18499241);
  if not exists (select 1 from public.profiles
    where id = reviewer_id and role = 'admin'::public.app_role and is_active) then
    raise exception 'Reviewer is not an active admin';
  end if;
  update public.access_requests as request_row
  set status = case when review_action = 'reject' then 'rejected'::public.access_request_status
                    else 'processing'::public.access_request_status end,
      reviewed_by = reviewer_id,
      reviewed_at = now(),
      processing_started_at = case when review_action = 'reject' then null else now() end,
      attempts = attempts + case when review_action = 'reject' then 0 else 1 end,
      error = null
  where request_row.id = target_id and request_row.request_kind = 'registration'::public.access_request_kind
    and ((review_action in ('approve', 'reject') and status = 'pending'::public.access_request_status)
      or (review_action = 'retry'
        and status in ('invite_failed'::public.access_request_status, 'processing'::public.access_request_status)
        and coalesce(processing_started_at, updated_at) <= now() - interval '15 minutes'))
    and (review_action = 'reject' or not exists (
      select 1 from public.profiles profile
      left join auth.users account on account.id = profile.id
      where profile.has_ever_been_active
        and (profile.id = request_row.auth_user_id or lower(btrim(account.email)) = request_row.email)
    ))
  returning * into claimed;
  return claimed;
end;
$$;

create or replace function public.complete_access_approval(target_id uuid, approved_user_id uuid)
returns public.access_requests language plpgsql security definer set search_path = '' as $$
declare
  completed public.access_requests;
begin
  perform pg_catalog.pg_advisory_xact_lock(18499241);
  if not exists (select 1 from public.access_requests request
    join auth.users account on account.id = approved_user_id
    join public.profiles profile on profile.id = account.id
    where request.id = target_id and request.request_kind = 'registration'::public.access_request_kind
      and request.status = 'processing'::public.access_request_status
      and lower(account.email) = request.email
      and not profile.has_ever_been_active) then
    raise exception 'Approved user does not match the processing registration request';
  end if;
  update public.profiles set is_active = true where id = approved_user_id;
  if not found then raise exception 'No profile for approved user'; end if;
  update public.access_requests
  set status = 'invited'::public.access_request_status,
      auth_user_id = approved_user_id, error = null, processing_started_at = null
  where id = target_id and status = 'processing'::public.access_request_status
    and request_kind = 'registration'::public.access_request_kind
  returning * into completed;
  if completed.id is null then raise exception 'Request is not processing'; end if;
  return completed;
end;
$$;

-- Recreate the existing management RPC with direct-activation reconciliation.
create or replace function public.manage_profile_access(
  actor_id uuid, target_id uuid, access_action text, target_role text default null, target_active boolean default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  current_target public.profiles%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(18499241);
  if not exists (select 1 from public.profiles where id = actor_id and role = 'admin'::public.app_role and is_active) then
    return 'forbidden';
  end if;
  if access_action not in ('set_role', 'set_active') then return 'invalid'; end if;
  if access_action = 'set_role' and (target_role is null or target_role not in ('admin', 'editor', 'reader') or target_active is not null) then return 'invalid'; end if;
  if access_action = 'set_active' and (target_active is null or target_role is not null) then return 'invalid'; end if;
  select * into current_target from public.profiles where id = target_id for update;
  if not found then return 'not_found'; end if;
  if actor_id = target_id and
     ((access_action = 'set_role' and target_role <> 'admin') or (access_action = 'set_active' and not target_active)) then
    return 'self_change';
  end if;
  if current_target.role = 'admin'::public.app_role and current_target.is_active and
     ((access_action = 'set_role' and target_role <> 'admin') or (access_action = 'set_active' and not target_active)) and
     (select count(*) from public.profiles where role = 'admin'::public.app_role and is_active) <= 1 then
    return 'last_admin';
  end if;
  if access_action = 'set_role' then
    update public.profiles set role = target_role::public.app_role where id = target_id;
  else
    update public.profiles set is_active = target_active where id = target_id;
    if target_active then
      update public.access_requests
      set status = 'reactivated'::public.access_request_status,
          reviewed_by = actor_id,
          reviewed_at = now(),
          processing_started_at = null,
          error = null
      where auth_user_id = target_id and request_kind = 'reactivation'::public.access_request_kind
        and status = 'pending'::public.access_request_status;
    end if;
  end if;
  return 'updated';
end;
$$;

revoke all on function public.submit_reactivation_request(uuid, text) from public, anon, authenticated;
revoke all on function public.review_reactivation_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_access_review(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_access_approval(uuid, uuid) from public, anon, authenticated;
revoke all on function public.manage_profile_access(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_reactivation_request(uuid, text) to service_role;
grant execute on function public.review_reactivation_request(uuid, uuid, text) to service_role;
grant execute on function public.claim_access_review(uuid, uuid, text) to service_role;
grant execute on function public.complete_access_approval(uuid, uuid) to service_role;
grant execute on function public.manage_profile_access(uuid, uuid, text, text, boolean) to service_role;

comment on table public.access_requests is 'Solicitudes de alta y reactivación gestionadas por administradores activos.';
