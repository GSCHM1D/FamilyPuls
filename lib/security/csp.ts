/** Builds the Content-Security-Policy for a request nonce. */
export function buildCsp(nonce: string, opts: { isDev: boolean; supabaseUrl: string }): string {
  const supabase = opts.supabaseUrl ? new URL(opts.supabaseUrl).origin : "";
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.isDev ? " 'unsafe-eval'" : ""}`,
    // Recharts and Next set inline style attributes; styles cannot execute code.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:${supabase ? ` ${supabase}` : ""}`,
    `font-src 'self'`,
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}`,
    `manifest-src 'self'`,
    `worker-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self' https://api.prod.whoop.com https://accounts.google.com`,
    `frame-ancestors 'none'`,
  ];
  if (!opts.isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Paths reachable without a session. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/offline" ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/sync/cron" ||
    pathname === "/api/invitations/accept" ||
    pathname === "/api/health"
  );
}
