-- Personal hiding does not change global deletion or publication.
alter table public.document_template_versions add column author_hidden_at timestamptz;

alter table public.document_template_events drop constraint document_template_events_action_check;
alter table public.document_template_events add constraint document_template_events_action_check
  check (action in ('proposed', 'approved', 'rejected', 'retired', 'deleted', 'hidden'));

create or replace function public.template_own_current(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(public.current_app_role() not in ('admin','editor'), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select structure into result from public.document_template_versions
    where id = p_version_id and author_id = auth.uid()
      and deleted_at is null and author_hidden_at is null;
  if result is null then raise exception 'template_not_available'; end if;
  return result;
end;
$$;

create function public.template_hide_own_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v public.document_template_versions%rowtype;
begin
  if actor is null or coalesce(public.current_app_role() not in ('admin','editor'), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v from public.document_template_versions where id = p_version_id for update;
  if not found or v.deleted_at is not null or v.author_hidden_at is not null then
    raise exception 'template_hide_conflict';
  end if;
  if v.author_id <> actor then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.document_template_versions set author_hidden_at = now() where id = v.id;
  insert into public.document_template_events (template_id, version_id, actor_id, action)
    values (v.template_id, v.id, actor, 'hidden');
end;
$$;

-- Keep the legacy endpoint callable, but never let it globally delete a version
-- that its author has already hidden only from the personal history.
create or replace function public.template_delete_proposal(p_version_id uuid, p_expected_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v public.document_template_versions%rowtype;
  t public.document_templates%rowtype;
begin
  if actor is null or coalesce(public.current_app_role() not in ('admin','editor'), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v from public.document_template_versions where id = p_version_id for update;
  if not found then raise exception 'template_delete_conflict'; end if;
  select * into t from public.document_templates where id = v.template_id for update;
  if v.author_id <> actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_state not in ('pending','rejected') or v.deleted_at is not null
    or v.author_hidden_at is not null or v.state is distinct from p_expected_state
    or t.published_version_id = v.id then
    raise exception 'template_delete_conflict';
  end if;
  update public.document_template_versions set deleted_at = now() where id = v.id;
  insert into public.document_template_events (template_id, version_id, actor_id, action)
    values (t.id, v.id, actor, 'deleted');
end;
$$;

create or replace function public.template_review(p_version_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v public.document_template_versions%rowtype;
  t public.document_templates%rowtype;
  clean_reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\n\r'), '');
begin
  if actor is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('approved','rejected') or length(coalesce(p_reason,'')) > 600 then
    raise exception 'invalid_review';
  end if;
  select * into v from public.document_template_versions where id = p_version_id for update;
  if not found or v.state <> 'pending' or v.deleted_at is not null then raise exception 'template_review_conflict'; end if;
  select * into t from public.document_templates where id = v.template_id for update;
  if t.retired_at is not null then raise exception 'template_retired'; end if;
  perform public.template_validate_structure(v.structure);
  update public.document_template_versions set state = p_action, reviewer_id = actor,
    review_reason = case when p_action = 'rejected' then clean_reason else null end,
    reviewed_at = now() where id = v.id;
  if p_action = 'approved' then
    update public.document_templates set published_version_id = v.id where id = t.id;
  end if;
  insert into public.document_template_events (template_id, version_id, actor_id, action, reason)
    values (t.id, v.id, actor, p_action, case when p_action = 'rejected' then clean_reason else null end);
end;
$$;

revoke all on function public.template_hide_own_version(uuid) from public, anon;
grant execute on function public.template_hide_own_version(uuid) to authenticated;
