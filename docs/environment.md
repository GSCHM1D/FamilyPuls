# Environment Variables

Öffentlich (`NEXT_PUBLIC_*`) = landet im Browser-Bundle, darf **kein** Geheimnis sein. Alles andere nur serverseitig.
Lokal: `.env.local` (durch `.gitignore` ausgeschlossen). Produktion: Vercel → Project → Settings → Environment Variables
(für „Production“ und ggf. „Preview“). Prüfen mit `npm run check:env` (zeigt nur Namen).

| Variable | Öffentlich | Woher | Hinweis |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ja | eigene URL, z. B. `https://familypulse.vercel.app` | ohne `/` am Ende |
| `NEXT_PUBLIC_SUPABASE_URL` | ja | Supabase → Project Settings → API | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ja | Supabase → API Keys → Publishable key (`sb_publishable_…`) | Daten werden durch RLS geschützt |
| `NEXT_PUBLIC_DEMO_MODE` | ja | `true`/`false` | `true` = nur synthetische Daten |
| `SUPABASE_SERVICE_ROLE_KEY` | **nein** | Supabase → API Keys → Secret key (`sb_secret_…`) | umgeht RLS – nur Server |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | **nein** | WHOOP Developer Dashboard | Secret prüft auch Webhooks |
| `WHOOP_REDIRECT_URI` | nein | `<APP_URL>/api/whoop/callback` | exakt wie im Dashboard |
| `GOOGLE_HEALTH_CLIENT_ID` / `GOOGLE_HEALTH_CLIENT_SECRET` | **nein** | Google Cloud → Anmeldedaten | |
| `GOOGLE_HEALTH_REDIRECT_URI` | nein | `<APP_URL>/api/google-health/callback` | |
| `GOOGLE_HEALTH_WEBHOOK_AUTHORIZATION` | **nein** | `npm run generate:key` | Format `Bearer <zufall>`, identisch beim Subscriber |
| `TOKEN_ENCRYPTION_KEY` | **nein** | `npm run generate:key` | 32 Byte Base64, AES-256-GCM für OAuth-Tokens |
| `TOKEN_ENCRYPTION_KEY_PREVIOUS` | **nein** | alter Schlüssel bei Rotation | nur Entschlüsselung |
| `CRON_SECRET` | **nein** | `npm run generate:key` | Vercel sendet ihn automatisch als Bearer an Cron-Routen |

**Schlüsselverwaltung:** Der Encryption Key liegt ausschliesslich in Vercel (verschlüsselt gespeichert), nie in der
Datenbank. Ein DB-Leak allein gibt daher keine Tokens preis. Rotation: neuen Key setzen, alten als
`TOKEN_ENCRYPTION_KEY_PREVIOUS`; Tokens werden beim nächsten Refresh mit dem neuen Key gespeichert.
