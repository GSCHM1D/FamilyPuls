import { handleCallback } from "@/lib/providers/oauth-routes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return handleCallback(request, "google_health");
}
