import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const A = "00000000-0000-4000-8000-0000000000a1"; // admin of family 1
const B = "00000000-0000-4000-8000-0000000000b1"; // member of family 1
const C = "00000000-0000-4000-8000-0000000000c1"; // member of family 1
const X = "00000000-0000-4000-8000-0000000000e1"; // other family
const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";

let db: TestDb;

async function insertMetric(user: string, metric: string, category: string, value: number, date = "2026-11-20", source = "whoop") {
  await db.asService(
    `insert into public.daily_metrics (user_id, source, metric, category, value, unit, local_date)
     values ($1, $2, $3, $4, $5, '', $6)
     on conflict (user_id, source, metric, local_date) do update set value = excluded.value`,
    [user, source, metric, category, value, date],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  await db.createUser(A, "a@example.test", { name: "Anna" });
  await db.createUser(B, "b@example.test", { name: "Ben" });
  await db.createUser(C, "c@example.test", { name: "Cleo" });
  await db.createUser(X, "x@example.test", { name: "Xaver" });
  await db.admin(`insert into public.families (id, name) values ($1, 'Fam 1'), ($2, 'Fam 2')`, [F1, F2]);
  await db.admin(
    `insert into public.family_members (family_id, user_id, role) values ($1,$3,'admin'),($1,$4,'member'),($1,$5,'member'),($2,$6,'admin')`,
    [F1, F2, A, B, C, X],
  );
  await insertMetric(B, "hrv", "hrv", 55);
  await insertMetric(B, "steps", "activity", 9000);
  await insertMetric(C, "steps", "activity", 12000);
  await insertMetric(X, "steps", "activity", 7000);
  await db.admin(
    `insert into public.provider_connections (id, user_id, provider, external_user_id) values ('00000000-0000-4000-8000-00000000c001', $1, 'whoop', '123')`,
    [B],
  );
  await db.admin(
    `insert into public.provider_credentials (connection_id, access_token_enc, refresh_token_enc) values ('00000000-0000-4000-8000-00000000c001', 'v1.enc', 'v1.enc')`,
  );
});

describe("profiles trigger", () => {
  it("creates a profile for every auth user", async () => {
    const rows = await db.admin<{ display_name: string }>(`select display_name from public.profiles where id = $1`, [A]);
    expect(rows[0]?.display_name).toBe("Anna");
  });
});

