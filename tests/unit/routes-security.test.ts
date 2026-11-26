import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn(async () => ({ data: { user: null as null | { id: string; email: string } } }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, from: vi.fn() }) }));
const adminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ from: adminFrom, rpc: vi.fn(async () => ({ data: true })) }) }));

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://familypulse.example";
  process.env.CRON_SECRET = "c".repeat(40);
  process.env.WHOOP_CLIENT_SECRET = "whoop-secret";
  process.env.GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION = "Bearer gh-webhook-secret";
  getUser.mockClear();
  adminFrom.mockReset();
});

describe("API access control", () => {
  it("unauthenticated users cannot export health data", async () => {
    const { GET } = await import("@/app/api/account/export/route");
    const res = await GET(new Request("https://familypulse.example/api/account/export"));
    expect(res.status).toBe(401);
  });

  it("rejects cross-origin state-changing requests (CSRF) before touching the session", async () => {
    const { POST } = await import("@/app/api/sync/manual/route");
    const res = await POST(new Request("https://familypulse.example/api/sync/manual", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("requires a session for account deletion", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    const res = await DELETE(new Request("https://familypulse.example/api/account", { method: "DELETE", headers: { origin: "https://familypulse.example" }, body: '{"confirm":"DELETE"}' }));
    expect(res.status).toBe(401);
  });

  it("cron endpoint requires the exact bearer secret", async () => {
    const { GET } = await import("@/app/api/sync/cron/route");
    expect((await GET(new Request("https://familypulse.example/api/sync/cron"))).status).toBe(401);
    expect((await GET(new Request("https://familypulse.example/api/sync/cron", { headers: { authorization: `Bearer ${"x".repeat(40)}` } }))).status).toBe(401);
  });
});

describe("webhook endpoints", () => {
  it("WHOOP: rejects unsigned or wrongly signed requests without DB access", async () => {
    const { POST } = await import("@/app/api/webhooks/whoop/route");
    const body = JSON.stringify({ user_id: 1, id: "x", type: "sleep.updated", trace_id: "t" });
    const ts = String(Date.now());
    const bad = createHmac("sha256", "wrong").update(ts + body).digest("base64");
    const res = await POST(new Request("https://x/api/webhooks/whoop", { method: "POST", body, headers: { "x-whoop-signature": bad, "x-whoop-signature-timestamp": ts } }));
    expect(res.status).toBe(401);
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("WHOOP: duplicate deliveries are acknowledged without creating jobs (idempotent)", async () => {
    const { POST } = await import("@/app/api/webhooks/whoop/route");
    const body = JSON.stringify({ user_id: 1, id: "550e8400-e29b-41d4-a716-446655440000", type: "sleep.updated", trace_id: "t-1" });
    const ts = String(Date.now());
    const sig = createHmac("sha256", "whoop-secret").update(ts + body).digest("base64");
    adminFrom.mockReturnValue({ upsert: () => ({ select: async () => ({ data: [] }) }) });
    const res = await POST(new Request("https://x/api/webhooks/whoop", { method: "POST", body, headers: { "x-whoop-signature": sig, "x-whoop-signature-timestamp": ts } }));
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(adminFrom).toHaveBeenCalledTimes(1);
  });

  it("Google Health: verification handshake (authorized → 201, unauthorized → 401)", async () => {
    const { POST } = await import("@/app/api/webhooks/google-health/route");
    const body = '{"type":"verification"}';
    expect((await POST(new Request("https://x", { method: "POST", body, headers: { authorization: "Bearer gh-webhook-secret" } }))).status).toBe(201);
    expect((await POST(new Request("https://x", { method: "POST", body }))).status).toBe(401);
  });

  it("Google Health: notifications without the shared secret are rejected", async () => {
    const { POST } = await import("@/app/api/webhooks/google-health/route");
    const res = await POST(new Request("https://x", { method: "POST", body: '[{"data":{"healthUserId":"a","operation":"UPSERT","dataType":"steps"}}]', headers: { authorization: "Bearer wrong" } }));
    expect(res.status).toBe(401);
    expect(adminFrom).not.toHaveBeenCalled();
  });
});
