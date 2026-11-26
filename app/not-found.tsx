import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-safe text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <Link href="/dashboard" className="text-sm text-primary">FamilyPulse</Link>
    </main>
  );
}
