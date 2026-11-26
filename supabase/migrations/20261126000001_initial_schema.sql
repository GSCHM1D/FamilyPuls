-- =============================================================================
-- FamilyPulse – initial schema
-- All IDs are UUIDs. Technical timestamps are timestamptz (UTC).
-- Health data is written exclusively by the backend (service role).
-- Read access for health data is enforced by Row Level Security via
-- public.can_view(owner, category), which checks explicit sharing consent.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_path text check (avatar_path is null or char_length(avatar_path) < 300),
  locale text not null default 'de' check (locale in ('de', 'en')),
  timezone text not null default 'Europe/Zurich' check (char_length(timezone) between 1 and 64),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically for every auth user (invite acceptance, seeds).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_demo)
  values (
    new.id,
    coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 60), ''), split_part(new.email, '@', 1), 'Mitglied'),
    coalesce((new.raw_app_meta_data ->> 'is_demo')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Families & membership
-- ---------------------------------------------------------------------------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
-- Version 1: each user belongs to exactly one family group.
create unique index family_members_one_family_per_user on public.family_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique, -- SHA-256 of the secret token; the token itself is never stored
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_one_open_per_email on public.invitations (family_id, email)
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Tracker connections & credentials
-- ---------------------------------------------------------------------------
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('whoop', 'google_health')),
  external_user_id text,
  status text not null default 'active' check (status in ('active', 'syncing', 'error', 'reauth_required', 'disconnected')),
  granted_scopes text[] not null default '{}',
  missing_scopes text[] not null default '{}',
  last_synced_at timestamptz,
  last_webhook_at timestamptz,
  last_error text,
  history_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, external_user_id)
);
create trigger provider_connections_updated_at before update on public.provider_connections
  for each row execute function public.set_updated_at();

-- Encrypted tokens (AES-256-GCM in the application). No RLS policy exists and
-- all privileges are revoked from anon/authenticated: only the service role
-- (server) can read or write this table. Never expose it through a view.
create table public.provider_credentials (
  connection_id uuid primary key references public.provider_connections (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scope text,
  refresh_lock_until timestamptz,
  updated_at timestamptz not null default now()
);
create trigger provider_credentials_updated_at before update on public.provider_credentials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Normalized health data
-- ---------------------------------------------------------------------------
create table public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('whoop', 'google_health', 'demo')),
  metric text not null check (char_length(metric) <= 64),
  category text not null check (category in ('recovery', 'sleep', 'activity', 'heart_rate', 'hrv', 'health_metrics', 'workouts')),
  value double precision not null,
  unit text not null default '',
  local_date date not null,
  measured_at timestamptz,
  external_id text,
  aggregation text,
  synced_at timestamptz not null default now(),
  unique (user_id, source, metric, local_date)
);
create index daily_metrics_user_date on public.daily_metrics (user_id, local_date desc);
create index daily_metrics_user_metric_date on public.daily_metrics (user_id, metric, local_date);

create table public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('whoop', 'google_health', 'demo')),
  external_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  local_date date not null,
  is_nap boolean not null default false,
  duration_asleep_min double precision,
  in_bed_min double precision,
  awake_min double precision,
  light_min double precision,
  deep_min double precision,
  rem_min double precision,
  efficiency_pct double precision,
  performance_pct double precision,
  respiratory_rate double precision,
  synced_at timestamptz not null default now(),
  unique (user_id, source, external_id),
  check (end_at >= start_at)
);
create index sleep_sessions_user_date on public.sleep_sessions (user_id, local_date desc);

create table public.sleep_stages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sleep_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  stage text not null check (stage in ('awake', 'light', 'deep', 'rem', 'asleep', 'restless')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  unique (session_id, start_at)
);
create index sleep_stages_session on public.sleep_stages (session_id, start_at);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('whoop', 'google_health', 'demo')),
  external_id text not null,
  sport text not null default 'unknown',
  start_at timestamptz not null,
  end_at timestamptz not null,
  local_date date not null,
  duration_min double precision not null,
  calories double precision,
  avg_heart_rate double precision,
  max_heart_rate double precision,
  strain double precision,
  distance_m double precision,
  synced_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index workouts_user_date on public.workouts (user_id, local_date desc);

