import { addDays } from "./lib/dates.ts";
import { kindOf, summary, totals } from "./plan.ts";
import { programIdOf, programOf } from "./programs/index.ts";
import { schedule } from "./schedule.ts";
import type { Block, Ctx } from "./types.ts";

/** Montako päivää eteenpäin treenit viedään intervals.icu:n kalenteriin. */
export const INTERVALS_DAYS = 14;
/** Sportsin luomien tapahtumien tunniste intervals.icu:ssa (external_id:n etuliite). */
export const EXT_PREFIX = "sports:";

export interface IcuEvent {
  external_id: string;
  start_date_local: string;
  name: string;
  description: string;
  moving_time: number;
}

/** Kesto intervals.icu-muodossa: 1.5 → "1m30s", 0.333 → "20s", 5 → "5m". */
export function icuDur(min: number) {
  const s = Math.round(min * 60), m = Math.floor(s / 60), r = s % 60;
  return m && r ? `${m}m${r}s` : m ? `${m}m` : `${r}s`;
}

/**
 * Lohkot intervals.icu:n treenitekstiksi. Rivit "- <vihje> <kesto>" ovat vaiheita, "Nx" toistaa seuraavat vaiheet.
 * Vihjeteksti näkyy kellossa vaiheen nimenä. Tavoitesykettä ei aseteta: tahti on "pystyt puhumaan".
 */
export function workoutText(blocks: Block[]) {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.k) {
      case "wu": parts.push(`Alkulämmittely\n- Reipas kävely ${icuDur(b.m)}`); break;
      case "cd": parts.push(`Loppuverryttely\n- Kävely ${icuDur(b.m)}`); break;
      case "walk": parts.push(`- Kävely ${icuDur(b.m)}`); break;
      case "run": parts.push(`- Juoksu keskustelutahtia ${icuDur(b.m)}`); break;
      case "test": parts.push(`- Juoksu omaan tahtiin ${b.km ?? 5}km`); break;
      case "iv":
      case "str": {
        const run = b.k === "str" ? `- Reipas veto ${icuDur(b.run)}` : `- Juoksu ${icuDur(b.run)}`;
        const walk = `- Kävely ${icuDur(b.walk)}`;
        parts.push(b.rep > 1 ? `${b.rep}x\n${run}\n${walk}` : `${run}\n${walk}`);
        break;
      }
    }
  }
  return parts.join("\n\n");
}

/** Ohjelman tulevat, tekemättömät ja ohittamattomat juoksut ikkunassa [today, today + days). */
export function intervalsEvents(c: Ctx, today: string, days = INTERVALS_DAYS) {
  const end = addDays(today, days), pid = programIdOf(c.settings), prog = programOf(c.settings);
  const inWindow = schedule(c).filter((s) => s.date >= today && s.date < end);
  const events: IcuEvent[] = inWindow.filter((s) => !s.done && !s.skipped).map((s) => ({
    external_id: `${EXT_PREFIX}${pid}:${s.key}`,
    start_date_local: `${s.date}T00:00:00`,
    name: `${prog.name} · ${kindOf(s.blocks)}`,
    description: `${summary(s.blocks)}. Tahti: niin hidas, että pystyt puhumaan.\n\n${workoutText(s.blocks)}`,
    moving_time: totals(s.blocks).total * 60,
  }));
  // Tehdyt juoksut jätetään kalenteriin, vaikka ne eivät enää ole "tulevia".
  const keep = inWindow.filter((s) => s.done).map((s) => `${EXT_PREFIX}${pid}:${s.key}`);
  return { oldest: today, newest: addDays(end, -1), events, keep };
}

/** Tunniste, jolla havaitaan, onko vietävä sisältö muuttunut edellisestä viennistä. */
export function eventsSignature(x: ReturnType<typeof intervalsEvents>) {
  const s = JSON.stringify([x.oldest, x.events.map((e) => [e.external_id, e.start_date_local, e.description])]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
