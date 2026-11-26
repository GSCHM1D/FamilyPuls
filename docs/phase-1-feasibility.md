# Phase 1 – Technische Machbarkeit

Stand der Prüfung: **26.11.2026**. Grundlage: offizielle Dokumentation und maschinenlesbare
API-Spezifikationen der Anbieter, direkt abgerufen (nicht aus dem Gedächtnis).

| Quelle | URL |
|---|---|
| WHOOP OpenAPI v2 | https://api.prod.whoop.com/developer/doc/openapi.json |
| WHOOP Docs (OAuth, Webhooks, Rate Limits, App Approval) | https://developer.whoop.com/docs/developing/ |
| WHOOP API Terms | https://developer.whoop.com/api-terms-of-use |
| Google Health API v4 Discovery Document | https://health.googleapis.com/$discovery/rest?version=v4 |
| Google Health Webhooks | https://developers.google.com/health/webhooks |
| Google Health Filters / Data Types / Rate Limits / App Verification | https://developers.google.com/health/ |
| Google Health API Developer & User Data Policy | https://developers.google.com/health/policies/health-api-developer-user-data-policy |

> **Wichtig – noch nicht erledigt:** Echte API-Aufrufe mit den Konten der Familie wurden
> **noch nicht** durchgeführt, da dafür eure eigenen Zugangsdaten nötig sind. Die
> Integrationen sind gegen die offiziellen Schemas implementiert und mit fiktiven,
> schemakonformen Antworten getestet. Sie gelten erst als funktionierend, wenn die
> Probe-Skripte (unten) mit echten Konten erfolgreich waren.

## 1. WHOOP API v2

**OAuth 2.0**
- Authorize: `https://api.prod.whoop.com/oauth/oauth2/auth`, Token: `https://api.prod.whoop.com/oauth/oauth2/token`
- Scopes: `read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement` + `offline` (für Refresh-Token)
- `state` ist Pflicht (mind. 8 Zeichen). PKCE ist **nicht dokumentiert** → wird nicht vorausgesetzt.
- **Refresh-Token-Rotation: ja.** Jeder Refresh liefert einen neuen Refresh-Token und entwertet den alten.
  Gleichzeitige Refreshes führen zu Fehlern → FamilyPulse nutzt eine Datenbank-Lease (`acquire_refresh_lock`).
- Widerruf: `DELETE /v2/user/access` (stoppt auch Webhooks für den Nutzer).

**Endpunkte (alle verwendet):** `GET /v2/user/profile/basic`, `/v2/user/measurement/body`, `/v2/cycle`,
`/v2/recovery`, `/v2/activity/sleep`, `/v2/activity/sleep/{id}`, `/v2/activity/workout`, `/v2/activity/workout/{id}`.
Pagination: `limit` (max. 25), `start`, `end`, `nextToken` → Antwort `records`, `next_token`.

**Verfügbarkeit der gewünschten Kennzahlen**

| Kennzahl | Verfügbar | Feld |
|---|---|---|
| Recovery Score | ✅ | `recovery.score.recovery_score` |
| Strain | ✅ | `cycle.score.strain`, `workout.score.strain` |
| HRV | ✅ | `recovery.score.hrv_rmssd_milli` (RMSSD, ms) |
| Ruhepuls | ✅ | `recovery.score.resting_heart_rate` |
| Sleep Performance | ✅ | `sleep.score.sleep_performance_percentage` |
| Sleep Efficiency | ✅ | `sleep.score.sleep_efficiency_percentage` |
| Schlafphasen | ⚠️ nur Summen | `stage_summary.total_*_milli` (keine Zeitsegmente) |
| Kalorien | ✅ | `kilojoule` (→ kcal umgerechnet, ÷ 4.184) |
| Schritte | ✅ (neu) | `cycle.step_count` (null, wenn keine Daten) |
| Atemfrequenz | ✅ | `sleep.score.respiratory_rate` |
| SpO2 | ✅ (optional) | `recovery.score.spo2_percentage` |
| Hauttemperatur | ✅ (absolut, °C) | `recovery.score.skin_temp_celsius` |
| Aktive Minuten | ❌ | – (nur Herzfrequenzzonen pro Workout) |

