-- PostgreSQL cannot use a newly added enum value in the same transaction.
-- Apply this migration before 202610030003_reactivation_flow.sql.
create type public.access_request_kind as enum ('registration', 'reactivation');

alter table public.access_requests
  add column request_kind public.access_request_kind not null default 'registration';

alter type public.access_request_status add value 'reactivated';
