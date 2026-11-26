#!/usr/bin/env node
/**
 * Registers (or updates) the Google Health webhook subscriber for this project.
 * Requires a Google Cloud access token with the cloud-platform scope and the
 * "Google Health API Admin/Editor" role, e.g.:
 *   GCP_ACCESS_TOKEN=$(gcloud auth print-access-token) \
 *   GCP_PROJECT_NUMBER=123456789 APP_URL=https://your-app.vercel.app \
 *   GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION="Bearer …" node scripts/google-health-subscriber.mjs
 * Uses AUTOMATIC subscriptions: every user who grants consent is subscribed automatically.
 * The app must already be deployed: Google verifies the endpoint (authorized → 201, unauthorized → 401).
 */
const { GCP_ACCESS_TOKEN, GCP_PROJECT_NUMBER, APP_URL, GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION } = process.env;
if (!GCP_ACCESS_TOKEN || !GCP_PROJECT_NUMBER || !APP_URL || !GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION) {
  console.error("Missing GCP_ACCESS_TOKEN, GCP_PROJECT_NUMBER, APP_URL or GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION");
  process.exit(1);
}
const dataTypes = ["sleep", "exercise", "steps", "active-minutes", "active-zone-minutes", "daily-resting-heart-rate", "daily-heart-rate-variability", "daily-oxygen-saturation", "daily-respiratory-rate", "daily-sleep-temperature-derivations"];
const base = `https://health.googleapis.com/v4/projects/${GCP_PROJECT_NUMBER}/subscribers`;
const id = "familypulse";
const body = {
  endpointUri: `${APP_URL.replace(/\/$/, "")}/api/webhooks/google-health`,
  // Google recommends separate subscribers for high-volume types such as steps;
  // for four users a single subscriber is sufficient.
  subscriberConfigs: [{ dataTypes, subscriptionCreatePolicy: "AUTOMATIC" }],
  endpointAuthorization: { secret: GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION },
};
const headers = { Authorization: `Bearer ${GCP_ACCESS_TOKEN}`, "Content-Type": "application/json" };
let res = await fetch(`${base}?subscriberId=${id}`, { method: "POST", headers, body: JSON.stringify(body) });
if (res.status === 409) {
  res = await fetch(`${base}/${id}?updateMask=endpointUri,subscriberConfigs,endpointAuthorization`, { method: "PATCH", headers, body: JSON.stringify(body) });
}
const json = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(json.response ?? json, null, 2));
