import { cn } from "@/lib/utils";

const COLORS = ["bg-green/20 text-green", "bg-blue/20 text-blue", "bg-violet/20 text-violet", "bg-amber/20 text-amber"];

export function Avatar({ name, url, size = 40, className }: { name: string; url?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const color = COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived Supabase URLs; next/image would cache them
    return <img src={url} alt="" width={size} height={size} className={cn("rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className={cn("inline-flex items-center justify-center rounded-full font-semibold", color, className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials || "?"}
    </span>
  );
}
