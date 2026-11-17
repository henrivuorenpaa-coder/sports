# Askel 5K – henkilökohtainen juoksuvalmentaja

Paluu juoksuun: 8 viikon ohjelma 0 → 5 km, 2 (tai 3) juoksua viikossa taekwondon rinnalla.
Käyttöliittymä on suomeksi ja tehty ensisijaisesti puhelimelle (responsiivinen myös desktopille).

## Rakenne

Vite + TypeScript (vanilla, ei UI-kirjastoa), PWA (`vite-plugin-pwa`), Firebase (Auth + Firestore). Julkaisu Verceliin.

- `index.html` – runko (header, näkymien `<section>`it, alanavigaatio)
- `src/styles.css` – kaikki tyylit (tokenit `:root`issa, tumma teema)
- `src/types.ts` – tietotyypit (`Settings`, `LogEntry`, `Block`, `Session`, `Proposal` …)
- `src/plan.ts` – `PLAN2` / `PLAN3` (lohkot `wu`, `cd`, `walk`, `run`, `iv`, `str`, `test`), `segs`, `totals`, `summary`, `steps`
- `src/schedule.ts` – puhtaat funktiot `Ctx = {settings, logs}` -tilasta:
  `schedule()` (avaimet `s{slot}-{i}`; moves/skips/overrides), `slotMap()` + `repeatPatch()` (viikon toisto siirtää
  myöhempien viikkojen avaimia), `virtualsOn()` (toistuvat treenit, `ruleRef = ruleId@date`), `notesFor()`, `repeatSuggestion()`
- `src/coach.ts` – `coachPrompt()`, `validBlocks()`, `cleanProposals()`
- `src/storage/` – `Store`-rajapinta; `local.ts` (localStorage `askel5k.v3`) ja `firestore.ts` (`users/{uid}/…`)
- `src/lib/firebase*.ts` – Firebase-alustus ympäristömuuttujista (`VITE_FIREBASE_*`, ks. `.env.example`), Google-kirjautuminen
- `src/main.ts` – UI: renderöinti template-merkkijonoilla, tapahtumat `data-act`/`data-go`-attribuuteilla, sheetit
- `firestore.rules` – vain oma uid saa lukea ja kirjoittaa
- `artifact/askel.html` – alkuperäinen yhden tiedoston Claude-artefakti (https://claude.ai/artifact/B4SPwtV3F9xVkTtpWGGqXT),
  jossa käyttäjän nykyinen data on (artefaktin `db`: `settings/main`, `log/<id>`, `coach/last`)

Tietomalli (sama artefaktissa ja Firestoressa):
- `settings/main` – aloituspäivä, juoksupäivät, `recurring`, `moves`, `skips`, `overrides`, `repeats`, `dismissed`, `rSkips`, `tkdMin`
- `log/<id>` – `{kind: run|tkd|other, date, minutes, rpe?, km?, note, status: done|planned, sessionKey?, ruleRef?, label?}`
- `coach/last` – viimeisin valmentajan analyysi ja ehdotukset

Ilman Firebase-ympäristömuuttujia tai kirjautumatta sovellus toimii localStoragella. Kirjautuessa tarjotaan
selaimen tietojen siirtoa tilille. Asetuksissa on JSON-vienti/-tuonti (myös artefaktin datan siirtoon).

## Komennot

- `npm run dev` – kehityspalvelin (http://localhost:5173)
- `npm test` – Vitest (logiikkamoduulien testit `src/**/*.test.ts`)
- `npm run build` – tyyppitarkistus + tuotantobuild `dist/`

## Etenemissuunnitelma

1. ✅ Git + projektirunko (Vite, TS, testit, PWA)
2. Firebase: projekti, Google-kirjautuminen, Firestore, `firestore.rules` käyttöön (`firebase deploy --only firestore:rules`)
3. Vercel: repo kytketään, `VITE_FIREBASE_*` ympäristömuuttujiksi, Vercel-domain Firebase Authin sallittuihin domaineihin
4. Datan siirto artefaktista: luetaan artefaktin db Claude Codessa ArtifactData-työkalulla → JSON → Asetukset → Tuo tiedot
5. Vercel `/api`-funktiot (avaimet ympäristömuuttujina, Firestoreen Admin SDK:lla), yksi kerrallaan:
   - `coach` – Claude API (prompt `coachPrompt()`), kytketään `main.ts`:n `askCoach`-funktioon; viikkokatsaus cronilla sunnuntaisin
   - `garmin-sync` – Garmin Connect Personal API (lukeva; avain → 24 h access token), Vercel Cron kerran päivässä.
     Tarkista endpointit Swaggerista: https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
   - `intervals-push` – hyväksytyt/muuttuneet treenit intervals.icu:n kalenteriin → Garmin-kello

Periaate: valmentaja ehdottaa, käyttäjä hyväksyy – ohjelma ei muutu automaattisesti.
