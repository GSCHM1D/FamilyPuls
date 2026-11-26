import type { ProviderId } from "@/types/health";
import { googleHealthFromEnv } from "./google-health/provider";
import type { HealthProvider } from "./types";
import { whoopFromEnv } from "./whoop/provider";

/** Returns the configured provider adapter, or null if credentials are missing. New trackers are added here. */
export function getProvider(id: ProviderId): HealthProvider | null {
  switch (id) {
    case "whoop":
      return whoopFromEnv();
    case "google_health":
      return googleHealthFromEnv();
  }
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === "whoop" || value === "google_health";
}
