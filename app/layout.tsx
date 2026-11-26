import type { Metadata, Viewport } from "next";
import { getCookiePreferences } from "@/lib/auth/session";
import { ServiceWorkerRegistration } from "@/components/navigation/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FamilyPulse", template: "%s · FamilyPulse" },
  description: "Private Gesundheits- und Fitnessplattform für die Familie.",
  applicationName: "FamilyPulse",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FamilyPulse", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, theme } = await getCookiePreferences();
  const themeClass = theme === "light" ? "light" : theme === "system" ? "theme-system" : "dark";
  return (
    <html lang={locale === "de" ? "de-CH" : "en"} className={themeClass} suppressHydrationWarning>
      <body className="min-h-dvh">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
