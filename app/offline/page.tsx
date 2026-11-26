import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-safe text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Keine Verbindung / Offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        FamilyPulse speichert aus Datenschutzgründen keine Gesundheitsdaten auf dem Gerät. Bitte verbinde dich mit dem Internet.
        <br />
        For privacy reasons FamilyPulse never stores health data on your device. Please reconnect.
      </p>
    </main>
  );
}
