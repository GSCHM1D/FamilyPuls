#!/usr/bin/env node
/**
 * Phase-1 feasibility probe: calls the WHOOP API v2 with a short-lived access
 * token and prints WHICH FIELDS are present (not the health values).
 * Usage:  WHOOP_ACCESS_TOKEN=... npm run probe:whoop
 * Get a token: connect WHOOP in the app, or use the OAuth flow of the WHOOP docs.
 * The token is read from the environment only and never printed.
 */
const token = process.env.WHOOP_ACCESS_TOKEN;
if (!token) {
  console.error("Set WHOOP_ACCESS_TOKEN in your shell (do not paste it anywhere else).");
  process.exit(1);
}
const base = "https://api.prod.whoop.com/developer";
const end = new Date().toISOString();
const start = new Date(Date.now() - 7 * 86400000).toISOString();
const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, depth > 3 ? typeof x : shape(x, depth + 1)]));
  return v === null ? "null" : typeof v;
};
for (const path of ["/v2/user/profile/basic", "/v2/user/measurement/body", `/v2/cycle?limit=1&start=${start}&end=${end}`, `/v2/recovery?limit=1&start=${start}&end=${end}`, `/v2/activity/sleep?limit=1&start=${start}&end=${end}`, `/v2/activity/workout?limit=1&start=${start}&end=${end}`]) {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`\n${res.status} GET ${path.split("?")[0]}  rate-limit-remaining=${res.headers.get("x-ratelimit-remaining")}`);
  if (res.ok) console.log(JSON.stringify(shape(await res.json()), null, 2));
}
