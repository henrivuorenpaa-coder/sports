import { addDays, diffDays } from "./lib/dates.ts";
import { schedule } from "./schedule.ts";
import type { Ctx, GarminActivity, GarminData, GarminDay, Kind, LogEntry, NoteKind, Session } from "./types.ts";

/** Garminin aktiviteettityyppi → sovelluksen laji. */
export function activityKind(type: string): Kind {
  if (/running/.test(type)) return "run";
  if (/martial|taekwondo|boxing|karate|judo/.test(type)) return "tkd";
  return "other";
}

const TYPE_FI: Record<string, string> = {
  running: "Juoksu", treadmill_running: "Juoksumatto", trail_running: "Polkujuoksu", track_running: "Ratajuoksu",
  mixed_martial_arts: "Kamppailulaji", walking: "Kävely", hiking: "Vaellus", cycling: "Pyöräily", golf: "Golf",
  strength_training: "Voimaharjoittelu", indoor_cycling: "Sisäpyöräily", swimming: "Uinti", lap_swimming: "Uinti",
};
export const activityLabel = (a: GarminActivity) => TYPE_FI[a.type] || a.name || a.type;

export const loggedGarminIds = (logs: LogEntry[]) => new Set(logs.map((l) => l.garminId).filter(Boolean) as string[]);

/** Lähin tekemätön, ohittamaton ohjelman juoksu ±3 päivän sisällä juoksuaktiviteetista. */
export function matchSession(c: Ctx, a: GarminActivity): Session | null {
  if (activityKind(a.type) !== "run") return null;
  const cands = schedule(c).filter((s) => !s.done && !s.skipped && Math.abs(diffDays(a.date, s.date)) <= 3);
  cands.sort((x, y) => Math.abs(diffDays(a.date, x.date)) - Math.abs(diffDays(a.date, y.date)));
  return cands[0] ?? null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** Viimeisin päivä, jolta on palautumisdataa, enintään `date`. */
export function latestDay(g: GarminData, date: string): GarminDay | undefined {
  return [...g.days].reverse().find((d) => d.date <= date && (d.hrv || d.restingHr || d.sleepH));
}

/** Leposykkeen 7 päivän keskiarvo ennen päivää `date`. */
export function restingBaseline(g: GarminData, date: string) {
  const from = addDays(date, -7);
  return avg(g.days.filter((d) => d.date >= from && d.date < date && d.restingHr).map((d) => d.restingHr!));
}

/** Palautumisvinkit tämän päivän treeniin. Palauttaa [luokka, HTML] – vain numeroita, ei käyttäjän syötettä. */
export function recoveryNotes(g: GarminData, today: string): [NoteKind, string][] {
  const d = latestDay(g, today);
  if (!d || diffDays(d.date, today) > 1) return [];
  const notes: [NoteKind, string][] = [];
  const base = restingBaseline(g, d.date);
  const hrvLow = d.hrv && d.hrvBase && d.hrv < d.hrvBase[0];
  const rhrHigh = d.restingHr && base && d.restingHr >= base + 5;
  if (hrvLow && rhrHigh)
    notes.push(["warn", `<b>Palautuminen kesken:</b> HRV ${d.hrv} ms (normaali ${d.hrvBase![0]}–${d.hrvBase![1]}) ja leposyke ${d.restingHr} (tavallisesti ~${Math.round(base!)}). Tee tänään lyhyempi tai kevyempi treeni, tai siirrä juoksu.`]);
  else if (hrvLow)
    notes.push(["warn", `<b>HRV normaalia matalampi</b> (${d.hrv} ms, normaali ${d.hrvBase![0]}–${d.hrvBase![1]}). Pidä juoksu erityisen kevyenä.`]);
  else if (rhrHigh)
    notes.push(["warn", `<b>Leposyke koholla</b> (${d.restingHr}, tavallisesti ~${Math.round(base!)}). Jos olo on väsynyt, kevennä tai siirrä juoksua.`]);
  if (d.sleepH !== undefined && d.sleepH < 6 && d.date === today)
    notes.push(["warn", `Yöuni jäi lyhyeksi (${String(d.sleepH).replace(".", ",")} h). Lyhennä juoksua tarvittaessa.`]);
  return notes;
}

/** Valmentajan promptiin lisättävä Garmin-osuus. */
export function garminPromptLines(g: GarminData | null, today: string) {
  if (!g || !g.syncedAt) return "Garmin-data: ei yhdistetty (ei sykettä, HRV:tä tai unta käytettävissä). Arvioi RPE:n, muistiinpanojen ja määrien perusteella.";
  const days = g.days.filter((d) => d.date >= addDays(today, -10) && d.date <= today)
    .map((d) => `${d.date} | leposyke ${d.restingHr ?? "–"} | HRV ${d.hrv ?? "–"}${d.hrvBase ? ` (normaali ${d.hrvBase[0]}–${d.hrvBase[1]}, ${d.hrvStatus ?? ""})` : ""} | uni ${d.sleepH ?? "–"} h${d.sleepScore ? ` (pisteet ${d.sleepScore})` : ""} | Body Battery max ${d.bbMax ?? "–"} | stressi ${d.stress ?? "–"}`)
    .join("\n") || "(ei päiviä)";
  const acts = g.activities.filter((a) => a.date >= addDays(today, -28)).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((a) => `${a.date} ${a.time} | ${activityLabel(a)} | ${a.minutes} min${a.km ? ` | ${a.km} km` : ""}${a.avgHr ? ` | keskisyke ${a.avgHr}` : ""}${a.maxHr ? ` / max ${a.maxHr}` : ""}${a.te ? ` | aerobinen TE ${a.te}` : ""}`)
    .join("\n") || "(ei aktiviteetteja)";
  const zones = g.zones ? `Sykealueiden alarajat (Z1–Z5): ${g.zones.floors.join(", ")}${g.zones.max ? `, maksimi ${g.zones.max}` : ""}. Kevyen juoksun tavoite on alueilla 1–2.` : "";
  return `Garmin-data (synkronoitu ${g.syncedAt.slice(0, 10)}):
Palautuminen päivittäin (päivä | leposyke | HRV yön ka. ms | uni | Body Battery | stressi):
${days}
Garmin-aktiviteetit 28 pv (päivä | laji | kesto | matka | syke | harjoitusvaikutus):
${acts}
${zones}
Huomioi palautumisdata: matala HRV normaalihaarukkaan nähden tai selvästi koholla oleva leposyke viittaa keskeneräiseen palautumiseen. Vertaa juoksujen keskisykettä sykealueisiin.`;
}
