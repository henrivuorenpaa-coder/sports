# Sports – henkilökohtainen valmentaja

Valittavia harjoitusohjelmia taekwondon rinnalle. Ensimmäinen ohjelma on "0 → 5 km" (alun perin Askel 5K):
8 viikkoa, 2 (tai 3) juoksua viikossa. Myöhemmin lisätään muita ohjelmia.
Repo: https://github.com/henrivuorenpaa-coder/sports
Käyttöliittymä on suomeksi ja tehty ensisijaisesti puhelimelle (responsiivinen myös desktopille).

## Rakenne

Vite + TypeScript (vanilla, ei UI-kirjastoa), PWA (`vite-plugin-pwa`), Firebase (Auth: sähköposti + salasana, Firestore). Julkaisu Verceliin.

- `index.html` – runko (header, näkymien `<section>`it, alanavigaatio)
- `src/styles.css` – kaikki tyylit (tokenit `:root`issa, tumma teema)
- `src/types.ts` – tietotyypit (`Settings`, `LogEntry`, `Block`, `Session`, `Proposal` …)
- `src/programs/` – ohjelmaluettelo `PROGRAMS` (`index.ts`; ensimmäinen = oletus) ja ohjelmat, esim. `run-0-5k.ts`
  (`PLAN2` / `PLAN3`). Ohjelmalla on `id`, nimi, tavoite (prompt + edistymismittari) ja `variants` juoksukertojen mukaan.
  Uusi ohjelma: uusi tiedosto + lisäys `PROGRAMS`-listaan.
- `src/plan.ts` – lohkojen esitys (lohkot `wu`, `cd`, `walk`, `run`, `iv`, `str`, `test{km}`): `segs`, `totals`, `summary`, `steps`
- `src/schedule.ts` – puhtaat funktiot `Ctx = {settings, logs}` -tilasta:
  `schedule()` (avaimet `s{slot}-{i}`; moves/skips/overrides), `slotMap()` + `repeatPatch()` (viikon toisto siirtää
  myöhempien viikkojen avaimia), `virtualsOn()` (toistuvat treenit, `ruleRef = ruleId@date`), `notesFor()`, `repeatSuggestion()`
