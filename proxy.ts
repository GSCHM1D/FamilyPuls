import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { buildCsp, isPublicPath } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { isDev: process.env.NODE_ENV === "development", supabaseUrl: publicEnv.supabaseUrl });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  const { pathname } = request.nextUrl;
  if (publicEnv.demoMode || isPublicPath(pathname)) {
    if (!publicEnv.demoMode && publicEnv.supabaseUrl && !pathname.startsWith("/api/webhooks/")) {
      response = (await updateSession(request, response)).response;
    }
    return response;
  }

  if (!publicEnv.supabaseUrl) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "not_configured" }, { status: 503 })
      : NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await updateSession(request, response);
  if (!session.user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return session.response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest|icon.png|offline).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
