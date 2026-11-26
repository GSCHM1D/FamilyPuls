# FamilyPulse

Private Gesundheits- und Fitness-Web-App (PWA) für eine Familie: Sie führt die Daten von **WHOOP** (WHOOP API v2)
und **Fitbit** (Google Health API v4) auf einer gemeinsamen Plattform zusammen. Jedes Mitglied entscheidet selbst,
welche Daten die Familie sehen darf – erzwungen in der Datenbank per Row Level Security.

> **Status:** Der Code ist vollständig und getestet (Unit-, Datenbank-, Route- und End-to-End-Tests, Build).
> Die Provider-Integrationen sind gegen die **offiziellen API-Spezifikationen** gebaut. **WHOOP ist mit einem echten
> Konto verifiziert** (26.11.2026); der Test der Google Health API mit dem Fitbit-Konto steht noch aus.

## Funktionen
- Persönliches Dashboard: Recovery/Readiness, Strain, Schlaf, Ruhepuls, HRV, Schritte, Kalorien, Puls, aktive Minuten,
  Trainings, Atemfrequenz, SpO2, Hauttemperatur – mit Vortagesvergleich, persönlichem Durchschnitt, Sparkline und Aktualisierungszeit
- Familien-Dashboard (Karten auf dem Handy, Vergleichstabelle auf grossen Bildschirmen), Detailansicht pro Mitglied
  (Erholung, Schlaf inkl. Phasen/Hypnogramm, Aktivität, Trainings, Gesundheitswerte)
- Trends: Heute, 7/14/30/90/365 Tage, benutzerdefiniert; Linie/Balken/Fläche/Radial/Schlafphasen; Mehrpersonen-Vergleich
  nur für vergleichbare Kennzahlen; Lücken bei fehlenden Werten
- Einladungsbasierte Konten (keine öffentliche Registrierung), Rollen Admin/Mitglied, Magic Link, Passwort-Reset,
  Profilbild, Datenfreigaben pro Kategorie und optional pro Mitglied, Export, Account-Löschung
- OAuth pro Person, verschlüsselte Tokens, Refresh bei Bedarf mit Lock, Webhooks, Fallback-Cron, Backfill bis 365 Tage
- Dark Mode (Standard), Light/System, Deutsch (Schweiz) + Englisch, Schweizer Formate (10’420 · 8 h 12)
- Installierbare PWA mit Safe-Area-Unterstützung; es werden keine Gesundheitsdaten offline gespeichert

## Schnellstart (Demo, ohne Konten)
```bash
npm install
```
```bash
npm run dev:demo
```
http://localhost:3000 → „Demo öffnen“. Vier fiktive Mitglieder, ≥ 90 Tage synthetische Daten, klar als Demo markiert.

## Lokale Entwicklung mit Supabase
```bash
cp .env.example .env.local
```
```bash
npm run generate:key
```
Werte in `.env.local` eintragen (siehe [docs/environment.md](docs/environment.md)), dann:
```bash
npx supabase start
```
```bash
npx supabase db reset
```
```bash
npm run dev
```
Lokal legt `seed.sql` vier Demo-Logins an (`alex@demo.familypulse.local`, Passwort `demo-password-123`).

## Tests & Qualität
```bash
npm run typecheck && npm run lint && npm test
```
```bash
npm run test:e2e
```
- `tests/unit/db/*` – startet Postgres (PGlite) mit der echten Migration und prüft RLS: anonym kein Zugriff, fremde
  Familie kein Zugriff, Admin ohne Freigabe kein Zugriff, Widerruf sofort wirksam, Tokens nicht lesbar, Demo-Isolation,
  Upserts/Duplikate, Job-Locking, Rate-Limiter, Kaskadenlöschung
- `tests/unit/*` – Normalisierung (WHOOP/Google), Zeitzonen, fehlende Werte, Verschlüsselung, OAuth-State/PKCE,
  Token-Refresh inkl. Parallelität, Retry/Rate-Limits, Webhook-Signaturen, Sync-Engine, Routen-Sicherheit, Proxy, Log-Redaktion
