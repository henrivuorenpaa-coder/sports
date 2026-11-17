import { addDays, isDate, WD, WDL, WDPL, wd } from "./lib/dates.ts";
import { summary, titleOf, totals } from "./plan.ts";
import { planFor, programOf } from "./programs/index.ts";
import { isDone, schedule, slotMap, status } from "./schedule.ts";
import { garminPromptLines } from "./garmin.ts";
import type { Block, Ctx, GarminData, Proposal } from "./types.ts";

/** Valmentajan prompt. Sama sisältö kulkee myöhemmin Vercelin /api/coach-funktion kautta Claude API:lle. */
export function coachPrompt(c: Ctx, today: string, q: string, garmin: GarminData | null = null) {
  const st = c.settings, map = slotMap(st), P = planFor(st), prog = programOf(st);
  const sch = schedule(c).sort((a, b) => (a.date < b.date ? -1 : 1));
  const runs = sch.filter((s) => s.date >= addDays(today, -21)).slice(0, 14).map((s) => {
    const [, l] = status(s, today);
    return `${s.key} | ${s.date} (${WD[wd(s.date)]}) | ohjelman vk ${s.slot + 1} | ${l}${s.done ? ` (RPE ${s.done.rpe}, ${s.done.minutes} min${s.done.note ? `, "${s.done.note}"` : ""})` : ""} | ${summary(s.blocks)} | ${totals(s.blocks).total} min`;
  }).join("\n");
  const logs = c.logs.filter((l) => l.date >= addDays(today, -28) && !l.sessionKey).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((l) => `${l.date} | ${titleOf(l)} | ${isDone(l) ? "tehty" : "suunniteltu"} | ${l.minutes} min${l.rpe ? ` | RPE ${l.rpe}` : ""}${l.km ? ` | ${l.km} km` : ""}${l.note ? ` | "${l.note}"` : ""}`)
    .join("\n") || "(ei kirjauksia)";
  const rec = (st.recurring || []).filter((r) => !r.until || r.until >= today).map((r) => `${titleOf(r)} ${WDPL[r.weekday]} ${r.minutes} min`).join(", ") || "(ei)";
  const weeks = map.map((b, i) => `vk ${i + 1}: ${P[b].title}`).join("; ");
  return `Olet kokenut, varovainen juoksuvalmentaja. Ohjelma: ${prog.name}. Tavoite: ${prog.goal}. Hän juoksee ${st.runDays.length} kertaa viikossa ja harrastaa lisäksi taekwondoa. Vastaa suomeksi, selkeästi ja lyhyesti.

Tänään: ${today} (${WDL[wd(today)]}). Ohjelma alkoi ${st.startDate}, ${map.length} viikkoa: ${weeks}.

Ohjelman juoksut viimeiset 3 viikkoa ja tulevat (avain | päivä | viikko | tila | rakenne | kesto):
${runs}

Muut kirjaukset 28 pv (päivä | laji | tila | kesto | RPE | matka | muistiinpano):
${logs}

Toistuvat treenit: ${rec}
${garminPromptLines(garmin, today)}
${q ? `\nValmennettavan kysymys tai viesti: """${q}"""\n` : ""}
Tehtävä: analysoi miten harjoittelu sujuu (toteutuminen, rasittavuus, taekwondon kuormitus ja palautuminen) ja ehdota tarvittaessa muutoksia tuleviin juoksuihin (tila "Tänään" tai tuleva päivä). Ole maltillinen: älä kasvata juoksun kokonaismäärää yli 15 % viikossa, pidä kevyet juoksut kevyinä ja vältä kovaa juoksua kovaa taekwondoa seuraavana päivänä. Jos kaikki on kunnossa, älä ehdota muutoksia.

Vastaa VAIN JSON-objektina tässä muodossa:
{"analysis": "2–4 lyhyttä kappaletta tavallista tekstiä, kappaleet erotettu rivinvaihdolla, ei markdownia",
 "proposals": [
  {"type":"replace","key":"s2-0","blocks":[{"k":"wu","m":5},{"k":"iv","rep":5,"run":2,"walk":1.5},{"k":"cd","m":5}],"reason":"lyhyt perustelu"},
  {"type":"move","key":"s1-1","date":"YYYY-MM-DD","reason":"..."},
  {"type":"skip","key":"s1-1","reason":"..."},
  {"type":"repeat_week","week":2,"reason":"..."}
 ]}
Lohkotyypit: wu = alkukävely (m min), cd = loppukävely (m min), walk = kävely (m), run = yhtäjaksoinen juoksu (m), iv = toistot (rep kertaa: run min juoksua + walk min kävelyä). Minuutit voivat olla desimaaleja (1.5 = 1:30). Enintään 3 ehdotusta; tyhjä lista, jos muutoksia ei tarvita. Käytä vain yllä listattuja avaimia.`;
}

/** Tarkistaa mallin ehdottamat lohkot. Palauttaa null, jos jokin lohko on virheellinen. Minuutit pyöristetään 15 s:iin. */
export function validBlocks(bl: unknown): Block[] | null {
  if (!Array.isArray(bl) || !bl.length || bl.length > 8) return null;
  const num = (v: unknown, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 4) / 4 : null;
  };
  const out: Block[] = [];
  for (const b of bl) {
    if (!b || typeof b !== "object") return null;
    if (["wu", "cd", "walk", "run"].includes(b.k)) {
      const m = num(b.m, 0.25, 60);
      if (m === null) return null;
      out.push({ k: b.k, m });
    } else if (b.k === "iv") {
      const rep = Math.round(Number(b.rep)), run = num(b.run, 0.25, 30), w = num(b.walk, 0.25, 5);
      if (!(rep >= 1 && rep <= 20) || run === null || w === null) return null;
      out.push({ k: "iv", rep, run, walk: w });
    } else return null;
  }
  return out;
}

/** Suodattaa mallin ehdotukset: vain olemassa olevat, tulevat ja tekemättömät juoksut, enintään 3. */
export function cleanProposals(c: Ctx, list: unknown, today: string): Proposal[] {
  const sch = schedule(c), map = slotMap(c.settings), out: Proposal[] = [];
  for (const p of (Array.isArray(list) ? list : []).slice(0, 3)) {
    if (!p || typeof p !== "object") continue;
    const reason = String(p.reason || "").slice(0, 300);
    if (p.type === "repeat_week") {
      const w = Math.round(Number(p.week));
      if (w >= 1 && w <= map.length) out.push({ type: "repeat_week", week: w, reason });
      continue;
    }
    const s = sch.find((x) => x.key === p.key);
    if (!s || s.done || s.date < today) continue;
    if (p.type === "replace") {
      const bl = validBlocks(p.blocks);
      if (bl) out.push({ type: "replace", key: s.key, blocks: bl, reason });
    } else if (p.type === "move" && isDate(p.date) && p.date >= today) out.push({ type: "move", key: s.key, date: p.date, reason });
    else if (p.type === "skip") out.push({ type: "skip", key: s.key, reason });
  }
  return out;
}
