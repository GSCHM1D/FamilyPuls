import Link from "next/link";

export const metadata = { title: "Datenschutz / Privacy" };
export const dynamic = "force-static";

/** Public privacy notice (required by WHOOP and Google for OAuth apps). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-safe py-12 text-sm leading-relaxed">
      <h1 className="mb-6 text-2xl font-semibold">Datenschutzerklärung FamilyPulse</h1>
      <p className="mb-4 text-muted-foreground">Stand: November 2026</p>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Zweck</h2>
      <p>
        FamilyPulse ist eine private, nicht-kommerzielle Web-App für eine einzelne Familie. Sie ist nur für eingeladene
        Familienmitglieder zugänglich und dient dazu, Gesundheits-, Schlaf-, Erholungs- und Aktivitätsdaten der eigenen
        Fitness-Tracker (WHOOP, Fitbit über die Google Health API) anzuzeigen und – nur mit ausdrücklicher Freigabe – innerhalb der Familie zu teilen.
      </p>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Welche Daten</h2>
      <p>
        Kontodaten (E-Mail, Anzeigename, optionales Profilbild) sowie die Gesundheits- und Fitnessdaten, für die das Mitglied
        dem jeweiligen Anbieter Lesezugriff erteilt hat (z. B. Schlaf, Erholung, Herzfrequenz, HRV, Schritte, Trainings).
        Es werden nur Lese-Berechtigungen angefordert. OAuth-Tokens werden verschlüsselt gespeichert.
      </p>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Weitergabe</h2>
      <p>
        FamilyPulse zeigt die von dir freigegebenen Gesundheits- und Fitnessdaten den Mitgliedern deiner Familiengruppe an.
        Standardmässig ist nichts freigegeben; Freigaben können jederzeit pro Kategorie widerrufen werden. Die Verbindung
        eines Trackers allein ist keine Freigabe. Daten werden nicht verkauft, nicht für Werbung verwendet und an keine
        weiteren Dritten weitergegeben. Es werden keine Analyse- oder Werbetools eingesetzt.
      </p>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Speicherung</h2>
      <p>
        Hosting: Vercel (Anwendung) und Supabase (Datenbank, EU-Region). Übertragung ausschliesslich verschlüsselt (HTTPS).
        Auf dem Gerät werden keine Gesundheitsdaten zwischengespeichert.
      </p>
      <h2 className="mt-6 mb-2 text-lg font-semibold">Deine Rechte</h2>
      <p>
        In den Einstellungen kannst du deine Daten jederzeit exportieren, Tracker-Verbindungen trennen (der Zugriff wird beim
        Anbieter widerrufen) und dein Konto inklusive aller Daten vollständig löschen. Für Fragen wende dich an den
        Administrator deiner Familiengruppe.
      </p>
      <hr className="my-8 border-border" />
      <h2 className="mb-2 text-lg font-semibold">Privacy notice (English summary)</h2>
      <p>
        FamilyPulse is a private, invitation-only app for one family. It reads health and fitness data from WHOOP and Google
        Health (read-only) for the signed-in member and shows it to family members only for the categories that member has
        explicitly chosen to share. Data is never sold, used for advertising or shared with other third parties. Members can
        export their data, disconnect trackers (access is revoked at the provider) and delete their account at any time.
      </p>
      <p className="mt-8"><Link href="/login" className="text-primary">FamilyPulse</Link></p>
    </main>
  );
}
