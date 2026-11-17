/** intervals.icu API: https://intervals.icu/api-docs.html – Basic-auth, käyttäjä "API_KEY", salasana = avain. */
export const ICU_BASE = "https://intervals.icu/api/v1";
export const EXT_PREFIX = "sports:";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface WantedEvent { external_id: string; start_date_local: string; name: string; description: string; moving_time: number }
export interface ExistingEvent { id: number | string; external_id?: string | null; start_date_local?: string; name?: string; description?: string | null }
export interface PushBody { oldest: string; newest: string; events: WantedEvent[]; keep: string[] }

const str = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;

/** Tarkistaa selaimen lähettämän rungon. Palauttaa null, jos jokin on pielessä. */
export function parsePushBody(b: unknown): PushBody | null {
  const x = b as Partial<PushBody> | null;
  if (!x || !str(x.oldest, 10) || !str(x.newest, 10) || !DATE.test(x.oldest!) || !DATE.test(x.newest!) || x.oldest! > x.newest!) return null;
  if (!Array.isArray(x.events) || x.events.length > 60 || !Array.isArray(x.keep ?? []) || (x.keep ?? []).length > 60) return null;
  for (const e of x.events) {
    if (!e || !str(e.external_id, 120) || !e.external_id.startsWith(EXT_PREFIX) || !str(e.name, 200) || !str(e.description, 4000)) return null;
    if (!str(e.start_date_local, 19) || !DATE.test(e.start_date_local.slice(0, 10))) return null;
    const d = e.start_date_local.slice(0, 10);
    if (d < x.oldest! || d > x.newest!) return null;
    if (!Number.isFinite(e.moving_time) || e.moving_time < 0 || e.moving_time > 6 * 3600) return null;
  }
  if (!(x.keep ?? []).every((k) => str(k, 120))) return null;
  return {
    oldest: x.oldest!, newest: x.newest!,
    events: x.events.map((e) => ({ external_id: e.external_id, start_date_local: e.start_date_local, name: e.name, description: e.description, moving_time: Math.round(e.moving_time) })),
    keep: x.keep ?? [],
  };
}

/**
 * Vertaa haluttuja treenejä kalenterissa oleviin. Vain Sportsin luomiin (external_id alkaa "sports:") kosketaan.
 * - create: puuttuvat
 * - update: sama external_id, mutta päivä, nimi tai kuvaus muuttunut (päivitetään id:n mukaan)
 * - remove: Sportsin tapahtumat, joita ei enää haluta (ellei `keep` – esim. jo tehdyt)
 */
export function diffEvents(wanted: WantedEvent[], existing: ExistingEvent[], keep: string[]) {
  const ours = existing.filter((e) => e.external_id?.startsWith(EXT_PREFIX));
  const byExt = new Map<string, ExistingEvent>();
  const dupes: ExistingEvent[] = [];
  for (const e of ours) {
    if (byExt.has(e.external_id!)) dupes.push(e);
    else byExt.set(e.external_id!, e);
  }
  const want = new Set(wanted.map((w) => w.external_id)), keepSet = new Set(keep);
  const create: WantedEvent[] = [], update: { id: ExistingEvent["id"]; ev: WantedEvent }[] = [];
  let unchanged = 0;
  for (const w of wanted) {
    const e = byExt.get(w.external_id);
    if (!e) create.push(w);
    else if ((e.start_date_local ?? "").slice(0, 10) !== w.start_date_local.slice(0, 10) || (e.name ?? "") !== w.name || (e.description ?? "") !== w.description)
      update.push({ id: e.id, ev: w });
    else unchanged++;
  }
  const remove = [...[...byExt.values()].filter((e) => !want.has(e.external_id!) && !keepSet.has(e.external_id!)), ...dupes].map((e) => e.id);
  return { create, update, remove, unchanged };
}
