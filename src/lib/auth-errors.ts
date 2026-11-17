/** Firebase Authin virhekoodit suomeksi. */
const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Sähköpostiosoite ei ole kelvollinen.",
  "auth/missing-email": "Anna sähköpostiosoite.",
  "auth/missing-password": "Anna salasana.",
  "auth/invalid-credential": "Väärä sähköposti tai salasana.",
  "auth/wrong-password": "Väärä sähköposti tai salasana.",
  "auth/user-not-found": "Väärä sähköposti tai salasana.",
  "auth/email-already-in-use": "Tällä sähköpostilla on jo tunnus. Kirjaudu sisään.",
  "auth/weak-password": "Salasanan pitää olla vähintään 6 merkkiä.",
  "auth/password-does-not-meet-requirements": "Salasana ei täytä vaatimuksia. Kokeile pidempää salasanaa.",
  "auth/too-many-requests": "Liian monta yritystä. Odota hetki ja yritä uudelleen.",
  "auth/network-request-failed": "Ei verkkoyhteyttä. Yritä uudelleen.",
  "auth/operation-not-allowed": "Sähköpostikirjautuminen ei ole käytössä Firebase-projektissa.",
  "auth/user-disabled": "Tämä tunnus on poistettu käytöstä.",
};

export function authErrorText(e: unknown) {
  const code = (e as { code?: string } | null)?.code;
  return (code && MESSAGES[code]) || `Kirjautuminen epäonnistui${code ? ` (${code})` : ""}.`;
}
