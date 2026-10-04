-- Server-side role enforcement for the existing document repository.
create or replace function public.can_edit_document(target_document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin'::public.app_role, 'editor'::public.app_role), false)
    and (
      public.is_admin()
      or exists (select 1 from public.documents where id = target_document_id and owner_id = auth.uid())
      or exists (select 1 from public.document_permissions
        where document_id = target_document_id and user_id = auth.uid()
          and permission = 'edit'::public.document_permission)
    );
$$;

create or replace function public.can_manage_document(target_document_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_app_role() in ('admin'::public.app_role, 'editor'::public.app_role), false)
    and (
      public.is_admin()
      or exists (select 1 from public.documents where id = target_document_id and owner_id = auth.uid())
    );
$$;

drop policy if exists profiles_admin_update on public.profiles;
revoke update on public.profiles from authenticated;

-- This trigger also protects writes performed outside the management RPC.
create function public.protect_last_active_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  removing_admin boolean;
begin
  if tg_op = 'DELETE' then
    removing_admin := old.role = 'admin'::public.app_role and old.is_active;
  else
    removing_admin := old.role = 'admin'::public.app_role and old.is_active
      and (new.role <> 'admin'::public.app_role or not new.is_active);
  end if;
  if removing_admin then
    perform pg_catalog.pg_advisory_xact_lock(18499241);
    if (select count(*) from public.profiles where role = 'admin'::public.app_role and is_active) <= 1 then
      raise exception 'last_active_admin' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger profiles_protect_last_active_admin
before update of role, is_active or delete on public.profiles
for each row execute function public.protect_last_active_admin();

-- The Edge Function is the only intended caller. The advisory lock serializes
-- competing role/status changes before the target row and admin count are read.
create function public.manage_profile_access(
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
  if access_action = 'set_role' and (target_role is null or target_role not in ('admin', 'editor', 'reader') or target_active is not null) then
    return 'invalid';
  end if;
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
  end if;
  return 'updated';
end;
$$;

revoke all on function public.manage_profile_access(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.manage_profile_access(uuid, uuid, text, text, boolean) to service_role;