- `src/coach.ts` – `coachPrompt()`, `validBlocks()`, `cleanProposals()`
- `src/storage/` – `Store`-rajapinta; `local.ts` (localStorage `askel5k.v3`) ja `firestore.ts` (`users/{uid}/…`)
- `src/lib/firebase*.ts` – Firebase-alustus ympäristömuuttujista (`VITE_FIREBASE_*`, ks. `.env.example`), sähköposti + salasana -kirjautuminen
- `src/main.ts` – UI: renderöinti template-merkkijonoilla, tapahtumat `data-act`/`data-go`-attribuuteilla, sheetit
- `firestore.rules` – vain oma uid saa lukea ja kirjoittaa
- `artifact/askel.html` – alkuperäinen yhden tiedoston Claude-artefakti (https://claude.ai/artifact/B4SPwtV3F9xVkTtpWGGqXT),
  jossa käyttäjän nykyinen data on (artefaktin `db`: `settings/main`, `log/<id>`, `coach/last`)

Tietomalli (sama artefaktissa ja Firestoressa):
- `settings/main` – `programId` (puuttuu → oletusohjelma), aloituspäivä, juoksupäivät, `recurring`, `moves`, `skips`, `overrides`, `repeats`, `dismissed`, `rSkips`, `tkdMin`, `intervals`
- `garmin/…` – Garmin-synkronoinnin tulos (ks. alla)
- `log/<id>` – `{kind: run|tkd|other, date, minutes, rpe?, km?, note, status: done|planned, sessionKey?, programId?, ruleRef?, label?}`
  – ohjelman juoksu tunnistetaan parista `sessionKey` + `programId` (puuttuva `programId` = oletusohjelma)
- `coach/last` – viimeisin valmentajan analyysi ja ehdotukset

localStorage-avain on yhä `askel5k.v3`, jotta vanha data löytyy. Ilman Firebase-ympäristömuuttujia tai kirjautumatta sovellus toimii localStoragella. Kirjautuessa tarjotaan
selaimen tietojen siirtoa tilille. Asetuksissa on JSON-vienti/-tuonti (myös artefaktin datan siirtoon).

## Komennot

- `npm run dev` – kehityspalvelin (http://localhost:5173)
- `npm test` – Vitest (logiikkamoduulien testit `src/**/*.test.ts`)
- `npm run build` – tyyppitarkistus + tuotantobuild `dist/`

## Etenemissuunnitelma

1. ✅ Git + projektirunko (Vite, TS, testit, PWA), ohjelmaluettelo
2. Firebase: projekti, sähköpostikirjautuminen (Email/Password), Firestore, `firestore.rules` käyttöön (`firebase deploy --only firestore:rules`)
3. Vercel: repo kytketään, `VITE_FIREBASE_*` ympäristömuuttujiksi, Vercel-domain Firebase Authin sallittuihin domaineihin
4. Datan siirto artefaktista: luetaan artefaktin db Claude Codessa ArtifactData-työkalulla → JSON → Asetukset → Tuo tiedot
5. Vercel `/api`-funktiot (avaimet ympäristömuuttujina, Firestoreen Admin SDK:lla), yksi kerrallaan:
   - ✅ `api/coach.ts` – Claude API (prompt `coachPrompt()` tehdään selaimessa). Tarkistaa Firebase ID -tokenin
     (jose + Googlen julkiset avaimet; firebase-admin ei toimi Vercelissä (ERR_REQUIRE_ESM)) ja `COACH_ALLOWED_EMAILS`. Env: `ANTHROPIC_API_KEY`, `ALLOWED_EMAILS` (tai vanha `COACH_ALLOWED_EMAILS`).
     Myöhemmin: viikkokatsaus cronilla sunnuntaisin (vaatii palvelutilin Firestore-lukuun).
   - ✅ `api/garmin.ts` – Garmin Connect Personal API (vain lukeva). Avain → 24 h JWT (`POST /personalapitoken-service/…/token`,
     `Authorization: ApiKey …`, vastaus pelkkä token), data `Authorization: Bearer …`. Polut: github.com/garmin/connect-personal-api-python.
     Muunnokset `api/_lib/garmin-lib.ts`. Sovellus kutsuu kirjautuneena (automaattisesti, jos edellisestä hausta > 3 h) ja tallentaa
     Firestoreen `garmin/meta`, `garmin/day-<pvm>`, `garmin/act-<id>` – palvelin ei tarvitse palvelutiliä. Env: `GARMIN_PERSONAL_API_KEY`.
     Client-logiikka `src/garmin.ts`: aktiviteetin laji, ohjelman juoksun osuma (±3 pv), palautumisvinkit, valmentajan prompt.
     Kirjaus Garmin-aktiviteetista tallentaa `garminId`:n.
   - ✅ `api/intervals.ts` – tulevat ohjelman juoksut (14 pv) intervals.icu:n kalenteriin → Garmin Connect → kello.
     Selain muodostaa tapahtumat (`src/intervals.ts`: `workoutText()` intervals.icu-treenitekstinä, `external_id` `sports:{programId}:{key}`),
     palvelin vertaa kalenteriin (`api/_lib/intervals-lib.ts` `diffEvents`) ja lisää/päivittää/poistaa vain `sports:`-tapahtumia.
     Basic-auth `API_KEY:<avain>`. Env: `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`. Ensimmäisen viennin jälkeen
     `settings.intervals.auto` → vienti automaattisesti, kun sisällön tunniste (`sig`) muuttuu.

Periaate: valmentaja ehdottaa, käyttäjä hyväksyy – ohjelma ei muutu automaattisesti.
