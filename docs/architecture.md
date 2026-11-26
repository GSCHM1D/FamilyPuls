# Architektur & Entscheidungen

```
WHOOP ×3 ── WHOOP API v2 ─────┐ (OAuth pro Person, Webhooks HMAC)
                              ▼
Fitbit Air ── Google Health API v4 ──► Next.js Route Handlers (Vercel, fra1)
                              │        ├─ /api/<provider>/connect|callback|disconnect
                              │        ├─ /api/webhooks/{whoop,google-health}
                              │        └─ /api/sync/{cron,manual,backfill}
                              ▼
                  Supabase Postgres (EU) ── RLS: public.can_view(owner, category)
                              ▼
            Server Components (User-JWT) ──► PWA auf 4 Smartphones
```

## Schichten
| Ordner | Aufgabe |
|---|---|
| `lib/providers/*` | Provider-Adapter (`HealthProvider`-Interface), OAuth, Token-Manager, Webhook-Verifikation |
| `lib/providers/*/normalize.ts` | reine Funktionen: Anbieter-JSON → `DailyMetricRow`, `SleepSessionRow`, `WorkoutRow` |
| `lib/sync/*` | Job-Queue, Engine (Retry/Backoff/Rate-Limit), Writer (Upsert + Abgleich gelöschter Datensätze) |
| `lib/data/*` | Lese-Repository (Supabase mit User-JWT **oder** Demo), Kennzahl-Zusammenfassungen |
| `lib/metrics/catalog.ts` | Kennzahlen, Einheiten, Freigabekategorie, Vergleichbarkeit, unterstützende Anbieter |
| `app/(app)/*` | Seiten: Übersicht, Familie, Detail, Trends, Profil, Einstellungen |

## Wichtige Entscheidungen
1. **Freigaben in der Datenbank erzwungen.** Alle Gesundheitsdaten werden mit dem JWT des angemeldeten Nutzers gelesen;
   RLS ruft `can_view(owner, category)` auf. Auch Admins sehen nur Freigegebenes. Das Frontend kann nichts „aufdecken“.
2. **Schreiben nur durch das Backend.** Nutzer haben keine INSERT/UPDATE-Rechte auf Gesundheitstabellen.
3. **Tokens:** AES-256-GCM in der App (Schlüssel nur in Vercel), Verbindung-ID als Associated Data, Tabelle ohne Grants
   für `anon`/`authenticated` und ohne RLS-Policy.
4. **Token-Refresh nur bei Bedarf** (Ablauf − 2 min oder 401), abgesichert durch eine Lease in der DB – wichtig wegen
   WHOOP-Refresh-Token-Rotation.
5. **Job-Queue in Postgres** (`claim_sync_jobs` mit `FOR UPDATE SKIP LOCKED`, max. 1 laufender Job pro Verbindung,
   Dedupe-Key). Kein zusätzlicher (kostenpflichtiger) Queue-Dienst.
6. **Synchronisation per Datumsbereich** statt Einzeldatensatz: Ein Webhook löst einen Re-Sync des betroffenen Tages ±1
   aus; der Writer ersetzt den Bereich (Upsert + Löschen nicht mehr gelieferter Datensätze) → Korrekturen und Löschungen
   werden übernommen, Duplikate sind über eindeutige Schlüssel ausgeschlossen.
7. **Lokales Datum:** Schlaf/Recovery = Datum des Aufwachens; WHOOP-Cycle = lokales Datum der Zyklusmitte; Google liefert
   Civil-Dates direkt. Technische Zeitstempel UTC, Anzeige in der Profil-Zeitzone (Standard Europe/Zurich).
8. **Keine erfundenen Werte:** fehlende Werte bleiben `null`, Diagramme zeigen Lücken (`connectNulls=false`).
   Einzige Ableitungen: kJ→kcal (WHOOP), Schlafdauer = Summe der Schlafphasen (WHOOP), Temperaturabweichung =
   nightly − baseline (von Google so empfohlen), aktive Minuten = moderat + intensiv (Google).
9. **Demo-Modus** läuft komplett im Speicher (deterministischer Generator), erstellt keinen Supabase-Client und kann
   keine echten Daten überschreiben. Zusätzlich verhindern DB-Trigger das Mischen von `source='demo'` und echten Daten.
10. **Eine Familie pro Nutzer** (v1, eindeutiger Index). Pro-Mitglied-Freigaben sind bereits im Schema enthalten.

## Vergleichbarkeit
| Klasse | Kennzahlen | Darstellung |
|---|---|---|
| vergleichbar | Schlafdauer, Schritte, Ruhepuls, Trainingsdauer/-anzahl | gemeinsame Diagramme |
| eingeschränkt | HRV, Kalorien, Schlafphasen, Atemfrequenz, SpO2, Ø/Max-Puls, aktive Minuten | gemeinsame Diagramme mit Hinweis |
| herstellerspezifisch | WHOOP Recovery, Strain, Sleep Performance/Consistency, Hauttemperatur; Fitbit AZM, Temperaturabweichung | immer mit Quelle; nie über verschiedene Hersteller verglichen |

Ein eigener „FamilyPulse Score“ ist bewusst **nicht** implementiert.

## Neuen Tracker hinzufügen
1. `ProviderId` in `types/health.ts` + DB-Check-Constraints erweitern (neue Migration).
2. Adapter in `lib/providers/<name>/` mit `HealthProvider` implementieren, Normalisierung als reine Funktion + Tests.
3. In `lib/providers/registry.ts` registrieren, Routen `app/api/<name>/{connect,callback,disconnect}` anlegen.
4. In `lib/metrics/catalog.ts` die gelieferten Kennzahlen dem Anbieter zuordnen.
