import { handleConnect } from "@/lib/providers/oauth-routes";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleConnect(request, "whoop");
}