**Webhooks (v2):** Events `recovery|sleep|workout.updated|deleted`, Payload `{user_id, id, type, trace_id}`.
Recovery-Events tragen die **Sleep-UUID**. Signatur: `base64(HMAC-SHA256(X-WHOOP-Signature-Timestamp + raw_body, client_secret))`.
Keine Webhooks für Cycles → Strain/Schritte werden beim nächsten Schlaf-/Workout-Event bzw. per Fallback-Sync aktualisiert.

**Rate Limits:** 100 Requests/Minute, 10’000/Tag pro App; Header `X-RateLimit-*`, sonst 429.

**Entwicklungs-/Sandbox-Modus:** Jede neue App startet im **Sandbox-Tier mit bis zu 10 WHOOP-Mitgliedern** –
ohne Freigabeantrag. ✅ Für 3 WHOOP-Konten ausreichend.

**Nutzungsbedingungen (Auszug):** Zugriff nur mit ausdrücklicher Autorisierung jedes Endnutzers; Datenschutzerklärung
erforderlich; Weitergabe an Dritte nur wie durch Terms, Endnutzer und Datenschutzerklärung erlaubt; Verschlüsselung
in Transit und at Rest; kein Verkauf, keine Werbung, kein Medizinprodukt. Die Anzeige an Familienmitglieder
erfolgt nur mit ausdrücklicher, widerrufbarer Freigabe des jeweiligen Mitglieds → aus unserer Sicht vereinbar.
**Keine Rechtsberatung** – bitte die Terms selbst lesen (Link oben).

## 2. Google Health API v4

Die alte Fitbit Web API ist seit **2. November 2026 abgeschaltet**; die Google Health API ist der offizielle Nachfolger.

**OAuth 2.0** (Google Standard): Authorize `https://accounts.google.com/o/oauth2/v2/auth`, Token
`https://oauth2.googleapis.com/token`, `access_type=offline`, `prompt=consent`, PKCE (S256) und `state`.
Verwendete Scopes (nur Lesen):

| Scope | Datentypen (Auszug) |
|---|---|
| `googlehealth.activity_and_fitness.readonly` | steps, exercise, active-minutes, active-zone-minutes, total-calories |
| `googlehealth.sleep.readonly` | sleep |
| `googlehealth.health_metrics_and_measurements.readonly` | daily-resting-heart-rate, daily-heart-rate-variability, daily-oxygen-saturation, daily-respiratory-rate, daily-sleep-temperature-derivations, heart-rate |
| `googlehealth.profile.readonly` | profile |

Nicht angefordert: Schreib-Scopes, `location`, `nutrition`, `ecg`, `irn`, `reproductive_health`, `logged_symptoms`, `mindfulness`.
Teilweise erteilte Berechtigungen werden erkannt (`scope` in der Token-Antwort) und angezeigt; fehlende Kategorien werden nicht abgefragt.

**Endpunkte:** `GET /v4/users/me/identity` (Verknüpfungsprüfung, liefert `healthUserId`),
`GET /v4/users/me/dataTypes/{type}/dataPoints` (Filter AIP-160, `pageToken`/`nextPageToken`, Sleep/Exercise max. 25 pro Seite),
`POST …/dataPoints:dailyRollUp` (Steps/AZM max. 90 Tage, Heart-Rate/Total-Calories/Active-Minutes max. 14 Tage).

**Fitbit Air – laut Gerätekompatibilitätstabelle unterstützt:** active-minutes, active-zone-minutes,
daily-heart-rate-variability, daily-oxygen-saturation, daily-respiratory-rate, daily-resting-heart-rate,
daily-sleep-temperature-derivations, distance, exercise, floors, heart-rate, heart-rate-variability,
respiratory-rate-sleep-summary, run-vo2-max, sedentary-period, sleep, steps.

**Nicht verfügbar:** Ein **Readiness Score** und ein **Sleep Score** existieren in der API v4 nicht
(weder im Discovery-Dokument noch in der Datentypliste). FamilyPulse zeigt dafür einen Hinweis und **berechnet keinen Ersatz**.
Schlafeffizienz wird ebenfalls nicht geliefert und deshalb nicht berechnet.

