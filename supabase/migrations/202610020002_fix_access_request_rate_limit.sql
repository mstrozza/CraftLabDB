-- Preserve the RPC argument name and replace the body without dropping the function.
-- Positional argument references and the named constraint avoid column ambiguity.

create or replace function public.allow_access_request_attempt(client_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if $1 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid client hash';
  end if;

  insert into public.access_request_rate_limits (client_hash, window_started_at, attempt_count)
  values ($1, now(), 1)
  on conflict on constraint access_request_rate_limits_pkey do update
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
