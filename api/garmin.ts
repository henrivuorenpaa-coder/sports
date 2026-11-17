import { json, requireUser } from "./_lib/auth.js";
import { GARMIN_BASE, TOKEN_PATH, garminPaths, jwtExpiry, mapActivities, mapDays, mapZones } from "./_lib/garmin-lib.js";

/**
 * POST /api/garmin  { days?: number }  →  { days, activities, zones, syncedAt }
 * Hakee Garminista viimeiset `days` päivää (oletus 14, enintään 60). Sovellus tallentaa tuloksen Firestoreen.
 * Env: GARMIN_PERSONAL_API_KEY (+ samat kirjautumismuuttujat kuin /api/coach).
 */
let cached: { token: string; exp: number } | null = null;

async function garminToken(key: string) {
  if (cached && cached.exp - Date.now() > 60 * 60 * 1000) return cached.token;
  const r = await fetch(GARMIN_BASE + TOKEN_PATH, { method: "POST", headers: { Accept: "*/*", Authorization: `ApiKey ${key}` } });
  if (!r.ok) throw { status: r.status, code: r.status === 401 || r.status === 403 ? "garmin_key" : "garmin_error" };
  const token = (await r.text()).trim();
  cached = { token, exp: jwtExpiry(token) || Date.now() + 23 * 3600e3 };
  return token;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const key = process.env.GARMIN_PERSONAL_API_KEY;
  if (!key) return json(500, { code: "garmin_not_configured" });

  let days = 14;
  try { const b = await request.json(); if (Number.isFinite(b?.days)) days = Math.min(60, Math.max(1, Math.round(b.days))); } catch { /* oletus */ }
  const end = new Date(), start = new Date(Date.now() - (days - 1) * 864e5);
  const paths = garminPaths(iso(start), iso(end));

  try {
    const token = await garminToken(key);
    const get = async (p: string) => {
      const r = await fetch(GARMIN_BASE + p, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
      if (r.status === 401) { cached = null; throw { code: "garmin_key" }; }
      if (!r.ok) return null; // yksittäinen lähde puuttuu → muut silti mukaan
      const t = await r.text();
      return t ? JSON.parse(t) : null;
    };
    const [activities, daily, hrv, sleep, vo2, zones] = await Promise.all(
      [paths.activities, paths.daily, paths.hrv, paths.sleep, paths.vo2, paths.zones].map(get));
    return json(200, {
      days: mapDays(daily, hrv, sleep, vo2),
      activities: mapActivities(activities),
      zones: mapZones(zones),
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    const code = (e as { code?: string })?.code || "garmin_error";
    return json(code === "garmin_key" ? 502 : 502, { code });
  }
}
