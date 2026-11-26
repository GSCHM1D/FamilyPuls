/** Only allow same-site relative paths as post-login redirect targets (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("://")) return fallback;
  if (next.startsWith("/api/")) return fallback;
  return next;
}
