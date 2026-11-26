import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(async (_req: NextRequest, response: NextResponse) => ({ user: null, response })),
}));

async function loadProxy() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  vi.resetModules();
  return (await import("@/proxy")).proxy;
}

describe("proxy (route protection + CSP)", () => {
  it("redirects anonymous users away from health pages", async () => {
    const proxy = await loadProxy();
    const res = await proxy(new NextRequest("https://fp.example/family/123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://fp.example/login?next=%2Ffamily%2F123");
  });

  it("returns 401 JSON for anonymous API calls", async () => {
    const proxy = await loadProxy();
    const res = await proxy(new NextRequest("https://fp.example/api/account/export"));
    expect(res.status).toBe(401);
  });

  it("lets public paths through and always sets a nonce-based CSP", async () => {
    const proxy = await loadProxy();
    const res = await proxy(new NextRequest("https://fp.example/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  });
});
