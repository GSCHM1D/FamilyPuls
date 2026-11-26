"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, HeartPulse, Settings, TrendingUp, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavLabels {
  overview: string;
  family: string;
  trends: string;
  profile: string;
  settings: string;
}

const ITEMS = [
  { href: "/dashboard", key: "overview", icon: Activity },
  { href: "/family", key: "family", icon: Users },
  { href: "/trends", key: "trends", icon: TrendingUp },
  { href: "/profile", key: "profile", icon: User },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

export function BottomNav({ labels }: { labels: NavLabels }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/85 backdrop-blur-xl pb-safe md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors", active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                {labels[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ labels, appName }: { labels: NavLabels; appName: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border/60 px-3 py-6 md:flex">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-3 text-lg font-semibold tracking-tight">
        <HeartPulse className="size-6 text-primary" /> {appName}
      </Link>
      <ul className="flex flex-col gap-1">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
              >
                <Icon className={cn("size-5", active && "text-primary")} />
                {labels[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
