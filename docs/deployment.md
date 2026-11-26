# Deployment (GitHub → Vercel + Supabase, kostenlos)

## 1. Supabase
1. https://supabase.com → New project, Region **Zürich (eu-central-2)** falls angeboten, sonst **Frankfurt (eu-central-1)**. Free Plan.
2. Datenbank-Passwort sicher im Passwortmanager ablegen.
3. Migration einspielen – entweder per CLI:
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref <ref>
   ```
   ```bash
   npx supabase db push
   ```
   oder im Dashboard → SQL Editor den Inhalt von `supabase/migrations/20261126000001_initial_schema.sql` ausführen.
   **`seed.sql` nicht in Produktion ausführen** (nur lokale Demo).
4. Authentication → Sign In / Providers → Email: **„Allow new users to sign up“ ausschalten** (nur Einladungen).
   Mindestpasswortlänge 12. URL Configuration: Site URL = App-URL, Redirect URL `https://<app>/api/auth/callback`.
5. Ersten Administrator anlegen (einmalig): Authentication → Users → **Add user** (E-Mail + Passwort, „Auto confirm“).
   Danach im SQL Editor:
   ```sql
   with f as (insert into public.families (name, created_by) values ('Familie', '<USER_UUID>') returning id)
   insert into public.family_members (family_id, user_id, role) select id, '<USER_UUID>', 'admin' from f;
   ```
   Weitere Mitglieder lädt der Admin danach in der App ein (Einstellungen → Familie verwalten → Einladungslink).
6. API Keys kopieren (Publishable + Secret) → Vercel.

## 2. Vercel
1. https://vercel.com → Add New Project → GitHub-Repo importieren (Hobby Plan, Framework Next.js).
2. Environment Variables gemäss `docs/environment.md` setzen.
3. Deploy. Die App ist unter `https://<projekt>.vercel.app` per HTTPS erreichbar (eigene Domain optional).
4. `vercel.json` setzt die Function-Region auf Frankfurt (`fra1`, nahe Supabase EU) und einen täglichen Cron.

## 3. Anbieter verbinden
- WHOOP: docs/whoop-setup.md (Redirect- und Webhook-URL mit der Vercel-URL ergänzen).
- Google Health: docs/google-cloud-setup.md (inkl. Subscriber-Skript).

## 4. Hintergrund-Synchronisation
- **Primär:** Webhooks von WHOOP und Google → Job-Queue → Verarbeitung direkt nach der Antwort (`after()`).
- **Fallback täglich:** Vercel Cron (`/api/sync/cron`, Hobby-Plan = max. 1×/Tag).
- **Fallback häufiger (empfohlen, gratis):** Supabase Cron alle 30 min, siehe `supabase/cron.sql.example`.
  Hält zugleich das Supabase-Free-Projekt aktiv (Pausierung nach 7 Tagen Inaktivität).

## 5. Free-Tier-Einschränkungen
| Thema | Vercel Hobby | Supabase Free |
|---|---|---|
| Cron | 1×/Tag | pg_cron unbegrenzt |
| Laufzeit | begrenzte Function-Dauer (Jobs sind darauf ausgelegt) | – |
| Speicher | – | 500 MB DB (4 Personen × Tageswerte ≈ wenige MB/Jahr) |
| Inaktivität | – | Pausierung nach 7 Tagen ohne Aktivität |
| Backups | – | keine herunterladbaren Backups → regelmässig „Daten exportieren“ oder `supabase db dump` |
| Nutzung | nur privat/nicht-kommerziell | – |
Aktuelle Limits vor dem Go-live prüfen: vercel.com/docs/limits, supabase.com/pricing. Kostenpflichtige Pläne werden nicht benötigt.

## 6. Installation auf dem Handy (PWA)
- **iPhone:** Safari → App-URL öffnen → Teilen → „Zum Home-Bildschirm“. Kein Apple-Developer-Account nötig.
- **Android:** Chrome → Menü ⋮ → „App installieren“.

## 7. Checks nach dem Deployment
```bash
curl -s https://<app>/api/health
```
Erwartet: `supabaseConfigured`, `whoopConfigured`, `googleHealthConfigured` = true, `demoMode` = false.