**Webhooks:** Subscriber pro Google-Cloud-Projekt (`projects.subscribers`, benötigt Service-Account mit `cloud-platform`),
`AUTOMATIC`-Subscriptions für alle Nutzer mit Einwilligung. Verifikations-Handshake (mit Authorization → 200/201,
ohne → 401/403). Benachrichtigungen: JSON-Array (1–99) mit `healthUserId`, `operation` (UPSERT/DELETE), `dataType`,
Zeitintervallen; Authentifizierung über den konfigurierten `Authorization`-Header **und** ECDSA-P256-Signatur
(`GOOGLE-HEALTH-API-SIGNATURE`, Tink-Keyset unter `https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json`).
Zustellung „best effort“, Retries bis 24 h → Fallback-Sync ist nötig und implementiert.

**Rate Limits:** 300 Requests/Minute pro Nutzer; 429/503/504 mit Backoff + Jitter wiederholen.

**Verifizierung / Testing-Modus:** Die meisten Google-Health-Scopes sind **restricted**. Unverifizierte Apps sind auf
**100 Nutzer** begrenzt (für 4 Personen ausreichend). Im Publishing-Status **„Testing“** verfallen Refresh-Tokens
nach **7 Tagen** → für den Dauerbetrieb muss die App auf **„In production“** gestellt werden. Unverifiziert zeigt Google
dann einen Warnhinweis („Google hat diese App nicht überprüft“); eine vollständige Verifizierung inkl. CASA-Sicherheitsprüfung
(kostenpflichtig, 500–4’500 USD) ist **für eine private 4-Personen-App voraussichtlich nicht erforderlich**,
muss aber **mit eurem Konto bestätigt werden** (siehe docs/google-cloud-setup.md, Schritt 9). ⚠️ Offener Punkt.

**Datenrichtlinie (Auszug):** Erlaubter Use Case „Monitor/Analyse von Gesundheits-/Fitnessdaten über eine UI“.
Weitergabe an Dritte nur „to provide or improve your appropriate use case or features that are clear from the
requesting application's user interface and only with the user's consent“. Pflicht zu einer **In-App-Offenlegung**
(nicht nur in der Datenschutzerklärung) → in FamilyPulse im Bereich Datenfreigaben umgesetzt. Kein Verkauf,
keine Werbung, keine Bonitätsprüfung, kein Medizinprodukt.

## 3. Hosting (kostenlos)

| Dienst | Einschränkung (Free/Hobby) | Lösung in FamilyPulse |
|---|---|---|
| Vercel Hobby | Cron-Jobs nur 1× täglich; nur private, nicht-kommerzielle Nutzung | Webhooks als Hauptweg; täglicher Vercel-Cron + optional Supabase Cron alle 30 min |
| Vercel Functions | begrenzte Laufzeit pro Aufruf | Jobs in ≤ 31-Tage-Blöcken, Zeitbudget pro Lauf, Queue in Postgres |
| Supabase Free | 500 MB DB; **Pausierung nach 7 Tagen Inaktivität**; keine automatischen Backups mit Download | Webhooks + Cron halten das Projekt aktiv; Datenexport-Funktion; Backup-Hinweis in docs/deployment.md |
| Supabase Region | frei wählbar | **eu-central-2 (Zürich)** oder eu-central-1 (Frankfurt) |

Die genauen Limits ändern sich; vor dem Go-live auf vercel.com/docs/limits und supabase.com/pricing prüfen.

## 4. Fazit

Technisch machbar mit kostenlosen Diensten. Offene Punkte, die nur ihr klären könnt:
1. Echter Test mit mindestens einem WHOOP-Konto (`npm run probe:whoop`).
2. Echter Test mit dem Fitbit-Air-Konto (`npm run probe:google-health`), inkl. Prüfung, welche Werte der Air tatsächlich liefert und ob die `.date`-Filter wie dokumentiert funktionieren.
3. Google-Projekt auf „In production“ ohne Verifizierung – bestätigen, dass Google das für eure Scopes zulässt.
4. Rechtliche Prüfung (DSG/Minderjährige, siehe docs/privacy-and-compliance.md).
