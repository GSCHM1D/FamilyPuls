import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/env";
import { DemoRepository } from "@/lib/data/demo-repository";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import type { HealthRepository, ViewerContext } from "@/lib/data/types";
import { DEFAULT_LOCALE, dictionaries, isLocale, type Dictionary, type Locale } from "@/lib/i18n/dictionaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const LOCALE_COOKIE = "fp_locale";
export const THEME_COOKIE = "fp_theme";

export type Theme = "dark" | "light" | "system";

export const getCookiePreferences = cache(async (): Promise<{ locale: Locale; theme: Theme }> => {
  const store = await cookies();
  const locale = store.get(LOCALE_COOKIE)?.value;
  const theme = store.get(THEME_COOKIE)?.value;
  return {
    locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
    theme: theme === "light" || theme === "system" || theme === "dark" ? theme : "dark",
  };
});

/** Per-request data access. Demo mode never creates a Supabase client. */
export const getRepository = cache(async (): Promise<HealthRepository | null> => {
  if (isDemoMode()) {
    const prefs = await getCookiePreferences();
    return new DemoRepository(prefs);
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return new SupabaseRepository(supabase, data.user.id, data.user.email ?? null);
});

export interface PageContext {
  repo: HealthRepository;
  viewer: ViewerContext;
  t: Dictionary;
  locale: Locale;
}

/** For authenticated pages: redirects to /login when there is no session. */
export async function requirePageContext(): Promise<PageContext> {
  const repo = await getRepository();
  if (!repo) redirect("/login");
  const viewer = await repo.viewer();
  if (!viewer) redirect("/login");
  return { repo, viewer, t: dictionaries[viewer.locale], locale: viewer.locale };
}

export async function getDictionary(): Promise<{ t: Dictionary; locale: Locale }> {
  const { locale } = await getCookiePreferences();
  return { t: dictionaries[locale], locale };
}
