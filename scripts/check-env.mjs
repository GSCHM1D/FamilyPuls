#!/usr/bin/env node
// Checks which variables are set (prints only names, never values).
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const groups = {
  "Core (required)": ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY", "CRON_SECRET"],
  WHOOP: ["WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET", "WHOOP_REDIRECT_URI"],
  "Google Health": ["GOOGLE_HEALTH_CLIENT_ID", "GOOGLE_HEALTH_CLIENT_SECRET", "GOOGLE_HEALTH_REDIRECT_URI", "GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION"],
};
let ok = true;
for (const [name, vars] of Object.entries(groups)) {
  console.log(`\n${name}`);
  for (const v of vars) {
    const set = Boolean(process.env[v]);
    if (!set && name.startsWith("Core")) ok = false;
    console.log(`  ${set ? "✓" : "✗"} ${v}`);
  }
}
if (process.env.TOKEN_ENCRYPTION_KEY && Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, "base64").length !== 32) {
  console.log("\n✗ TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  ok = false;
}
if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") console.log("\nℹ Demo mode is ON – no real data is used.");
process.exit(ok ? 0 : 1);
