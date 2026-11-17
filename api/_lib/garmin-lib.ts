/**
 * Garmin Connect Personal API (lukeva). Avain → 24 h JWT (POST, `Authorization: ApiKey …`, vastaus pelkkä token),
 * datakutsut `Authorization: Bearer …`. Polut: github.com/garmin/connect-personal-api-python (client.py).
 * Tässä vain muunnokset Garminin JSONista sovelluksen muotoon – testattavissa ilman verkkoa.
 */
import type { GarminActivity, GarminDay, GarminZones } from "../../src/types.js";

export const GARMIN_BASE = "https://personal.connectapi.garmin.com";
export const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const round = (v: number | undefined, d = 0) => (v === undefined ? undefined : Math.round(v * 10 ** d) / 10 ** d);

/** Polut päivävälille [start, end] (molemmat mukaan). */
export function garminPaths(start: string, end: string) {
  return {
    activities: `/activitylist-service/activities/search/activities?start=0&limit=100&startDate=${start}&endDate=${end}`,
    daily: `/usersummary-service/v2/dailysummaries?startDate=${start}&endDate=${end}`,
    hrv: `/hrv-service/hrv/daily/${start}/${end}`,
    sleep: `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${start}&endDate=${end}`,
    vo2: `/metrics-service/metrics/maxmet/daily/${start}/${end}`,
    zones: `/biometric-service/heartRateZones/v2`,
  };
}

/** JWT:n vanhenemisaika millisekunteina (exp-kenttä). */
export function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch { return 0; }
}

export function mapActivities(list: unknown): GarminActivity[] {
  if (!Array.isArray(list)) return [];
  return list.filter((a: J) => a && a.activityId && typeof a.startTimeLocal === "string").map((a: J) => {
    const out: GarminActivity = {
      id: String(a.activityId),
      date: a.startTimeLocal.slice(0, 10),
      time: a.startTimeLocal.slice(11, 16),
      type: String(a.activityType?.typeKey || "other"),
      name: String(a.activityName || ""),
      minutes: Math.round((num(a.duration) ?? 0) / 60),
    };
    const km = round((num(a.distance) ?? 0) / 1000, 2);
    if (km) out.km = km;
    if (num(a.averageHR)) out.avgHr = Math.round(a.averageHR);
    if (num(a.maxHR)) out.maxHr = Math.round(a.maxHR);
    if (num(a.aerobicTrainingEffect)) out.te = round(a.aerobicTrainingEffect, 1);
    return out;
  });
}

/** Yhdistää päiväkohtaiset lähteet yhdeksi riviksi päivää kohden. */
export function mapDays(daily: unknown, hrv: unknown, sleep: unknown, vo2: unknown): GarminDay[] {
  const days = new Map<string, GarminDay>();
  const day = (d: string) => { let x = days.get(d); if (!x) { x = { date: d }; days.set(d, x); } return x; };
  for (const s of ((daily as J)?.data ?? []) as J[]) {
    if (!s?.calendarDate) continue;
    const x = day(s.calendarDate);
    const rhr = num(s.heartRate?.restingValue); if (rhr) x.restingHr = rhr;
    const st = num(s.stress?.avgLevel); if (st !== undefined && st >= 0) x.stress = st;
    const bb = num(s.bodyBattery?.maxValue); if (bb !== undefined) x.bbMax = bb;
  }
  for (const h of ((hrv as J)?.hrvSummaries ?? []) as J[]) {
    if (!h?.calendarDate) continue;
    const x = day(h.calendarDate);
    if (num(h.lastNightAvg)) x.hrv = h.lastNightAvg;
    if (num(h.weeklyAvg)) x.hrvWeek = h.weeklyAvg;
    if (typeof h.status === "string") x.hrvStatus = h.status;
    if (num(h.baseline?.balancedLow) && num(h.baseline?.balancedUpper)) x.hrvBase = [h.baseline.balancedLow, h.baseline.balancedUpper];
  }
  for (const s of (Array.isArray(sleep) ? sleep : []) as J[]) {
    if (!s?.calendarDate || !num(s.sleepTimeSeconds)) continue;
    const x = day(s.calendarDate);
    x.sleepH = round(s.sleepTimeSeconds / 3600, 1);
    const score = num(s.sleepScores?.overall?.value); if (score) x.sleepScore = score;
  }
  for (const v of (Array.isArray(vo2) ? vo2 : []) as J[]) {
    const g = v?.generic ?? v;
    const d = g?.calendarDate, val = num(g?.vo2MaxPreciseValue) ?? num(g?.vo2MaxValue);
    if (d && val) day(d).vo2 = round(val, 1);
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function mapZones(z: unknown): GarminZones | null {
  const r = (Array.isArray(z) ? z : []).find((x: J) => x?.sport === "RUNNING") ?? (Array.isArray(z) ? z[0] : null);
  if (!r || !num(r.zone1Floor)) return null;
  return { floors: [r.zone1Floor, r.zone2Floor, r.zone3Floor, r.zone4Floor, r.zone5Floor], max: num(r.maxHeartRateUsed) };
}
