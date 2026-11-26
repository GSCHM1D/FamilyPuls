import { handleDisconnect } from "@/lib/providers/oauth-routes";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleDisconnect(request, "google_health");
}
