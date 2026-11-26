# Datenschutz, Sicherheit & Nutzungsbedingungen

> Dies ist eine technische Einordnung, **keine Rechtsberatung**.

## Schweizer Datenschutzgesetz (revDSG, seit 1.9.2023)
- Gesundheitsdaten sind **besonders schützenswerte Personendaten** (Art. 5 lit. c DSG).
- Bearbeitung für rein persönlichen/familiären Gebrauch ist vom DSG ausgenommen (Art. 2 Abs. 2 lit. a DSG). Eine private
  Familien-App fällt voraussichtlich darunter, solange sie nicht Dritten angeboten wird. Trotzdem setzt FamilyPulse die
  Grundsätze um: Zweckbindung, Datenminimierung (nur Lese-Scopes), ausdrückliche Einwilligung pro Kategorie, Widerruf,
  Auskunft (Export), Löschung, Sicherheit (Art. 8 DSG).
- **Auftragsbearbeiter/Auslandsbekanntgabe:** Supabase (EU-Region wählen) und Vercel (Functions in `fra1`; Vercel ist ein
  US-Unternehmen, Edge-Netzwerk global). Für den privaten Gebrauch vertretbar, aber bewusst entscheiden.

## Minderjährige
- WHOOP- und Google-Konten haben eigene Mindestalter (Google: in der Schweiz i. d. R. 16 Jahre ohne Elternverwaltung;
  WHOOP: gemäss WHOOP Terms). Konten von Kindern müssen den Anbieterregeln entsprechen.
- Urteilsfähige Jugendliche entscheiden nach Schweizer Recht grundsätzlich selbst über ihre Gesundheitsdaten.
  FamilyPulse lässt deshalb **jedes Mitglied selbst** freigeben – auch Eltern/Admins sehen ohne Freigabe nichts.
- Empfehlung: Freigaben gemeinsam besprechen; niemand sollte zur Freigabe gedrängt werden.

## Einwilligung ≠ API-Verbindung
Die Autorisierung bei WHOOP/Google erlaubt nur FamilyPulse den Abruf. Die **Sichtbarkeit für die Familie** ist eine separate,
standardmässig ausgeschaltete Einwilligung pro Kategorie (Einstellungen → Datenfreigaben) mit In-App-Offenlegung.
Widerruf wirkt sofort (RLS prüft bei jeder Abfrage).

## Anbieterbedingungen (Kurzfassung)
- **WHOOP API Terms:** ausdrückliche Autorisierung jedes Endnutzers; Datenschutzerklärung; Weitergabe nur wie von Terms,
  Endnutzer und Datenschutzerklärung erlaubt; Verschlüsselung in Transit/at Rest; kein Verkauf/Werbung/Medizinprodukt.
- **Google Health API Data Policy:** nur genehmigte Use Cases (Monitoring/Analyse über UI); Weitergabe an Dritte nur für
  in der UI erkennbare Funktionen **mit Zustimmung**; In-App-Offenlegung; kein Verkauf/Werbung/Kredit/Medizinprodukt;
  Löschung auf Wunsch.
- Nach unserer Einschätzung ist die Anzeige an Familienmitglieder mit ausdrücklicher Freigabe zulässig. Falls ein Anbieter
  eine Kategorie ausdrücklich verbietet, lässt sich die Freigabe in `lib/metrics/catalog.ts` / den Sharing-Kategorien
  pro Quelle deaktivieren. Derzeit ist kein solches Verbot bekannt.

## Umgesetzte Sicherheitsmassnahmen
| Massnahme | Umsetzung |
|---|---|
| HTTPS/HSTS | Vercel + `Strict-Transport-Security` |
| Session | Supabase Auth, httpOnly-Cookies, serverseitige Prüfung mit `getUser()` |
| CSRF | Origin-Prüfung für alle state-changing Routen, Server Actions (Next.js Origin-Check), OAuth `state` + PKCE |
| XSS/CSP | Nonce-basierte CSP mit `strict-dynamic`, React-Escaping, keine `dangerouslySetInnerHTML` |
| Zugriffskontrolle | RLS (`can_view`), Familienprüfung im Server, keine Client-seitigen Filter als Sicherheitsgrenze |
| Manipulierte IDs | Eingaben per Zod validiert; RLS ignoriert fremde `user_id`s |
| Rate Limiting | DB-basiert (Login, Magic Link, Reset, Einladungen, manueller Sync, Backfill, OAuth) |
| Tokens | AES-256-GCM, Key nur in Env, Tabelle ohne Grants, Redaktion in Logs |
| Webhooks | WHOOP HMAC + Zeitfenster, Google Authorization-Secret + ECDSA-Signatur, Idempotenz-Tabelle |
| Cache | Service Worker cached nur statische Assets; Logout sendet `Clear-Site-Data`; API `no-store` |
| Tracking | keine Analyse- oder Werbetools |
| Export/Löschung | `/api/account/export`, Account-Löschung mit Provider-Widerruf und Cascade |
