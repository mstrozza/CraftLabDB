-- Private use and soft deletion of own pending/rejected template proposals.
alter table public.document_template_versions add column deleted_at timestamptz;

drop index public.document_template_one_pending;
create unique index document_template_one_pending on public.document_template_versions(template_id)
  where state = 'pending' and deleted_at is null;

alter table public.document_template_events drop constraint document_template_events_action_check;
alter table public.document_template_events add constraint document_template_events_action_check
  check (action in ('proposed', 'approved', 'rejected', 'retired', 'deleted'));

drop policy template_version_read on public.document_template_versions;
create policy template_version_read on public.document_template_versions for select to authenticated
using (deleted_at is null and public.is_active_user() and (author_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.document_templates t
    where t.id = document_template_versions.template_id
      and t.published_version_id = document_template_versions.id
      and t.retired_at is null
      and document_template_versions.state = 'approved')));

create or replace function public.template_review(p_version_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v public.document_template_versions%rowtype;
  t public.document_templates%rowtype;
begin
  if actor is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approved','rejected') or (p_action = 'rejected' and length(btrim(coalesce(p_reason,''))) = 0) or length(coalesce(p_reason,'')) > 600 then raise exception 'invalid_review'; end if;
  select * into v from public.document_template_versions where id = p_version_id for update;
  if not found or v.state <> 'pending' or v.deleted_at is not null then raise exception 'template_review_conflict'; end if;
  select * into t from public.document_templates where id = v.template_id for update;
  if t.retired_at is not null then raise exception 'template_retired'; end if;
  perform public.template_validate_structure(v.structure);
  update public.document_template_versions set state = p_action, reviewer_id = actor, review_reason = case when p_action = 'rejected' then btrim(p_reason) else null end, reviewed_at = now() where id = v.id;
  if p_action = 'approved' then update public.document_templates set published_version_id = v.id where id = t.id; end if;
  insert into public.document_template_events (template_id, version_id, actor_id, action, reason) values (t.id, v.id, actor, p_action, p_reason);
end;
$$;

create function public.template_own_current(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(public.current_app_role() not in ('admin','editor'), true) then raise exception 'forbidden' using errcode = '42501'; end if;
  select v.structure into result from public.document_template_versions v
    join public.document_templates t on t.id = v.template_id
    where v.id = p_version_id and v.author_id = auth.uid() and v.state in ('pending','rejected')
      and v.deleted_at is null and t.published_version_id is distinct from v.id;
  if result is null then raise exception 'template_not_available'; end if;
  return result;
end;
$$;

create function public.template_delete_proposal(p_version_id uuid, p_expected_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v public.document_template_versions%rowtype;
  t public.document_templates%rowtype;
begin
  if actor is null or coalesce(public.current_app_role() not in ('admin','editor'), true) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Match template_review's lock order to serialize decisions and deletion.
  select * into v from public.document_template_versions where id = p_version_id for update;
  if not found then raise exception 'template_delete_conflict'; end if;
  select * into t from public.document_templates where id = v.template_id for update;
  if v.author_id <> actor then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected_state not in ('pending','rejected') or v.deleted_at is not null
    or v.state is distinct from p_expected_state or t.published_version_id = v.id then
    raise exception 'template_delete_conflict';
  end if;
  update public.document_template_versions set deleted_at = now() where id = v.id;
  insert into public.document_template_events (template_id, version_id, actor_id, action)
    values (t.id, v.id, actor, 'deleted');
end;
$$;

revoke all on function public.template_own_current(uuid) from public, anon;
revoke all on function public.template_delete_proposal(uuid,text) from public, anon;
grant execute on function public.template_own_current(uuid) to authenticated;
grant execute on function public.template_delete_proposal(uuid,text) to authenticated;
