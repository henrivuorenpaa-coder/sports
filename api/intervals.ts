import { json, requireUser } from "./_lib/auth.js";
import { ICU_BASE, diffEvents, parsePushBody, type ExistingEvent, type WantedEvent } from "./_lib/intervals-lib.js";

/**
 * POST /api/intervals  { oldest, newest, events, keep }  →  { created, updated, removed, unchanged }
 * Synkronoi ohjelman tulevat juoksut intervals.icu:n kalenteriin, josta ne siirtyvät Garmin Connectiin ja kelloon.
 * Vain Sportsin luomia tapahtumia (external_id "sports:…") lisätään, muutetaan tai poistetaan.
 * Env: INTERVALS_API_KEY, INTERVALS_ATHLETE_ID (+ samat kirjautumismuuttujat kuin muut funktiot).
 */
class IcuError { constructor(public status: number, public code: string) {} }

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const key = process.env.INTERVALS_API_KEY, athlete = process.env.INTERVALS_ATHLETE_ID?.trim();
  if (!key || !athlete) return json(500, { code: "intervals_not_configured" });

  let body;
  try { body = parsePushBody(await request.json()); } catch { body = null; }
  if (!body) return json(400, { code: "bad_request" });

  const auth = "Basic " + Buffer.from(`API_KEY:${key}`).toString("base64");
  const base = `${ICU_BASE}/athlete/${encodeURIComponent(athlete)}`;
  const call = async (method: string, path: string, data?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: auth, Accept: "application/json", ...(data ? { "content-type": "application/json" } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (r.status === 401 || r.status === 403) throw new IcuError(502, "intervals_key");
    if (r.status === 404) throw new IcuError(502, "intervals_athlete");
    if (!r.ok) { console.error("intervals.icu", method, path, r.status, (await r.text()).slice(0, 500)); throw new IcuError(502, "intervals_error"); }
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };
  const toIcu = (e: WantedEvent) => ({ ...e, category: "WORKOUT", type: "Run" });

  try {
    const existing = (await call("GET", `/events?oldest=${body.oldest}&newest=${body.newest}&category=WORKOUT`)) as ExistingEvent[];
    const d = diffEvents(body.events, existing ?? [], body.keep);
    if (d.remove.length) await call("PUT", "/events/bulk-delete", d.remove.map((id) => ({ id })));
    for (const u of d.update) await call("PUT", `/events/${encodeURIComponent(String(u.id))}`, toIcu(u.ev));
    if (d.create.length) await call("POST", "/events/bulk", d.create.map(toIcu));
    return json(200, { created: d.create.length, updated: d.update.length, removed: d.remove.length, unchanged: d.unchanged, syncedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof IcuError) return json(e.status, { code: e.code });
    console.error("intervals", e);
    return json(502, { code: "intervals_error" });
  }
}
