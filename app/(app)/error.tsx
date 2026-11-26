"use client";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-sm text-muted-foreground">Etwas ist schiefgelaufen. / Something went wrong.</p>
      <Button variant="secondary" onClick={reset}>Erneut versuchen / Retry</Button>
    </div>
  );
}