describe("RLS: health data", () => {
  it("anonymous users cannot read any health data", async () => {
    await expect(db.asUser(null, `select * from public.daily_metrics`)).rejects.toThrow(/permission denied/);
  });

  it("owner sees own data", async () => {
    const rows = await db.asUser(B, `select metric from public.daily_metrics where user_id = $1`, [B]);
    expect(rows).toHaveLength(2);
  });

  it("data is private by default – even for the family admin", async () => {
    const rows = await db.asUser(A, `select * from public.daily_metrics where user_id = $1`, [B]);
    expect(rows).toHaveLength(0);
  });

  it("sharing a category exposes only that category", async () => {
    await db.asUser(B, `insert into public.sharing_preferences (owner_id, category, enabled) values ($1, 'activity', true)`, [B]);
    const rows = await db.asUser<{ metric: string }>(A, `select metric from public.daily_metrics where user_id = $1`, [B]);
    expect(rows.map((r) => r.metric)).toEqual(["steps"]);
  });

  it("users of another family never see shared data", async () => {
    const rows = await db.asUser(X, `select * from public.daily_metrics where user_id = $1`, [B]);
    expect(rows).toHaveLength(0);
  });

  it("a manipulated user_id filter does not bypass RLS", async () => {
    const rows = await db.asUser(X, `select * from public.daily_metrics where user_id in ($1, $2, $3)`, [A, B, C]);
    expect(rows).toHaveLength(0);
  });

  it("revoking a share takes effect immediately", async () => {
    await db.asUser(B, `update public.sharing_preferences set enabled = false where owner_id = $1 and category = 'activity'`, [B]);
    const rows = await db.asUser(A, `select * from public.daily_metrics where user_id = $1`, [B]);
    expect(rows).toHaveLength(0);
  });

  it("per-member grants apply only to the grantee", async () => {
    await db.asUser(C, `insert into public.sharing_preferences (owner_id, category, grantee_id, enabled) values ($1, 'activity', $2, true)`, [C, A]);
    expect(await db.asUser(A, `select * from public.daily_metrics where user_id = $1`, [C])).toHaveLength(1);
    expect(await db.asUser(B, `select * from public.daily_metrics where user_id = $1`, [C])).toHaveLength(0);
  });

  it("cannot grant to a user outside the family", async () => {
    await expect(
      db.asUser(C, `insert into public.sharing_preferences (owner_id, category, grantee_id, enabled) values ($1, 'sleep', $2, true)`, [C, X]),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot create sharing preferences for someone else", async () => {
    await expect(
      db.asUser(A, `insert into public.sharing_preferences (owner_id, category, enabled) values ($1, 'hrv', true)`, [B]),
    ).rejects.toThrow(/row-level security/);
  });

  it("users cannot write health data directly", async () => {
    await expect(
      db.asUser(B, `insert into public.daily_metrics (user_id, source, metric, category, value, local_date) values ($1,'whoop','steps','activity',1,'2026-11-21')`, [B]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("RLS: secrets & internal tables", () => {
  it("OAuth credentials are not readable by the owner", async () => {
    await expect(db.asUser(B, `select * from public.provider_credentials`)).rejects.toThrow(/permission denied/);
  });
  it("webhook events and rate limits are not readable", async () => {
    await expect(db.asUser(A, `select * from public.webhook_events`)).rejects.toThrow(/permission denied/);
    await expect(db.asUser(A, `select * from public.rate_limits`)).rejects.toThrow(/permission denied/);
  });
  it("service role can read credentials", async () => {
    expect(await db.asService(`select * from public.provider_credentials`)).toHaveLength(1);
  });
  it("users cannot call service-only functions", async () => {
    await expect(db.asUser(A, `select public.claim_sync_jobs(5, 60)`)).rejects.toThrow(/permission denied/);
  });
  it("family members see connection status but other families do not", async () => {
    expect(await db.asUser(A, `select provider, status from public.provider_connections`)).toHaveLength(1);
    expect(await db.asUser(X, `select provider, status from public.provider_connections`)).toHaveLength(0);
  });
  it("profiles of other families are hidden", async () => {
    const rows = await db.asUser<{ id: string }>(X, `select id from public.profiles`);
    expect(rows.map((r) => r.id)).toEqual([X]);
  });
  it("users cannot flip their own demo flag", async () => {
    await expect(db.asUser(A, `update public.profiles set is_demo = true where id = $1`, [A])).rejects.toThrow(/permission denied/);
  });
});

describe("demo isolation", () => {
  it("rejects demo rows for real profiles", async () => {
    await expect(insertMetric(A, "steps", "activity", 1, "2026-11-20", "demo")).rejects.toThrow(/demo data/);
  });
  it("rejects real provider rows for demo profiles", async () => {
    const D = "00000000-0000-4000-8000-0000000000d9";
    await db.createUser(D, "demo@example.test", { demo: true });
    await expect(insertMetric(D, "steps", "activity", 1, "2026-11-20", "whoop")).rejects.toThrow(/real provider data/);
    await insertMetric(D, "steps", "activity", 1, "2026-11-20", "demo");
  });
});

describe("upserts & duplicates", () => {
  it("upsert on the natural key never duplicates a daily metric", async () => {
    await insertMetric(B, "resting_heart_rate", "heart_rate", 60, "2026-11-22");
    await insertMetric(B, "resting_heart_rate", "heart_rate", 58, "2026-11-22");
    const rows = await db.asService<{ value: number }>(
      `select value from public.daily_metrics where user_id = $1 and metric = 'resting_heart_rate'`,
      [B],
    );
    expect(rows).toEqual([{ value: 58 }]);
  });

  it("webhook events are idempotent per provider + event key", async () => {
    const sql = `insert into public.webhook_events (provider, event_key, event_type, payload) values ('whoop', 'trace-1', 'sleep.updated', '{}')
                 on conflict (provider, event_key) do nothing returning id`;
    expect(await db.asService(sql)).toHaveLength(1);
    expect(await db.asService(sql)).toHaveLength(0);
  });
});

describe("sync job locking", () => {
  it("claims jobs once and never two jobs of the same connection in parallel", async () => {
    const conn = "00000000-0000-4000-8000-00000000c001";
    await db.asService(
      `insert into public.sync_jobs (connection_id, user_id, kind, dedupe_key) values ($1, $2, 'incremental', 'k1'), ($1, $2, 'webhook', 'k2')`,
      [conn, B],
    );
    const first = await db.asService(`select * from public.claim_sync_jobs(10, 60)`);
    expect(first).toHaveLength(1);
    const second = await db.asService(`select * from public.claim_sync_jobs(10, 60)`);
    expect(second).toHaveLength(0);
  });

  it("dedupe key prevents duplicate open jobs", async () => {
    await expect(
      db.asService(`insert into public.sync_jobs (connection_id, user_id, kind, dedupe_key) values ('00000000-0000-4000-8000-00000000c001', $1, 'incremental', 'k1')`, [B]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("refresh lock can only be held once", async () => {
    const conn = "00000000-0000-4000-8000-00000000c001";
    const [a] = await db.asService<{ acquire_refresh_lock: boolean }>(`select public.acquire_refresh_lock($1, 30)`, [conn]);
    const [b] = await db.asService<{ acquire_refresh_lock: boolean }>(`select public.acquire_refresh_lock($1, 30)`, [conn]);
    expect(a?.acquire_refresh_lock).toBe(true);
    expect(b?.acquire_refresh_lock).toBe(false);
    await db.asService(`select public.release_refresh_lock($1)`, [conn]);
    const [c] = await db.asService<{ acquire_refresh_lock: boolean }>(`select public.acquire_refresh_lock($1, 30)`, [conn]);
    expect(c?.acquire_refresh_lock).toBe(true);
  });
});

describe("rate limiter", () => {
  it("allows up to max calls per window", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const [r] = await db.asService<{ check_rate_limit: boolean }>(`select public.check_rate_limit('manual:x', 3, 300)`);
      results.push(r!.check_rate_limit);
    }
    expect(results).toEqual([true, true, true, false]);
  });
});

describe("account deletion", () => {
  it("promotes a successor admin and cascades all data", async () => {
    await db.asService(`select public.ensure_admin_succession($1)`, [A]);
    await db.admin(`delete from auth.users where id = $1`, [A]);
    const members = await db.admin<{ user_id: string; role: string }>(`select user_id, role from public.family_members where family_id = $1 order by joined_at`, [F1]);
    expect(members.find((m) => m.role === "admin")).toBeTruthy();
    expect(members.find((m) => m.user_id === A)).toBeUndefined();
    await db.admin(`delete from auth.users where id = $1`, [B]);
    expect(await db.admin(`select * from public.daily_metrics where user_id = $1`, [B])).toHaveLength(0);
    expect(await db.admin(`select * from public.provider_credentials`)).toHaveLength(0);
  });
});

describe("visible_categories", () => {
  it("returns only explicitly shared categories for family members and all for self", async () => {
    const T = "00000000-0000-4000-8000-0000000000a7";
    const U = "00000000-0000-4000-8000-0000000000a8";
    const F3 = "00000000-0000-4000-8000-0000000000f3";
    await db.createUser(T, "t@example.test");
    await db.createUser(U, "u@example.test");
    await db.admin(`insert into public.families (id, name) values ($1, 'Fam 3')`, [F3]);
    await db.admin(`insert into public.family_members (family_id, user_id, role) values ($1,$2,'admin'),($1,$3,'member')`, [F3, T, U]);
    await db.asUser(U, `insert into public.sharing_preferences (owner_id, category, enabled) values ($1, 'sleep', true), ($1, 'hrv', false)`, [U]);
    const [own] = await db.asUser<{ visible_categories: string[] }>(U, `select public.visible_categories($1)`, [U]);
    const [other] = await db.asUser<{ visible_categories: string[] }>(T, `select public.visible_categories($1)`, [U]);
    expect(own?.visible_categories).toHaveLength(7);
    expect(other?.visible_categories).toEqual(["sleep"]);
  });
});

describe("sharing upsert semantics", () => {
  it("ON CONFLICT works with null grantee (nulls not distinct) under RLS", async () => {
    const V = "00000000-0000-4000-8000-0000000000a9";
    await db.createUser(V, "v@example.test");
    const upsert = `insert into public.sharing_preferences (owner_id, category, grantee_id, enabled) values ($1, 'sleep', null, $2)
                    on conflict (owner_id, category, grantee_id) do update set enabled = excluded.enabled`;
    await db.asUser(V, upsert, [V, true]);
    await db.asUser(V, upsert, [V, false]);
    const rows = await db.asUser<{ enabled: boolean }>(V, `select enabled from public.sharing_preferences where owner_id = $1`, [V]);
    expect(rows).toEqual([{ enabled: false }]);
  });
});
