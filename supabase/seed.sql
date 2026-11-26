-- =============================================================================
-- FamilyPulse – LOCAL DEVELOPMENT SEED (fictional data only!)
-- Applied by `supabase db reset` against a local Supabase stack.
-- Never run this against production. All users are flagged is_demo = true and
-- all health rows use source = 'demo'; DB triggers prevent mixing demo and
-- real provider data.
-- Login for every demo user: password "demo-password-123"
-- =============================================================================

do $$
declare
  fam uuid := '00000000-0000-4000-8000-0000000000f1';
  users uuid[] := array[
    '00000000-0000-4000-8000-00000000000a'::uuid,
    '00000000-0000-4000-8000-00000000000b'::uuid,
    '00000000-0000-4000-8000-00000000000c'::uuid,
    '00000000-0000-4000-8000-00000000000d'::uuid
  ];
  names text[] := array['Alex (Demo)', 'Sam (Demo)', 'Robin (Demo)', 'Kim (Demo)'];
  emails text[] := array['alex@demo.familypulse.local', 'sam@demo.familypulse.local', 'robin@demo.familypulse.local', 'kim@demo.familypulse.local'];
  i int;
  d int;
  day date;
  base_rhr numeric[] := array[54, 62, 51, 58];
  base_hrv numeric[] := array[82, 43, 91, 56];
  base_steps numeric[] := array[10400, 8300, 12300, 9400];
  u uuid;
  sleep_min numeric;
  sid uuid;