- `tests/e2e/*` – Playwright (iPhone + Desktop) im Demo-Modus: Navigation, Freigaben, Vergleichbarkeit, Security-Header, PWA

## Dokumentation
| Dokument | Inhalt |
|---|---|
| [docs/phase-1-feasibility.md](docs/phase-1-feasibility.md) | Ergebnis der API-, Policy- und Hosting-Prüfung |
| [docs/architecture.md](docs/architecture.md) | Architektur, Datenmodell, Entscheidungen, Vergleichbarkeit, neue Tracker |
| [docs/whoop-setup.md](docs/whoop-setup.md) | WHOOP Developer App |
| [docs/google-cloud-setup.md](docs/google-cloud-setup.md) | Google Cloud / Google Health in 10 Schritten |
| [docs/environment.md](docs/environment.md) | alle Variablen, Herkunft, öffentlich vs. geheim |
| [docs/deployment.md](docs/deployment.md) | Supabase + Vercel, Cron, Free-Tier-Grenzen, PWA-Installation |
| [docs/privacy-and-compliance.md](docs/privacy-and-compliance.md) | DSG, Minderjährige, Anbieterbedingungen, Sicherheitsmassnahmen |

## Projektstruktur
```
app/            Seiten (App Router) und API-Routen (auth, whoop, google-health, webhooks, sync, account)
components/     ui/, dashboard/, charts/, family/, navigation/, settings/, auth/
lib/            providers/{whoop,google-health}, sync/, data/, supabase/, auth/, encryption/, normalization/, metrics/, i18n/, demo/
supabase/       migrations/, seed.sql (nur lokal), config.toml, cron.sql.example
scripts/        generate-secrets, check-env, probe-whoop, probe-google-health, google-health-subscriber
tests/          unit/ (inkl. db/), e2e/
```

## Nächste Schritte (benötigen euch)
1. Supabase-Projekt (EU) und Vercel-Projekt anlegen → [docs/deployment.md](docs/deployment.md)
2. WHOOP-App erstellen und mit einem Konto testen (`npm run probe:whoop`) → [docs/whoop-setup.md](docs/whoop-setup.md)
3. Google-Cloud-Projekt einrichten und Fitbit-Konto testen (`npm run probe:google-health`) → [docs/google-cloud-setup.md](docs/google-cloud-setup.md)
4. Ergebnisse der Probe-Skripte zurückmelden (nur Statuscodes/Feldnamen, keine Tokens) – dann werden die
   tatsächlich verfügbaren Messwerte dokumentiert und ggf. Anpassungen vorgenommen.

## Bekannte Einschränkungen
- Google-Health-Antworten wurden noch nicht mit echten Daten verifiziert. Insbesondere der `.date`-Filter für tägliche Google-Datentypen ist nur dokumentiert, nicht getestet.
- Neue Supabase-Projekte vergeben keine Tabellenrechte mehr automatisch an `service_role` → Migration `20261127000001_service_role_grants.sql` ausführen.
- Google Health liefert keinen Readiness- oder Sleep-Score und keine Schlafeffizienz; WHOOP liefert keine aktiven Minuten und keine Schlafphasen-Segmente.
- WHOOP sendet keine Webhooks für Cycles (Strain/Schritte/Kalorien des laufenden Tages) → Aktualisierung über Schlaf-/Workout-Events, manuellen Sync oder Fallback-Cron.
- Google-Projekt im Status „Testing“: Refresh-Tokens verfallen nach 7 Tagen. Ob „In production“ ohne Verifizierung möglich ist, muss mit eurem Projekt bestätigt werden.
- Vercel Hobby: Cron nur 1×/Tag → für häufigere Fallback-Syncs Supabase Cron verwenden (kostenlos).
- Keine Live-Herzfrequenz: Daten erscheinen erst nach der Synchronisation des Trackers mit der Hersteller-App.
- Version 1: ein Nutzer gehört genau einer Familie an.
- Bei ungültigen Detail-URLs zeigt Next.js wegen Streaming die 404-Seite mit HTTP-Status 200 an (es werden keine Daten preisgegeben).
