import { describe, expect, it } from "vitest";
import { jwtExpiry, mapActivities, mapDays, mapZones } from "./garmin-lib.js";

describe("garmin-lib", () => {
  it("mapActivities", () => {
    const out = mapActivities([
      { activityId: 42, activityName: "Iltalenkki", startTimeLocal: "2026-11-05 18:02:11", activityType: { typeKey: "running" },
        distance: 4123.4, duration: 1830.2, averageHR: 141.6, maxHR: 165, aerobicTrainingEffect: 2.34 },
      { activityId: 43, startTimeLocal: "2026-11-06 19:00:00", activityType: { typeKey: "mixed_martial_arts" }, duration: 4500, distance: 0 },
      { nope: true },
    ]);
    expect(out).toEqual([
      { id: "42", date: "2026-11-05", time: "18:02", type: "running", name: "Iltalenkki", minutes: 31, km: 4.12, avgHr: 142, maxHr: 165, te: 2.3 },
      { id: "43", date: "2026-11-06", time: "19:00", type: "mixed_martial_arts", name: "", minutes: 75 },
    ]);
    expect(mapActivities(null)).toEqual([]);
  });

  it("mapDays yhdistää lähteet", () => {
    const days = mapDays(
      { data: [{ calendarDate: "2026-11-10", heartRate: { restingValue: 55 }, stress: { avgLevel: 20 }, bodyBattery: { maxValue: 80 } }] },
      { hrvSummaries: [{ calendarDate: "2026-11-10", lastNightAvg: 42, weeklyAvg: 38, status: "BALANCED", baseline: { balancedLow: 30, balancedUpper: 49 } }] },
      [{ calendarDate: "2026-11-09", sleepTimeSeconds: 27000, sleepScores: { overall: { value: 80 } } }],
      [{ generic: { calendarDate: "2026-11-10", vo2MaxPreciseValue: 44.26 } }],
    );
    expect(days).toEqual([
      { date: "2026-11-09", sleepH: 7.5, sleepScore: 80 },
      { date: "2026-11-10", restingHr: 55, stress: 20, bbMax: 80, hrv: 42, hrvWeek: 38, hrvStatus: "BALANCED", hrvBase: [30, 49], vo2: 44.3 },
    ]);
    expect(mapDays(null, null, null, null)).toEqual([]);
  });

  it("mapZones ja jwtExpiry", () => {
    expect(mapZones([{ sport: "DEFAULT", zone1Floor: 92, zone2Floor: 110, zone3Floor: 129, zone4Floor: 147, zone5Floor: 166, maxHeartRateUsed: 184 }]))
      .toEqual({ floors: [92, 110, 129, 147, 166], max: 184 });
    expect(mapZones([])).toBeNull();
    const tok = `x.${Buffer.from(JSON.stringify({ exp: 2000000000 })).toString("base64url")}.y`;
    expect(jwtExpiry(tok)).toBe(2000000000000);
    expect(jwtExpiry("rikki")).toBe(0);
  });
});
