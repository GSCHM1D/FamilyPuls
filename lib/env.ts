import { z } from "zod";

/** Public configuration – safe to use in client components. */
export const publicEnv = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
};

/** True when the app runs in the isolated demo mode (synthetic data only). */
export function isDemoMode(): boolean {
  return publicEnv.demoMode;
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  TOKEN_ENCRYPTION_KEY: z.string().min(40),
  TOKEN_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
  CRON_SECRET: z.string().min(32),
  WHOOP_CLIENT_ID: z.string().optional(),
  WHOOP_CLIENT_SECRET: z.string().optional(),
  WHOOP_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_HEALTH_CLIENT_ID: z.string().optional(),
  GOOGLE_HEALTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_HEALTH_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Server-only secrets. Throws a descriptive error (without printing values)
 * if required variables are missing. Never import this from client code.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") throw new Error("serverEnv() must not be called in the browser");
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing server environment variables: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

export function whoopConfigured(): boolean {
  return Boolean(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET && process.env.WHOOP_REDIRECT_URI);
}

export function googleHealthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_HEALTH_CLIENT_ID && process.env.GOOGLE_HEALTH_CLIENT_SECRET && process.env.GOOGLE_HEALTH_REDIRECT_URI,
  );
}