begin
  for i in 1..4 loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', users[i], 'authenticated', 'authenticated', emails[i],
            extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', array['email'], 'is_demo', true),
            jsonb_build_object('display_name', names[i]), now(), now())
    on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), users[i], users[i]::text,
            jsonb_build_object('sub', users[i]::text, 'email', emails[i]), 'email', now(), now(), now())
    on conflict do nothing;
  end loop;

  insert into public.families (id, name, created_by) values (fam, 'Demo-Familie', users[1]) on conflict do nothing;
  insert into public.family_members (family_id, user_id, role) values
    (fam, users[1], 'admin'), (fam, users[2], 'member'), (fam, users[3], 'member'), (fam, users[4], 'member')
  on conflict do nothing;

  -- Sharing: Alex & Robin share everything, Sam shares sleep + activity, Kim shares activity only with Alex.
  insert into public.sharing_preferences (owner_id, category, grantee_id, enabled)
  select users[1], c, null, true from unnest(array['recovery','sleep','activity','heart_rate','hrv','health_metrics','workouts']) c
  union all select users[3], c, null, true from unnest(array['recovery','sleep','activity','heart_rate','hrv','health_metrics','workouts']) c
  union all select users[2], c, null, true from unnest(array['sleep','activity']) c
  union all select users[4], 'activity', users[1], true
  on conflict do nothing;

  for i in 1..4 loop
    u := users[i];
    for d in 0..89 loop
      day := current_date - d;
      -- deterministic pseudo-variation, no randomness so reseeding is reproducible
      sleep_min := 450 + 40 * sin(d * 0.7 + i) + 15 * cos(d * 1.3);

      insert into public.daily_metrics (user_id, source, metric, category, value, unit, local_date, aggregation)
      values
        (u, 'demo', 'sleep_duration', 'sleep', round(sleep_min), 'min', day, 'main_sleep'),
        (u, 'demo', 'resting_heart_rate', 'heart_rate', round(base_rhr[i] + 3 * sin(d * 0.5 + i)), 'bpm', day, 'daily'),
        (u, 'demo', 'hrv', 'hrv', round(base_hrv[i] + 12 * sin(d * 0.4 + i * 2)), 'ms', day, 'rmssd_sleep'),
        (u, 'demo', 'steps', 'activity', round(base_steps[i] + 2500 * sin(d * 0.9 + i)), '', day, 'sum'),
        (u, 'demo', 'calories', 'activity', round(2100 + 350 * sin(d * 0.8 + i)), 'kcal', day, 'sum'),
        (u, 'demo', 'respiratory_rate', 'health_metrics', round((14.5 + 0.8 * sin(d * 0.3 + i))::numeric, 1), '/min', day, 'sleep'),
        (u, 'demo', 'spo2', 'health_metrics', round((96.5 + 1.2 * sin(d * 0.6 + i))::numeric, 1), '%', day, 'sleep')
      on conflict (user_id, source, metric, local_date) do nothing;

      if i < 4 then
        -- "WHOOP-like" demo members
        insert into public.daily_metrics (user_id, source, metric, category, value, unit, local_date, aggregation)
        values
          (u, 'demo', 'recovery_score', 'recovery', greatest(5, least(99, round(70 + 22 * sin(d * 0.45 + i)))), '%', day, 'vendor_score'),
          (u, 'demo', 'strain', 'activity', round((11 + 5 * sin(d * 0.7 + i))::numeric, 1), '', day, 'vendor_score'),
          (u, 'demo', 'sleep_performance', 'sleep', greatest(40, least(100, round(85 + 10 * sin(d * 0.5 + i)))), '%', day, 'vendor_score'),
          (u, 'demo', 'sleep_efficiency', 'sleep', round(90 + 4 * sin(d * 0.6 + i)), '%', day, 'main_sleep'),
          (u, 'demo', 'skin_temperature', 'health_metrics', round((33.6 + 0.3 * sin(d * 0.2 + i))::numeric, 1), '°C', day, 'sleep')
        on conflict (user_id, source, metric, local_date) do nothing;
      else
        -- "Fitbit-like" demo member
        insert into public.daily_metrics (user_id, source, metric, category, value, unit, local_date, aggregation)
        values
          (u, 'demo', 'active_minutes', 'activity', round(45 + 20 * sin(d * 0.9)), 'min', day, 'moderate_vigorous'),
          (u, 'demo', 'skin_temperature_deviation', 'health_metrics', round((0.15 * sin(d * 0.3))::numeric, 2), '°C', day, 'nightly_minus_baseline')
        on conflict (user_id, source, metric, local_date) do nothing;
      end if;

      sid := gen_random_uuid();
      insert into public.sleep_sessions (id, user_id, source, external_id, start_at, end_at, local_date, is_nap,
                                         duration_asleep_min, in_bed_min, awake_min, light_min, deep_min, rem_min, efficiency_pct)
      values (sid, u, 'demo', 'demo-sleep-' || i || '-' || d,
              (day - 1)::timestamptz + interval '21 hours 45 minutes',
              (day - 1)::timestamptz + interval '21 hours 45 minutes' + make_interval(mins => (sleep_min + 35)::int),
              day, false, round(sleep_min), round(sleep_min + 35), 35,
              round(sleep_min * 0.55), round(sleep_min * 0.2), round(sleep_min * 0.25), round(100 * sleep_min / (sleep_min + 35)))
      on conflict do nothing;

      if d % 2 = 0 then
        insert into public.workouts (user_id, source, external_id, sport, start_at, end_at, local_date, duration_min, calories, avg_heart_rate, max_heart_rate, strain)
        values (u, 'demo', 'demo-workout-' || i || '-' || d, (array['running','cycling','strength','hiking'])[1 + (d / 2) % 4],
                day::timestamptz + interval '16 hours', day::timestamptz + interval '16 hours 50 minutes', day,
                50, 420 + 40 * i, 138 + i, 172 + i, case when i < 4 then 12.4 else null end)
        on conflict do nothing;
        insert into public.daily_metrics (user_id, source, metric, category, value, unit, local_date, aggregation)
        values (u, 'demo', 'workout_count', 'workouts', 1, '', day, 'count'),
               (u, 'demo', 'workout_duration', 'workouts', 50, 'min', day, 'sum')
        on conflict (user_id, source, metric, local_date) do nothing;
      end if;
    end loop;
  end loop;
end $$;
