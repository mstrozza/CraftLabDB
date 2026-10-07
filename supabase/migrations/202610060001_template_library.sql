-- Approved, immutable structural template versions. Documents stay local.
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  template_type text not null check (template_type in ('full', 'module')),
  root_kind text,
  section_id text,
  root_slot text,
  published_version_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  check ((template_type = 'full' and root_kind is null and section_id is null and root_slot is null)
    or (template_type = 'module' and root_kind is not null and section_id is not null and root_slot is not null))
);

create table public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates(id) on delete restrict,
  revision integer not null check (revision > 0),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 600),
  category text not null default '' check (length(category) <= 80),
  structure jsonb not null,
  state text not null default 'pending' check (state in ('pending', 'approved', 'rejected')),
  author_id uuid not null references public.profiles(id) on delete restrict,
  reviewer_id uuid references public.profiles(id) on delete restrict,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, revision),
  unique (template_id, id)
);

alter table public.document_templates add constraint document_templates_published_fkey
  foreign key (id, published_version_id) references public.document_template_versions(template_id, id) deferrable initially deferred;
create unique index document_template_one_pending on public.document_template_versions(template_id) where state = 'pending';
create index document_template_versions_author on public.document_template_versions(author_id, created_at desc);

create table public.document_template_events (
  id bigint generated always as identity primary key,
  template_id uuid not null references public.document_templates(id) on delete restrict,
  version_id uuid references public.document_template_versions(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('proposed', 'approved', 'rejected', 'retired')),
  reason text,
  created_at timestamptz not null default now()
);

