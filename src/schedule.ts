import { addDays, cap, diffDays, fiLong, mondayOf, WDESS, wd } from "./lib/dates.ts";
import { DEFAULT_PROGRAM_ID, planFor, programIdOf } from "./programs/index.ts";
import type { Ctx, LogEntry, NoteKind, Rule, Session, Settings, Virtual } from "./types.ts";

export function defaultSettings(today: string): Settings {
  const runDays = [2, 5];
  const start = wd(today) <= runDays[0] ? mondayOf(today) : addDays(mondayOf(today), 7);
  return {
    programId: DEFAULT_PROGRAM_ID, startDate: start, runDays, tkdMin: 75, repeats: [], dismissed: [], moves: {}, skips: {}, overrides: {}, rSkips: [],
    recurring: [1, 3].map((d) => ({ id: `tkd-${d}`, kind: "tkd", weekday: d, minutes: 75, from: mondayOf(today) })),
  };
}

export const isDone = (l: LogEntry) => l.status !== "planned";

/** Ohjelman viikkopaikat → pohjaviikon indeksi. Toistettu viikko tulee heti alkuperäisen perään. */
export function slotMap(st: Settings): number[] {
  const m: number[] = [];
  const reps = st.repeats || [];
  planFor(st).forEach((_, b) => {
    m.push(b);
    reps.filter((r) => r === b).forEach(() => m.push(b));
  });
  return m;
}

/** Kaikki ohjelman juoksut päivämäärineen. Avain `s{slot}-{i}` on pysyvä siirroille, ohituksille ja muokkauksille. */
export function schedule({ settings: st, logs }: Ctx): Session[] {
  const P = planFor(st), pid = programIdOf(st), map = slotMap(st), days = [...st.runDays].sort((a, b) => a - b), out: Session[] = [];
  const moves = st.moves || {}, skips = st.skips || {}, ov = st.overrides || {};
  map.forEach((b, slot) => days.forEach((d, i) => {
    const key = `s${slot}-${i}`, orig = addDays(st.startDate, slot * 7 + d);
    out.push({
      key, slot, base: b, idx: i, orig, date: moves[key] || orig, moved: !!moves[key],
      blocks: ov[key] || P[b].s[i], adjusted: !!ov[key], name: `Juoksu ${i + 1}`, skipped: !!skips[key],
      done: logs.find((l) => l.sessionKey === key && programIdOf(l) === pid && isDone(l)),
    });
  }));
  return out;
}

export const ruleActive = (r: Rule, d: string) => r.weekday === wd(d) && d >= (r.from || "0000") && (!r.until || d <= r.until);

/** Toistuvat treenit, joita ei ole vielä kirjattu, siirretty tai ohitettu. */
export function virtualsOn({ settings: st, logs }: Ctx, d: string): Virtual[] {
  const sk = st.rSkips || [];
  return (st.recurring || [])
    .filter((r) => ruleActive(r, d))
    .map((r) => ({ ...r, ref: `${r.id}@${d}`, date: d }))
    .filter((v) => !sk.includes(v.ref) && !logs.some((l) => l.ruleRef === v.ref));
}

export const eventsOn = (c: Ctx, date: string) => c.logs.filter((l) => l.date === date && !l.sessionKey);
export const tkdDoneOn = (c: Ctx, date: string) => c.logs.filter((l) => l.kind === "tkd" && l.date === date && isDone(l));
export const tkdPlannedOn = (c: Ctx, date: string) =>
  virtualsOn(c, date).some((v) => v.kind === "tkd") || c.logs.some((l) => l.kind === "tkd" && l.date === date && !isDone(l));

export type StatusKind = "done" | "skipped" | "today" | "missed" | "moved" | "up";
export function status(s: Session, today: string): [StatusKind, string] {
  if (s.done) return ["done", "Tehty"];
  if (s.skipped) return ["skipped", "Ohitettu"];
  if (s.date === today) return ["today", "Tänään"];
  if (s.date < today) return ["missed", "Väliin"];
  return [s.moved ? "moved" : "up", fiLong(s.date)];
}