-- Individual measurements that are not daily aggregates (e.g. body measurements).
create table public.health_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('whoop', 'google_health', 'demo')),
  metric text not null check (char_length(metric) <= 64),
  category text not null check (category in ('recovery', 'sleep', 'activity', 'heart_rate', 'hrv', 'health_metrics', 'workouts')),
  value double precision not null,
  unit text not null default '',
  measured_at timestamptz not null,
  local_date date not null,
  external_id text,
  synced_at timestamptz not null default now(),
  unique (user_id, source, metric, local_date)
);
create index health_measurements_user_date on public.health_measurements (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- Sharing preferences – default: nothing is shared.
-- grantee_id null  = shared with all members of the owner's family
-- grantee_id set   = shared with this specific family member only
-- ---------------------------------------------------------------------------
create table public.sharing_preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('recovery', 'sleep', 'activity', 'heart_rate', 'hrv', 'health_metrics', 'workouts')),
  grantee_id uuid references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (grantee_id is null or grantee_id <> owner_id)
);
create unique index sharing_preferences_unique on public.sharing_preferences (owner_id, category, grantee_id) nulls not distinct;
create trigger sharing_preferences_updated_at before update on public.sharing_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Synchronisation
-- ---------------------------------------------------------------------------
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.provider_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('initial', 'incremental', 'backfill', 'webhook', 'manual', 'fallback')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  range_start date,
  range_end date,
  payload jsonb not null default '{}',
  dedupe_key text,
  attempts integer not null default 0,
  max_attempts integer not null default 6,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create unique index sync_jobs_dedupe_open on public.sync_jobs (dedupe_key) where status in ('queued', 'running') and dedupe_key is not null;
create index sync_jobs_due on public.sync_jobs (status, run_after);
create index sync_jobs_connection on public.sync_jobs (connection_id, created_at desc);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.provider_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.sync_jobs (id) on delete set null,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  message text not null check (char_length(message) <= 500),
  records integer,
  created_at timestamptz not null default now()
);
create index sync_logs_user on public.sync_logs (user_id, created_at desc);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('whoop', 'google_health')),
  event_key text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'queued', 'ignored', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_key)
);
create index webhook_events_received on public.webhook_events (received_at desc);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- ---------------------------------------------------------------------------
-- Demo isolation: synthetic rows may only belong to demo profiles and demo
-- profiles may never receive real provider data.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_demo_isolation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo boolean;
begin
  select p.is_demo into demo from public.profiles p where p.id = new.user_id;
  if new.source = 'demo' and coalesce(demo, false) = false then
    raise exception 'demo data can only be stored for demo profiles';
  end if;
  if new.source <> 'demo' and coalesce(demo, false) = true then
    raise exception 'real provider data cannot be stored for demo profiles';
  end if;
  return new;
end;
$$;

create trigger daily_metrics_demo_isolation before insert or update on public.daily_metrics
  for each row execute function public.enforce_demo_isolation();
create trigger sleep_sessions_demo_isolation before insert or update on public.sleep_sessions
  for each row execute function public.enforce_demo_isolation();
create trigger workouts_demo_isolation before insert or update on public.workouts
  for each row execute function public.enforce_demo_isolation();
create trigger health_measurements_demo_isolation before insert or update on public.health_measurements
  for each row execute function public.enforce_demo_isolation();

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER, fixed search_path)
-- ---------------------------------------------------------------------------
create or replace function public.shares_family(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fa
    join public.family_members fb on fa.family_id = fb.family_id
    where fa.user_id = a and fb.user_id = b
  );
$$;

create or replace function public.is_family_admin(p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = p_family and fm.user_id = (select auth.uid()) and fm.role = 'admin'
  );
$$;

-- Central sharing check. Note: being a family admin does NOT grant access.
create or replace function public.can_view(p_owner uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      p_owner = (select auth.uid())
      or (
        public.shares_family(p_owner, (select auth.uid()))
        and exists (
          select 1 from public.sharing_preferences sp
          where sp.owner_id = p_owner
            and sp.category = p_category
            and sp.enabled
            and (sp.grantee_id is null or sp.grantee_id = (select auth.uid()))
        )
      )
    );
$$;

-- Categories the current user may see for p_owner (used by the UI to show "not shared").
create or replace function public.visible_categories(p_owner uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c order by c), '{}')
    from unnest(array['recovery', 'sleep', 'activity', 'heart_rate', 'hrv', 'health_metrics', 'workouts']) as c
   where public.can_view(p_owner, c);
$$;

