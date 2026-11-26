#!/usr/bin/env node
// Generates random secrets locally. Paste them into .env.local / Vercel – never into a chat or the repo.
import { randomBytes } from "node:crypto";
console.log(`TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`CRON_SECRET=${randomBytes(32).toString("base64url")}`);
console.log(`GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION=Bearer ${randomBytes(32).toString("base64url")}`);