create function public.template_check_node(n jsonb, parent_kind text, owner_section text, seen text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  k text;
  kind text;
  sid text;
  cfg jsonb;
  child jsonb;
  col jsonb;
  ids text[] := seen;
begin
  if jsonb_typeof(n) is distinct from 'object' or (select count(*) from pg_catalog.jsonb_object_keys(n) x where x <> all(array['templateNodeId','kind','sectionId','label','config','children'])) > 0 then
    raise exception 'invalid_template_node';
  end if;
  kind := n->>'kind'; sid := n->>'sectionId'; k := n->>'templateNodeId'; cfg := n->'config';
  if k is null or length(k) not between 1 and 100 or k = any(ids)
    or sid is null or sid not in ('01','02','03','04','05','06','07','08') or sid is distinct from owner_section
    or kind is null or kind not in ('section','technicalProfile','standardTable','technicalSubsection','dataSubsection','dataSource')
    or n->>'label' is null or length(n->>'label') > 160
    or jsonb_typeof(cfg) is distinct from 'object' or jsonb_typeof(n->'children') is distinct from 'array'
    or jsonb_array_length(n->'children') > 100 then raise exception 'invalid_template_node'; end if;
  if not ((parent_kind is null and kind = 'section')
    or (parent_kind = 'section' and ((sid = '01' and kind = 'technicalProfile')
      or (sid in ('02','04','07','08') and kind = 'standardTable')
      or (sid = '05' and kind = 'technicalSubsection')
      or (sid = '06' and kind = 'dataSubsection')))
    or (parent_kind = 'dataSubsection' and kind = 'dataSource' and sid = '06')) then raise exception 'invalid_template_hierarchy'; end if;
  if (kind in ('section','dataSubsection') and cfg <> '{}'::jsonb)
    or (kind = 'technicalSubsection' and (select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> 'codeEnabled') > 0)
    or (kind = 'technicalSubsection' and jsonb_typeof(cfg->'codeEnabled') is distinct from 'boolean')
    or (kind = 'technicalProfile' and ((select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> all(array['tags','customOptions'])) > 0 or jsonb_typeof(cfg->'tags') is distinct from 'array' or jsonb_typeof(cfg->'customOptions') is distinct from 'object'))
    or (kind = 'standardTable' and (select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> all(array['slot','columns','rowCount'])) > 0)
    or (kind = 'dataSource' and (select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> all(array['type','columns','rowCount'])) > 0) then raise exception 'invalid_template_config'; end if;
  if kind = 'technicalProfile' then
    if jsonb_array_length(cfg->'tags') > 40 or jsonb_array_length(n->'children') > 0
      or (select count(*) from pg_catalog.jsonb_object_keys(cfg->'customOptions') x where x <> all(array['technology','banking'])) > 0
      or jsonb_typeof(cfg->'customOptions'->'technology') is distinct from 'array'
      or jsonb_typeof(cfg->'customOptions'->'banking') is distinct from 'array'
      or jsonb_array_length(cfg->'customOptions'->'technology') > 40
      or jsonb_array_length(cfg->'customOptions'->'banking') > 40
      or exists (select 1 from pg_catalog.jsonb_array_elements(cfg->'tags') x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') > 80)
      or exists (select 1 from pg_catalog.jsonb_array_elements(cfg->'customOptions'->'technology') x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') > 80)
      or exists (select 1 from pg_catalog.jsonb_array_elements(cfg->'customOptions'->'banking') x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') > 80)
    then raise exception 'invalid_template_profile'; end if;
  end if;
  if kind = 'standardTable' and cfg->>'slot' is distinct from (case sid when '02' then 'history' when '04' then 'affectedComponents' when '07' then 'testCases' when '08' then 'references' end) then
    raise exception 'invalid_template_slot';
  end if;
  if kind in ('standardTable','dataSource') then
    if jsonb_typeof(cfg->'columns') is distinct from 'array' or jsonb_array_length(cfg->'columns') not between 1 and 30
      or cfg->>'rowCount' is null or (cfg->>'rowCount') !~ '^[0-9]{1,3}$' or (cfg->>'rowCount')::integer > 100
      or jsonb_array_length(n->'children') > 0 then raise exception 'invalid_template_table'; end if;
    -- El nombre de la fuente original es dato documental: la etiqueta publicada
    -- solo puede ser el tipo genérico permitido.
    if kind = 'dataSource' and (cfg->>'type' is null or cfg->>'type' not in ('Tabla','Fichero','Datos')
      or n->>'label' is distinct from cfg->>'type') then raise exception 'invalid_template_source'; end if;
    if (select count(distinct x->>'id') from pg_catalog.jsonb_array_elements(cfg->'columns') x) <> jsonb_array_length(cfg->'columns') then raise exception 'duplicate_template_columns'; end if;
    for col in select value from pg_catalog.jsonb_array_elements(cfg->'columns') loop
      if jsonb_typeof(col) is distinct from 'object' or (select count(*) from pg_catalog.jsonb_object_keys(col) x where x <> all(array['id','label','kind','width'])) > 0
        or col->>'id' is null or length(col->>'id') not between 1 and 80 or col->>'label' is null or length(col->>'label') not between 1 and 120
        or col->>'kind' is null or col->>'kind' not in ('text','date','action') or length(coalesce(col->>'width','')) > 20 then raise exception 'invalid_template_column'; end if;
    end loop;
  elsif kind not in ('section','dataSubsection') and jsonb_array_length(n->'children') > 0 then raise exception 'invalid_template_children'; end if;
  ids := array_append(ids, k);
  for child in select value from pg_catalog.jsonb_array_elements(n->'children') loop
    ids := public.template_check_node(child, kind, sid, ids);
  end loop;
  return ids;
end;
$$;

create function public.template_validate_structure(body jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  section jsonb;
  ids text[] := '{}';
  section_ids text[] := '{}';
  root jsonb;
  root_node jsonb;
  node_cursor jsonb;
begin
  if body is null or pg_catalog.octet_length(body::text) > 262144 or jsonb_typeof(body) is distinct from 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(body) x where x <> all(array['schemaVersion','type','root','sections'])) > 0
    or body->>'schemaVersion' is null or body->>'schemaVersion' <> '1'
    or body->>'type' is null or body->>'type' not in ('full','module')
    or jsonb_typeof(body->'sections') is distinct from 'array' or jsonb_array_length(body->'sections') not between 1 and 8
  then raise exception 'invalid_template_structure'; end if;
  for section in select value from pg_catalog.jsonb_array_elements(body->'sections') loop
    if section->>'sectionId' = any(section_ids) then raise exception 'duplicate_template_sections'; end if;
    section_ids := array_append(section_ids, section->>'sectionId');
    ids := public.template_check_node(section, null, section->>'sectionId', ids);
    if section->>'sectionId' in ('01','02','04','07','08') and
      (select count(*) from pg_catalog.jsonb_array_elements(section->'children') x) > 1 then raise exception 'duplicate_template_section_module'; end if;
  end loop;
  root := body->'root';
  if body->>'type' = 'full' then
    if root is distinct from 'null'::jsonb then raise exception 'full_template_has_root'; end if;
  else
    if jsonb_typeof(root) is distinct from 'object' or (select count(*) from pg_catalog.jsonb_object_keys(root) x where x <> all(array['rootKind','sectionId','rootSlot','rootNodeId'])) > 0
      or root->>'rootKind' is null or root->>'sectionId' is null or root->>'rootSlot' is null or root->>'rootNodeId' is null
      or root->>'rootNodeId' <> all(ids) or root->>'sectionId' <> all(section_ids)
      or jsonb_array_length(body->'sections') <> 1 then raise exception 'invalid_module_root'; end if;
    if not ((root->>'rootKind' = 'section' and root->>'rootSlot' = 'section')
      or (root->>'rootKind' = 'technicalSubsection' and root->>'sectionId' = '05' and root->>'rootSlot' = 'technicalDetail.items')
      or (root->>'rootKind' = 'dataSubsection' and root->>'sectionId' = '06' and root->>'rootSlot' = 'dataModel.groups')
      or (root->>'rootKind' = 'dataSource' and root->>'sectionId' = '06' and root->>'rootSlot' = 'dataModel.groups.sources')
      or (root->>'rootKind' = 'standardTable' and root->>'rootSlot' = (case root->>'sectionId' when '02' then 'history' when '04' then 'affectedComponents' when '07' then 'testCases' when '08' then 'references' end))) then raise exception 'invalid_module_slot'; end if;
    if root->>'rootKind' = 'section' then root_node := body->'sections'->0;
    elsif root->>'rootKind' = 'dataSource' then root_node := body->'sections'->0->'children'->0->'children'->0;
    else root_node := body->'sections'->0->'children'->0; end if;
    if root_node->>'templateNodeId' is distinct from root->>'rootNodeId' or root_node->>'kind' is distinct from root->>'rootKind'
      or (root->>'rootKind' <> 'section' and jsonb_array_length(body->'sections'->0->'children') <> 1)
      or (root->>'rootKind' = 'dataSource' and jsonb_array_length(body->'sections'->0->'children'->0->'children') <> 1)
    then raise exception 'invalid_module_branch'; end if;
  end if;
end;
$$;

alter table public.document_templates enable row level security;
alter table public.document_template_versions enable row level security;
alter table public.document_template_events enable row level security;

create policy template_identity_read on public.document_templates for select to authenticated
using (public.is_active_user() and (owner_id = auth.uid() or public.is_admin() or (retired_at is null and published_version_id is not null)));
-- Calificar la fila externa evita que id se resuelva como t.id dentro del EXISTS.
create policy template_version_read on public.document_template_versions for select to authenticated
using (public.is_active_user() and (author_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.document_templates t
    where t.id = document_template_versions.template_id
      and t.published_version_id = document_template_versions.id
      and t.retired_at is null
      and document_template_versions.state = 'approved')));
create policy template_event_read on public.document_template_events for select to authenticated
using (public.is_active_user() and (public.is_admin() or exists (select 1 from public.document_templates t where t.id = template_id and t.owner_id = auth.uid())));

revoke all on public.document_templates, public.document_template_versions, public.document_template_events from public, anon;
grant select on public.document_templates, public.document_template_versions, public.document_template_events to authenticated;

create function public.template_propose(p_template_id uuid, p_name text, p_description text, p_category text, p_structure jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  t public.document_templates%rowtype;
  v_id uuid;
  next_revision integer;
begin
  if actor is null or coalesce(public.current_app_role() not in ('admin','editor'), true) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.template_validate_structure(p_structure);
  if length(btrim(coalesce(p_name,''))) not between 1 and 120 or length(coalesce(p_description,'')) > 600 or length(coalesce(p_category,'')) > 80 then raise exception 'invalid_template_metadata'; end if;
  if p_template_id is null then
    insert into public.document_templates (owner_id, template_type, root_kind, section_id, root_slot)
    values (actor, p_structure->>'type', p_structure->'root'->>'rootKind', p_structure->'root'->>'sectionId', p_structure->'root'->>'rootSlot') returning * into t;
  else
    select * into t from public.document_templates where id = p_template_id for update;
    if not found or t.retired_at is not null then raise exception 'template_not_available'; end if;
    if t.owner_id <> actor and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
    if t.template_type is distinct from p_structure->>'type' or t.root_kind is distinct from p_structure->'root'->>'rootKind'
      or t.section_id is distinct from p_structure->'root'->>'sectionId' or t.root_slot is distinct from p_structure->'root'->>'rootSlot' then raise exception 'template_root_changed'; end if;
  end if;
  select coalesce(max(revision), 0) + 1 into next_revision from public.document_template_versions where template_id = t.id;
  insert into public.document_template_versions (template_id, revision, name, description, category, structure, author_id)
  values (t.id, next_revision, btrim(p_name), coalesce(p_description,''), coalesce(p_category,''), p_structure, actor) returning id into v_id;
  insert into public.document_template_events (template_id, version_id, actor_id, action) values (t.id, v_id, actor, 'proposed');
  return v_id;
end;
$$;

create function public.template_review(p_version_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v public.document_template_versions%rowtype;
  t public.document_templates%rowtype;
begin
  if actor is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approved','rejected') or (p_action = 'rejected' and length(btrim(coalesce(p_reason,''))) = 0) or length(coalesce(p_reason,'')) > 600 then raise exception 'invalid_review'; end if;
  select * into v from public.document_template_versions where id = p_version_id for update;
  if not found or v.state <> 'pending' then raise exception 'template_review_conflict'; end if;
  select * into t from public.document_templates where id = v.template_id for update;
  if t.retired_at is not null then raise exception 'template_retired'; end if;
  perform public.template_validate_structure(v.structure);
  update public.document_template_versions set state = p_action, reviewer_id = actor, review_reason = case when p_action = 'rejected' then btrim(p_reason) else null end, reviewed_at = now() where id = v.id;
  if p_action = 'approved' then update public.document_templates set published_version_id = v.id where id = t.id; end if;
  insert into public.document_template_events (template_id, version_id, actor_id, action, reason) values (t.id, v.id, actor, p_action, p_reason);
end;
$$;

create function public.template_retire(p_template_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); t public.document_templates%rowtype;
begin
  if actor is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into t from public.document_templates where id = p_template_id for update;
  if not found or t.retired_at is not null then raise exception 'template_not_available'; end if;
  update public.document_templates set retired_at = now() where id = t.id;
  insert into public.document_template_events (template_id, version_id, actor_id, action) values (t.id, t.published_version_id, actor, 'retired');
end;
$$;

create function public.template_current(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if coalesce(public.current_app_role() not in ('admin','editor'), true) then raise exception 'forbidden' using errcode = '42501'; end if;
  select v.structure into result from public.document_template_versions v join public.document_templates t on t.id = v.template_id
  where v.id = p_version_id and v.state = 'approved' and t.published_version_id = v.id and t.retired_at is null;
  if result is null then raise exception 'template_not_available'; end if;
  return result;
end;
$$;

revoke all on function public.template_check_node(jsonb,text,text,text[]) from public, anon, authenticated;
revoke all on function public.template_validate_structure(jsonb) from public, anon, authenticated;
revoke all on function public.template_propose(uuid,text,text,text,jsonb) from public, anon;
revoke all on function public.template_review(uuid,text,text) from public, anon;
revoke all on function public.template_retire(uuid) from public, anon;
revoke all on function public.template_current(uuid) from public, anon;
grant execute on function public.template_propose(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.template_review(uuid,text,text) to authenticated;
grant execute on function public.template_retire(uuid) to authenticated;
grant execute on function public.template_current(uuid) to authenticated;