-- ---------------------------------------------------------------------------
-- Server-side job & lock helpers (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_sync_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Recover jobs whose worker died (lease expired).
  update public.sync_jobs
     set status = 'queued', locked_until = null
   where status = 'running' and locked_until < now();

  return query
  with candidates as (
    select q.id,
           q.run_after,
           case q.kind when 'manual' then 0 when 'webhook' then 1 when 'initial' then 2 else 3 end as prio,
           row_number() over (
             partition by q.connection_id
             order by case q.kind when 'manual' then 0 when 'webhook' then 1 when 'initial' then 2 else 3 end, q.run_after
           ) as rn
      from public.sync_jobs q
     where q.status = 'queued'
       and q.run_after <= now()
       -- never run two jobs for the same connection in parallel
       and not exists (
         select 1 from public.sync_jobs r
          where r.connection_id = q.connection_id and r.status = 'running'
       )
  ),
  picked as (
    select c.id from candidates c where c.rn = 1 order by c.prio, c.run_after limit p_limit
  ),
  locked as (
    select q.id from public.sync_jobs q join picked p on p.id = q.id for update of q skip locked
  )
  update public.sync_jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         started_at = now(),
         locked_until = now() + make_interval(secs => p_lease_seconds)
   where j.id in (select id from locked)
  returning j.*;
end;
$$;

create or replace function public.acquire_refresh_lock(p_connection uuid, p_lease_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  got uuid;
begin
  update public.provider_credentials
     set refresh_lock_until = now() + make_interval(secs => p_lease_seconds)
   where connection_id = p_connection
     and (refresh_lock_until is null or refresh_lock_until < now())
  returning connection_id into got;
  return got is not null;
end;
$$;

create or replace function public.release_refresh_lock(p_connection uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.provider_credentials set refresh_lock_until = null where connection_id = p_connection;
$$;

-- Fixed-window rate limiter. Returns true if the call is allowed.
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning count into current_count;
  return current_count <= p_max;
end;
$$;

-- Before a user is removed: promote another member if they are the last admin.
create or replace function public.ensure_admin_succession(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fam uuid;
  admins integer;
  successor uuid;
begin
  select family_id into fam from public.family_members where user_id = p_user and role = 'admin';
  if fam is null then return; end if;
  select count(*) into admins from public.family_members where family_id = fam and role = 'admin' and user_id <> p_user;
  if admins > 0 then return; end if;
  select user_id into successor from public.family_members
   where family_id = fam and user_id <> p_user order by joined_at limit 1;
  if successor is not null then
    update public.family_members set role = 'admin' where family_id = fam and user_id = successor;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: start from zero, grant the minimum.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.profiles, public.families, public.family_members, public.invitations,
  public.provider_connections, public.daily_metrics, public.sleep_sessions, public.sleep_stages,
  public.workouts, public.health_measurements, public.sharing_preferences, public.sync_jobs, public.sync_logs
  to authenticated;
grant update (display_name, avatar_path, locale, timezone, theme) on public.profiles to authenticated;
grant insert, update, delete on public.sharing_preferences to authenticated;

grant execute on function public.can_view(uuid, text) to authenticated;
grant execute on function public.shares_family(uuid, uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;
grant execute on function public.visible_categories(uuid) to authenticated;

grant execute on function public.claim_sync_jobs(integer, integer) to service_role;
grant execute on function public.acquire_refresh_lock(uuid, integer) to service_role;
grant execute on function public.release_refresh_lock(uuid) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.ensure_admin_succession(uuid) to service_role;

-- provider_credentials, webhook_events and rate_limits: no grants at all for
-- anon/authenticated (service role only).

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.invitations enable row level security;
alter table public.provider_connections enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.sleep_sessions enable row level security;
alter table public.sleep_stages enable row level security;
alter table public.workouts enable row level security;
alter table public.health_measurements enable row level security;
alter table public.sharing_preferences enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_logs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.rate_limits enable row level security;

-- Profiles: visible to self and family members (name and avatar only – no health data).
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_family(id, (select auth.uid())));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy families_select on public.families for select to authenticated
  using (exists (select 1 from public.family_members fm where fm.family_id = id and fm.user_id = (select auth.uid())));

create policy family_members_select on public.family_members for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family(user_id, (select auth.uid())));

create policy invitations_select_admin on public.invitations for select to authenticated
  using (public.is_family_admin(family_id));

-- Connection metadata (provider, status, last sync) is visible to the family; tokens are not in this table.
create policy provider_connections_select on public.provider_connections for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_family(user_id, (select auth.uid())));

-- Health data: owner or explicit sharing consent for the row's category.
create policy daily_metrics_select on public.daily_metrics for select to authenticated
  using (public.can_view(user_id, category));
create policy sleep_sessions_select on public.sleep_sessions for select to authenticated
  using (public.can_view(user_id, 'sleep'));
create policy sleep_stages_select on public.sleep_stages for select to authenticated
  using (public.can_view(user_id, 'sleep'));
create policy workouts_select on public.workouts for select to authenticated
  using (public.can_view(user_id, 'workouts'));
create policy health_measurements_select on public.health_measurements for select to authenticated
  using (public.can_view(user_id, category));

-- Sharing preferences: only the owner manages them; grantees must be family members.
create policy sharing_select_own on public.sharing_preferences for select to authenticated
  using (owner_id = (select auth.uid()));
create policy sharing_insert_own on public.sharing_preferences for insert to authenticated
  with check (owner_id = (select auth.uid()) and (grantee_id is null or public.shares_family(grantee_id, (select auth.uid()))));
create policy sharing_update_own on public.sharing_preferences for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (grantee_id is null or public.shares_family(grantee_id, (select auth.uid()))));
create policy sharing_delete_own on public.sharing_preferences for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy sync_jobs_select_own on public.sync_jobs for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_logs_select_own on public.sync_logs for select to authenticated
  using (user_id = (select auth.uid()));

-- provider_credentials, webhook_events, rate_limits: RLS enabled without any
-- policy => no access for anon/authenticated even if a grant is added by mistake.

-- ---------------------------------------------------------------------------
-- Storage: private avatar bucket. Path convention: <user_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_read_family on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.shares_family(((storage.foldername(name))[1])::uuid, (select auth.uid()))
    )
  );
create policy avatars_write_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
