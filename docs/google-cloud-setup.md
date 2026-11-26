# Google Cloud & Google Health API einrichten (Fitbit Air)

Voraussetzung: Die Person mit dem Fitbit Air hat ihren Tracker in der **Fitbit-/Google-Health-App mit ihrem
Google-Konto** verbunden und die Daten werden dort angezeigt.

> Gib Client Secrets, Tokens oder Passwörter **nie** in einen Chat ein. Trage sie nur in `.env.local`
> (lokal) bzw. in Vercel → Settings → Environment Variables ein.

## 1. Google Cloud Project erstellen
1. https://console.cloud.google.com → oben Projektauswahl → **Neues Projekt** → Name `familypulse`.
2. Projektnummer notieren (Dashboard → „Projektinformationen“). Sie wird für Webhooks gebraucht.

## 2. Google Health API aktivieren
APIs & Dienste → Bibliothek → „Google Health API“ suchen → **Aktivieren**.

## 3. OAuth Consent Screen (Google Auth Platform)
1. APIs & Dienste → **OAuth-Zustimmungsbildschirm** → Zielgruppe **Extern** (ein privates Gmail-Konto hat keine „Intern“-Option).
2. App-Name `FamilyPulse`, Support-E-Mail, Kontakt-E-Mail eintragen.
3. Optional: Link zur Datenschutzerklärung (z. B. `https://<deine-app>/settings#data` oder eine eigene Seite).

## 4. Scopes konfigurieren (nur Lesen)
Unter **Datenzugriff** → „Bereiche hinzufügen“:
```
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.profile.readonly
```
Keine weiteren Scopes hinzufügen.

## 5. Fitbit-Nutzer als Testnutzer hinzufügen
**Zielgruppe → Testnutzer** → Google-Adresse der Fitbit-Person hinzufügen (solange die App im Status „Testing“ ist).

## 6. OAuth-Client erstellen
APIs & Dienste → **Anmeldedaten** → „Anmeldedaten erstellen“ → **OAuth-Client-ID** → Typ **Webanwendung**.
- Autorisierte Weiterleitungs-URIs:
  - `http://localhost:3000/api/google-health/callback` (Entwicklung)
  - `https://<deine-app>.vercel.app/api/google-health/callback` (Produktion)
- Client-ID → `GOOGLE_HEALTH_CLIENT_ID`, Client-Secret → `GOOGLE_HEALTH_CLIENT_SECRET`,
  Redirect-URI → `GOOGLE_HEALTH_REDIRECT_URI` (muss exakt übereinstimmen).

## 7. Erster echter API-Aufruf
Variante A (empfohlen): App lokal oder auf Vercel starten → Einstellungen → „Google Health (Fitbit) verbinden“.
Nach dem Callback ruft FamilyPulse `GET https://health.googleapis.com/v4/users/me/identity` auf; nur wenn
eine `healthUserId` zurückkommt, wird die Verbindung gespeichert.

Variante B (Machbarkeitstest ohne App): OAuth 2.0 Playground (https://developers.google.com/oauthplayground) →
Zahnrad → „Use your own OAuth credentials“ → Client-ID/Secret eintragen (dafür `https://developers.google.com/oauthplayground`
als Redirect-URI im Client ergänzen) → obige Scopes autorisieren → Access-Token kopieren und **nur im eigenen Terminal**:
```bash
GOOGLE_HEALTH_ACCESS_TOKEN='…' npm run probe:google-health
```
Das Skript zeigt pro Datentyp HTTP-Status, Anzahl Datenpunkte und die Feldstruktur – **ohne Gesundheitswerte**.
Bitte das Ergebnis (Statuscodes/Felder) zurückmelden, damit die tatsächlich verfügbaren Fitbit-Air-Werte dokumentiert werden können.

## 8. Webhooks (automatische Aktualisierung)
1. App auf Vercel deployen (der Endpunkt muss öffentlich per HTTPS erreichbar sein).
2. `GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION` setzen (`npm run generate:key` erzeugt einen Wert `Bearer …`), neu deployen.
3. Service-Rolle: IAM → deinem Google-Konto (oder einem Service-Account) die Rolle **Google Health API Admin** geben.
4. Subscriber registrieren (Cloud Shell oder lokal mit gcloud):
   ```bash
   GCP_ACCESS_TOKEN=$(gcloud auth print-access-token) GCP_PROJECT_NUMBER=<nummer> APP_URL=https://<deine-app>.vercel.app GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION='Bearer …' node scripts/google-health-subscriber.mjs
   ```
   Google prüft dabei den Endpunkt (mit Secret → 201, ohne → 401). Danach `"state": "ACTIVE"`.

## 9. Produktion & Verifizierung prüfen
- Im Status **Testing** laufen Refresh-Tokens nach **7 Tagen** ab → die Fitbit-Person müsste sich wöchentlich neu verbinden.
- Für Dauerbetrieb: Zielgruppe → **App veröffentlichen** („In production“). Ohne Verifizierung bleibt die App auf
  100 Nutzer begrenzt und zeigt beim Login einen Warnhinweis („Google hat diese App nicht überprüft“ → „Erweitert“ → „Weiter“).
- Laut Google-Doku müssen Apps mit restricted Scopes vor einer **öffentlichen** Verfügbarkeit verifiziert werden
  (inkl. CASA-Assessment, kostenpflichtig). Für eine private App mit 4 Nutzern ist das voraussichtlich nicht nötig –
  ⚠️ **das ist mit eurem Projekt zu bestätigen**: Nach dem Veröffentlichen prüfen, ob die Verbindung länger als 7 Tage hält
  (Einstellungen → Synchronisationsstatus). Falls Google die Veröffentlichung ohne Verifizierung ablehnt, bleibt als
  Alternative nur Testing-Modus mit wöchentlicher Neu-Autorisierung (FamilyPulse zeigt dann „Erneute Anmeldung erforderlich“).

## 10. Datenschutz- und Datenfreigaberichtlinie
Lesen: https://developers.google.com/health/policies/health-api-developer-user-data-policy und
https://developers.google.com/health/policies/health-api-developer-terms-and-conditions.
FamilyPulse erfüllt die Kernpunkte so: nur Lese-Scopes, kein Verkauf/Werbung, Weitergabe an Familienmitglieder nur
nach ausdrücklicher Freigabe in der App, In-App-Offenlegung im Bereich „Datenfreigaben“, Datenexport und Löschung.
