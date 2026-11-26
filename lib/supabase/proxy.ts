import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/** Refreshes the Supabase session cookie and returns the user (or null). */
export async function updateSession(request: NextRequest, response: NextResponse) {
  let res = response;
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        res = NextResponse.next({ request: { headers: request.headers } });
        for (const [k, v] of response.headers) res.headers.set(k, v);
        for (const { name, value, options } of toSet) res.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return { user: data.user, response: res };
}
