import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Boots an in-memory Postgres (PGlite) with minimal stand-ins for the Supabase
 * `auth` and `storage` schemas and roles, then applies all migrations.
 * This lets us test RLS policies and SQL functions for real.
 */
const SUPABASE_STUBS = `
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const dir = path.resolve(__dirname, "../../../supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  // Supabase grants table privileges to service_role by default.
  await db.exec(`grant all on all tables in schema public to service_role;
                 grant execute on all functions in schema public to service_role;`);
  return new TestDb(db);
}

export class TestDb {
  constructor(readonly pg: PGlite) {}

  /** Run SQL as superuser (setup). */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pg.query<T>(sql, params);
    return res.rows;
  }

  /** Run SQL as an authenticated Supabase user (RLS applies). */
  async asUser<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    return this.pg.transaction(async (tx) => {
      await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  async asService<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.pg.transaction(async (tx) => {
      await tx.exec(`set local role service_role`);
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  async createUser(id: string, email: string, opts: { demo?: boolean; name?: string } = {}) {
    await this.admin(
      `insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3, $4)`,
      [id, email, JSON.stringify({ display_name: opts.name ?? email }), JSON.stringify({ is_demo: opts.demo ?? false })],
    );
  }
}
