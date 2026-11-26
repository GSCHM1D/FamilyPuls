"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManualSyncButton({ labels }: { labels: { syncNow: string; syncQueued: string; syncRateLimited: string; error: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            setMessage(res.status === 429 ? labels.syncRateLimited : res.ok ? labels.syncQueued : labels.error);
            router.refresh();
          })
        }
      >
        <RefreshCw className={pending ? "animate-spin" : undefined} /> {labels.syncNow}
      </Button>
      {message ? <span role="status" className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}
