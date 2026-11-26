-- Newer Supabase projects no longer grant table privileges to service_role by
-- default. The backend (sync jobs, OAuth callbacks, invitations) uses the
-- service role, so grant it explicitly. anon/authenticated stay restricted.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