/** Taekwondo- ja RPE-pohjaiset vinkit juoksulle. Palauttaa [luokka, HTML] – teksti ei sisällä käyttäjän syötettä. */
export function notesFor(c: Ctx, s: Session, today: string): [NoteKind, string][] {
  const notes: [NoteKind, string][] = [];
  const prev = addDays(s.date, -1);
  if (tkdDoneOn(c, s.date).length)
    notes.push(["tkd", `<b>Taekwondo samana päivänä.</b> Juokse kevyesti ennen treeniä tai siirrä juoksu toiselle päivälle.`]);
  else if (tkdPlannedOn(c, s.date) && s.date >= today)
    notes.push(["tkd", `<b>${cap(WDESS[wd(s.date)])} on myös taekwondo.</b> Juokse ensin ja rauhallisesti, tai siirrä juoksu kalenterissa.`]);
  const hard = tkdDoneOn(c, prev).find((l) => (l.rpe || 0) >= 7);
  if (hard)
    notes.push(["warn", `<b>Edellisenä päivänä raskas taekwondo (RPE ${hard.rpe}/10).</b> Jos jalat ovat jumissa, kävele viimeinen juoksupätkä tai lisää jokaiseen taukoon 30 s.`]);
  else if (!tkdDoneOn(c, prev).length && tkdPlannedOn(c, prev) && prev >= today)
    notes.push(["tkd", `Edellisenä päivänä on taekwondo. Pidä tämä juoksu keskustelutahtisena.`]);
  const runs = c.logs.filter((l) => l.kind === "run" && isDone(l) && l.date < s.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (runs[0] && (runs[0].rpe || 0) >= 8)
    notes.push(["warn", `<b>Edellinen juoksu tuntui raskaalta (RPE ${runs[0].rpe}).</b> Hidasta selvästi – oikea tahti tuntuu lähes liian helpolta.`]);
  else if (runs.length >= 3 && runs.slice(0, 3).every((r) => (r.rpe || 10) <= 4))
    notes.push(["ok", `Kolme viimeistä juoksua tuntuivat kevyiltä. Hyvä merkki – pysy silti ohjelmassa, jänteet sopeutuvat hitaammin kuin kunto.`]);
  if (s.adjusted) notes.push(["ok", `Valmentaja on muokannut tätä treeniä.`]);
  return notes;
}

/** Ehdottaa edellisen viikon toistoa, jos siitä jäi väliin useampi kuin yksi juoksu eikä tällä viikolla ole vielä juostu. */
export function repeatSuggestion(c: Ctx, today: string) {
  const st = c.settings, map = slotMap(st), n = st.runDays.length;
  const cur = Math.floor(diffDays(st.startDate, today) / 7);
  if (cur < 1 || cur >= map.length || (st.dismissed || []).includes(cur - 1)) return null;
  const sch = schedule(c);
  const prevDone = sch.filter((s) => s.slot === cur - 1 && s.done).length;
  const curDone = sch.filter((s) => s.slot === cur && s.done).length;
  if (prevDone >= n - 1 || curDone > 0) return null;
  return { slot: cur - 1, base: map[cur - 1], prevDone, n };
}

/** Viikon toisto lisää viikon heti saman viikon perään: myöhempien viikkojen avaimet siirtyvät yhdellä. */
export function repeatPatch(st: Settings, base: number): Partial<Settings> {
  const at = slotMap(st).lastIndexOf(base) + 1;
  const shift = <T>(obj: Record<string, T> | undefined): Record<string, T> =>
    Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => {
      const m = /^s(\d+)-(\d+)$/.exec(k);
      return m && +m[1] >= at ? [`s${+m[1] + 1}-${m[2]}`, v] : [k, v];
    }));
  return { repeats: [...(st.repeats || []), base], moves: shift(st.moves), skips: shift(st.skips), overrides: shift(st.overrides) };
}
