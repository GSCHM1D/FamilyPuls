# WHOOP Developer App einrichten

Eine **einzige** WHOOP-App (Client-ID/Secret) dient allen drei WHOOP-Mitgliedern. Jedes Mitglied autorisiert
sich **einzeln** über OAuth – FamilyPulse speichert pro Person eigene, verschlüsselte Tokens. Es gibt keinen
gemeinsamen Token.

1. https://developer-dashboard.whoop.com mit einem WHOOP-Konto anmelden → **Create App**.
2. Name `FamilyPulse`, Kontakt-E-Mail, Privacy-Policy-URL eintragen.
3. Scopes: `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement` (und `offline`).
4. **Redirect URLs**:
   - `http://localhost:3000/api/whoop/callback`
   - `https://<deine-app>.vercel.app/api/whoop/callback`
5. **Webhook URL** (nach dem Deployment): `https://<deine-app>.vercel.app/api/webhooks/whoop`, Model Version **v2**.
6. Client-ID → `WHOOP_CLIENT_ID`, Client-Secret → `WHOOP_CLIENT_SECRET` (wird auch zur Prüfung der Webhook-Signatur verwendet),
   Redirect-URI → `WHOOP_REDIRECT_URI`. Nur in `.env.local` bzw. Vercel eintragen.
7. Die App startet im **Sandbox-Tier (bis 10 Mitglieder)** – für 3 Personen ist kein Freigabeantrag nötig.

## Erster echter Test
Variante A: In FamilyPulse → Einstellungen → „WHOOP verbinden“. Danach läuft der 30-Tage-Import im Hintergrund.

Variante B (nur Feldstruktur, ohne Werte): Access-Token aus einem eigenen OAuth-Durchlauf (z. B. Postman-Anleitung der
WHOOP-Doku) im eigenen Terminal setzen:
```bash
WHOOP_ACCESS_TOKEN='…' npm run probe:whoop
```
