#!/usr/bin/env node
/**
 * Phase-1 feasibility probe for the Google Health API v4. Prints which data
 * types return data and the field structure (types only, no health values).
 * Usage:  GOOGLE_HEALTH_ACCESS_TOKEN=... npm run probe:google-health
 * Get a token via the OAuth 2.0 Playground (see docs/google-cloud-setup.md) or by connecting in the app.
 */
const token = process.env.GOOGLE_HEALTH_ACCESS_TOKEN;
if (!token) {
  console.error("Set GOOGLE_HEALTH_ACCESS_TOKEN in your shell.");
  process.exit(1);
}
const api = "https://health.googleapis.com/v4/users/me";
const day = (o) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);
const civil = (d) => ({ date: { year: +d.slice(0, 4), month: +d.slice(5, 7), day: +d.slice(8, 10) } });
const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, depth > 4 ? typeof x : shape(x, depth + 1)]));
  return v === null ? "null" : typeof v;
};
async function call(label, url, init) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  const n = body.dataPoints?.length ?? body.rollupDataPoints?.length;
  console.log(`\n${res.status} ${label}${n !== undefined ? `  (${n} points)` : ""}`);
  if (res.ok) console.log(JSON.stringify(shape(body), null, 2).slice(0, 1500));
  else console.log(JSON.stringify(body.error ?? body).slice(0, 400));
}
await call("identity", `${api}/identity`);
await call("profile", `${api}/profile`);
await call("pairedDevices", `${api}/pairedDevices`);
const from = day(-7), to = day(1);
for (const t of ["daily-resting-heart-rate", "daily-heart-rate-variability", "daily-oxygen-saturation", "daily-respiratory-rate", "daily-sleep-temperature-derivations"]) {
  const s = t.replace(/-/g, "_");
  await call(t, `${api}/dataTypes/${t}/dataPoints?filter=${encodeURIComponent(`${s}.date >= "${from}" AND ${s}.date < "${to}"`)}`);
}
await call("sleep", `${api}/dataTypes/sleep/dataPoints?pageSize=2&filter=${encodeURIComponent(`sleep.interval.civil_end_time >= "${from}"`)}`);
await call("exercise", `${api}/dataTypes/exercise/dataPoints?pageSize=2&filter=${encodeURIComponent(`exercise.interval.civil_start_time >= "${from}"`)}`);
for (const t of ["steps", "total-calories", "heart-rate", "active-minutes", "active-zone-minutes"]) {
  await call(`${t}:dailyRollUp`, `${api}/dataTypes/${t}/dataPoints:dailyRollUp`, { method: "POST", body: JSON.stringify({ range: { start: civil(from), end: civil(day(0)) }, windowSizeDays: 1 }) });
}
