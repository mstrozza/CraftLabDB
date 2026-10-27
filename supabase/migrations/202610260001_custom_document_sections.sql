-- Mantiene intacto el validador de estructuras publicadas v1.
alter function public.template_validate_structure(jsonb) rename to template_validate_structure_v1;

create function public.template_check_node_v2(n jsonb, parent_kind text, owner_section text, seen text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  kind text;
  sid text;
  cfg jsonb;
  ids text[] := seen;
  child jsonb;
  col jsonb;
begin
  if jsonb_typeof(n) is distinct from 'object' or
    (select count(*) from pg_catalog.jsonb_object_keys(n) x where x <> all(array['templateNodeId','kind','sectionId','label','config','children'])) > 0
  then raise exception 'invalid_template_node'; end if;
  kind := n->>'kind'; sid := n->>'sectionId'; cfg := n->'config';
  if n->>'templateNodeId' is null or length(n->>'templateNodeId') not between 1 and 100 or n->>'templateNodeId' = any(ids)
    or sid is null or sid is distinct from owner_section
    or (sid not in ('01','02','03','04','05','06','07','08') and sid !~ '^section-[A-Za-z0-9-]{8,}$')
    or n->>'label' is null or length(n->>'label') > 160
    or jsonb_typeof(cfg) is distinct from 'object' or jsonb_typeof(n->'children') is distinct from 'array'
    or jsonb_array_length(n->'children') > 100
  then raise exception 'invalid_template_node'; end if;
  if parent_kind is null then
    if kind <> 'section' or
      (select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> all(array['title','active','sectionType'])) > 0
      or length(btrim(coalesce(cfg->>'title',''))) not between 1 and 160
      or jsonb_typeof(cfg->'active') is distinct from 'boolean'
      or cfg->>'sectionType' is distinct from (case when sid in ('01','02','03','04','05','06','07','08') then 'builtIn' else 'custom' end)
      or n->>'label' is distinct from cfg->>'title'
    then raise exception 'invalid_template_section'; end if;
  elsif parent_kind = 'section' then
    if (sid in ('01','02','03','04','05','06','07','08') and not ((sid = '01' and kind = 'technicalProfile') or (sid in ('02','04','07','08') and kind = 'standardTable') or (sid = '05' and kind = 'technicalSubsection') or (sid = '06' and kind = 'dataSubsection')))
      or (sid not in ('01','02','03','04','05','06','07','08') and kind not in ('customDescription','customSubsections','customTable','customCobol'))
    then raise exception 'invalid_template_hierarchy'; end if;
  elsif not ((parent_kind = 'dataSubsection' and kind = 'dataSource' and sid = '06')
    or (parent_kind = 'customSubsections' and kind = 'customSubsection' and sid not in ('01','02','03','04','05','06','07','08')))
  then raise exception 'invalid_template_hierarchy'; end if;

  -- Las etiquetas libres corresponden solo a títulos estructurales.
  -- Un bloque genérico no debe transportar texto documental.
  if kind in ('customDescription','customSubsections','customTable','customCobol')
    and n->>'label' is distinct from (case kind
      when 'customDescription' then 'Descripción'
      when 'customSubsections' then 'Subapartados'
      when 'customTable' then 'Tabla'
      when 'customCobol' then 'COBOL' end)
  then raise exception 'invalid_template_label'; end if;

  if kind in ('dataSubsection','customDescription','customSubsections','customSubsection','customCobol') and cfg <> '{}'::jsonb
    or kind = 'technicalSubsection' and ((select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> 'codeEnabled') > 0 or jsonb_typeof(cfg->'codeEnabled') is distinct from 'boolean')
    or kind = 'technicalProfile' and ((select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> all(array['tags','customOptions'])) > 0 or jsonb_typeof(cfg->'tags') is distinct from 'array' or jsonb_typeof(cfg->'customOptions') is distinct from 'object')
    or kind in ('standardTable','dataSource','customTable') and (select count(*) from pg_catalog.jsonb_object_keys(cfg) x where x <> all(case when kind = 'standardTable' then array['slot','columns','rowCount'] when kind = 'dataSource' then array['type','columns','rowCount'] else array['columns','rowCount'] end)) > 0
  then raise exception 'invalid_template_config'; end if;
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
  if kind = 'standardTable' and cfg->>'slot' is distinct from (case sid when '02' then 'history' when '04' then 'affectedComponents' when '07' then 'testCases' when '08' then 'references' end) then raise exception 'invalid_template_slot'; end if;
  if kind = 'dataSource' and (cfg->>'type' not in ('Tabla','Fichero','Datos') or n->>'label' is distinct from cfg->>'type') then raise exception 'invalid_template_source'; end if;
  if kind in ('standardTable','dataSource','customTable') then
    if jsonb_typeof(cfg->'columns') is distinct from 'array' or jsonb_array_length(cfg->'columns') not between 1 and 30
      or cfg->>'rowCount' is null or cfg->>'rowCount' !~ '^[0-9]{1,3}$' or (cfg->>'rowCount')::integer > 100
      or jsonb_array_length(n->'children') > 0
      or (select count(distinct x->>'id') from pg_catalog.jsonb_array_elements(cfg->'columns') x) <> jsonb_array_length(cfg->'columns')
    then raise exception 'invalid_template_table'; end if;
    for col in select value from pg_catalog.jsonb_array_elements(cfg->'columns') loop
      if jsonb_typeof(col) is distinct from 'object' or (select count(*) from pg_catalog.jsonb_object_keys(col) x where x <> all(array['id','label','kind','width'])) > 0
        or length(coalesce(col->>'id','')) not between 1 and 80 or length(coalesce(col->>'label','')) not between 1 and 120
        or col->>'kind' not in ('text','date','action') or length(coalesce(col->>'width','')) > 20
      then raise exception 'invalid_template_column'; end if;
    end loop;
  elsif kind not in ('section','dataSubsection','customSubsections') and jsonb_array_length(n->'children') > 0 then raise exception 'invalid_template_children'; end if;
  ids := array_append(ids, n->>'templateNodeId');
  for child in select value from pg_catalog.jsonb_array_elements(n->'children') loop
    ids := public.template_check_node_v2(child, kind, sid, ids);
  end loop;
  return ids;
end;
$$;

create function public.template_validate_structure_v2(body jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  section jsonb;
  child jsonb;
  ids text[] := '{}';
  section_ids text[] := '{}';
  kinds text[];
  root jsonb;
  root_node jsonb;
begin
  if body is null or pg_catalog.octet_length(body::text) > 262144 or jsonb_typeof(body) is distinct from 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(body) x where x <> all(array['schemaVersion','type','root','sections'])) > 0
    or body->>'schemaVersion' <> '2' or body->>'type' not in ('full','module')
    or jsonb_typeof(body->'sections') is distinct from 'array' or jsonb_array_length(body->'sections') not between 1 and 30
  then raise exception 'invalid_template_structure'; end if;
  for section in select value from pg_catalog.jsonb_array_elements(body->'sections') loop
    if section->>'sectionId' = any(section_ids) then raise exception 'duplicate_template_sections'; end if;
    section_ids := array_append(section_ids, section->>'sectionId');
    ids := public.template_check_node_v2(section, null, section->>'sectionId', ids);
    select array_agg(value->>'kind') into kinds from pg_catalog.jsonb_array_elements(section->'children');
    if (select count(*) from unnest(coalesce(kinds, '{}'::text[])) x) <> (select count(distinct x) from unnest(coalesce(kinds, '{}'::text[])) x)
      and section->>'sectionId' not in ('05','06') then raise exception 'duplicate_template_section_module'; end if;
    if section->'config'->>'sectionType' = 'custom' and jsonb_array_length(section->'children') = 0 then raise exception 'empty_custom_section'; end if;
  end loop;
  root := body->'root';
  if body->>'type' = 'full' then
    if root is distinct from 'null'::jsonb then raise exception 'full_template_has_root'; end if;
  else
    if jsonb_typeof(root) is distinct from 'object' or (select count(*) from pg_catalog.jsonb_object_keys(root) x where x <> all(array['rootKind','sectionId','rootSlot','rootNodeId'])) > 0
      or root->>'rootKind' is null or root->>'sectionId' is null or root->>'rootSlot' is null or root->>'rootNodeId' is null
      or root->>'rootNodeId' <> all(ids) or root->>'sectionId' <> all(section_ids) or jsonb_array_length(body->'sections') <> 1
    then raise exception 'invalid_module_root'; end if;
    if not ((root->>'rootKind' = 'section' and root->>'rootSlot' = 'section')
      or (root->>'rootKind' = 'technicalSubsection' and root->>'sectionId' = '05' and root->>'rootSlot' = 'technicalDetail.items')
      or (root->>'rootKind' = 'dataSubsection' and root->>'sectionId' = '06' and root->>'rootSlot' = 'dataModel.groups')
      or (root->>'rootKind' = 'dataSource' and root->>'sectionId' = '06' and root->>'rootSlot' = 'dataModel.groups.sources')
      or (root->>'rootKind' = 'standardTable' and root->>'rootSlot' = (case root->>'sectionId' when '02' then 'history' when '04' then 'affectedComponents' when '07' then 'testCases' when '08' then 'references' end))
      or (root->>'rootKind' in ('customDescription','customSubsections','customSubsection','customTable','customCobol') and root->>'sectionId' !~ '^(0[1-8])$' and root->>'rootSlot' = (case root->>'rootKind' when 'customDescription' then 'custom.description' when 'customSubsections' then 'custom.subsections' when 'customSubsection' then 'custom.subsections.items' when 'customTable' then 'custom.table' when 'customCobol' then 'custom.cobol' end)))
    then raise exception 'invalid_module_slot'; end if;
    if root->>'rootKind' = 'section' then root_node := body->'sections'->0;
    elsif root->>'rootKind' in ('dataSource','customSubsection') then root_node := body->'sections'->0->'children'->0->'children'->0;
    else root_node := body->'sections'->0->'children'->0; end if;
    if root_node->>'templateNodeId' is distinct from root->>'rootNodeId' or root_node->>'kind' is distinct from root->>'rootKind'
      or (root->>'rootKind' <> 'section' and jsonb_array_length(body->'sections'->0->'children') <> 1)
      or (root->>'rootKind' in ('dataSource','customSubsection') and jsonb_array_length(body->'sections'->0->'children'->0->'children') <> 1)
    then raise exception 'invalid_module_branch'; end if;
  end if;
end;
$$;

create function public.template_validate_structure(body jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if body->>'schemaVersion' = '1' then
    perform public.template_validate_structure_v1(body);
  elsif body->>'schemaVersion' = '2' then
    perform public.template_validate_structure_v2(body);
  else
    raise exception 'invalid_template_structure';
  end if;
end;
$$;

revoke all on function public.template_validate_structure_v1(jsonb) from public, anon, authenticated;
revoke all on function public.template_check_node_v2(jsonb,text,text,text[]) from public, anon, authenticated;
revoke all on function public.template_validate_structure_v2(jsonb) from public, anon, authenticated;
revoke all on function public.template_validate_structure(jsonb) from public, anon, authenticated;
