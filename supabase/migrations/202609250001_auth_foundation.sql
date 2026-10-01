-- Base de autenticación, perfiles, documentos y permisos para DB DocGen.
-- Los usuarios nuevos se crean como lectores. Un administrador debe promoverlos.

create type public.app_role as enum ('admin', 'editor', 'reviewer', 'reader');
create type public.document_status as enum ('draft', 'in_review', 'approved', 'published', 'archived');
create type public.document_permission as enum ('view', 'edit', 'review');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text,
  role public.app_role not null default 'reader',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  ticket_id text not null default '',
  title text not null default 'Documento sin título',
  status public.document_status not null default 'draft',
  version text not null default '1.0',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_permissions (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission public.document_permission not null default 'view',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index documents_owner_updated_idx on public.documents (owner_id, updated_at desc);
create index documents_status_updated_idx on public.documents (status, updated_at desc);
create index document_permissions_user_idx on public.document_permissions (user_id, document_id);
create unique index documents_owner_ticket_unique_idx
  on public.documents (owner_id, ticket_id)
  where ticket_id <> '';

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger documents_touch_updated_at
before update on public.documents
for each row execute function public.touch_updated_at();

create trigger document_permissions_touch_updated_at
before update on public.document_permissions
for each row execute function public.touch_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Usuario'
    ),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and is_active
  );
$$;

create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = auth.uid() and is_active;
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin'::public.app_role, false);
$$;

create function public.can_read_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and (
    public.is_admin()
    or exists (
      select 1 from public.documents
      where id = target_document_id and owner_id = auth.uid()
    )
    or exists (
      select 1 from public.document_permissions
      where document_id = target_document_id and user_id = auth.uid()
    )
  );
$$;

create function public.can_edit_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and (
    public.is_admin()
    or exists (
      select 1 from public.documents
      where id = target_document_id and owner_id = auth.uid()
    )
    or exists (
      select 1 from public.document_permissions
      where document_id = target_document_id
        and user_id = auth.uid()
        and permission = 'edit'::public.document_permission
    )
  );
$$;

create function public.can_manage_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and (
    public.is_admin()
    or exists (
      select 1 from public.documents
      where id = target_document_id and owner_id = auth.uid()
    )
  );
$$;

create function public.protect_document_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el propietario de un documento';
  end if;
  return new;
end;
$$;

create trigger documents_protect_owner
before update of owner_id on public.documents
for each row execute function public.protect_document_owner();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_permissions enable row level security;

create policy profiles_read_own
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_admin_update
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy documents_read_authorized
on public.documents for select
to authenticated
using (public.can_read_document(id));

create policy documents_create_authorized
on public.documents for insert
to authenticated
with check (
  public.is_active_user()
  and (owner_id = auth.uid() or public.is_admin())
  and public.current_app_role() in ('admin'::public.app_role, 'editor'::public.app_role)
);

create policy documents_update_authorized
on public.documents for update
to authenticated
using (public.can_edit_document(id))
with check (public.can_edit_document(id));

create policy documents_delete_owner
on public.documents for delete
to authenticated
using (public.can_manage_document(id));

create policy permissions_read_relevant
on public.document_permissions for select
to authenticated
using (user_id = auth.uid() or public.can_manage_document(document_id));

create policy permissions_create_owner
on public.document_permissions for insert
to authenticated
with check (public.can_manage_document(document_id));

create policy permissions_update_owner
on public.document_permissions for update
to authenticated
using (public.can_manage_document(document_id))
with check (public.can_manage_document(document_id));

create policy permissions_delete_owner
on public.document_permissions for delete
to authenticated
using (public.can_manage_document(document_id));

revoke all on public.profiles, public.documents, public.document_permissions from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.document_permissions to authenticated;

revoke all on function public.is_active_user() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_read_document(uuid) from public;
revoke all on function public.can_edit_document(uuid) from public;
revoke all on function public.can_manage_document(uuid) from public;

grant execute on function public.is_active_user() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_read_document(uuid) to authenticated;
grant execute on function public.can_edit_document(uuid) to authenticated;
grant execute on function public.can_manage_document(uuid) to authenticated;

comment on table public.profiles is 'Perfil interno, rol y estado de cada usuario autenticado.';
comment on table public.documents is 'Documento técnico completo; content conserva la estructura JSON editable.';
comment on table public.document_permissions is 'Permisos adicionales sobre documentos no propios.';
