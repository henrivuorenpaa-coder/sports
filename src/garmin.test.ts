import { describe, expect, it } from "vitest";
import { activityKind, garminPromptLines, matchSession, recoveryNotes } from "./garmin.ts";
import { defaultSettings } from "./schedule.ts";
import type { Ctx, GarminActivity, GarminData } from "./types.ts";

const c: Ctx = { settings: { ...defaultSettings("2026-11-02"), startDate: "2026-11-02" }, logs: [] };
const act = (p: Partial<GarminActivity>): GarminActivity => ({ id: "1", date: "2026-11-05", time: "18:00", type: "running", name: "", minutes: 30, ...p });
const g = (days: GarminData["days"]): GarminData => ({ days, activities: [], zones: null, syncedAt: "2026-11-10T06:00:00Z" });

describe("garmin", () => {
  it("activityKind", () => {
    expect(activityKind("treadmill_running")).toBe("run");
    expect(activityKind("mixed_martial_arts")).toBe("tkd");
    expect(activityKind("golf")).toBe("other");
  });

  it("matchSession löytää lähimmän tekemättömän juoksun", () => {
    expect(matchSession(c, act({ date: "2026-11-05" }))?.key).toBe("s0-0"); // ke 4.11.
    expect(matchSession(c, act({ date: "2026-11-07" }))?.key).toBe("s0-1"); // la 7.11.
    expect(matchSession(c, act({ type: "golf" }))).toBeNull();
    expect(matchSession(c, act({ date: "2027-03-01" }))).toBeNull();
  });

  it("recoveryNotes varoittaa matalasta HRV:stä ja korkeasta leposykkeestä", () => {
    const base = ["03", "04", "05", "06", "07", "08", "09"].map((d) => ({ date: `2026-11-${d}`, restingHr: 55 }));
    const notes = recoveryNotes(g([...base, { date: "2026-11-10", restingHr: 62, hrv: 25, hrvBase: [30, 49] }]), "2026-11-10");
    expect(notes[0][0]).toBe("warn");
    expect(notes[0][1]).toContain("Palautuminen kesken");
    expect(recoveryNotes(g([...base, { date: "2026-11-10", restingHr: 56, hrv: 40, hrvBase: [30, 49] }]), "2026-11-10")).toEqual([]);
    expect(recoveryNotes(g([{ date: "2026-11-01", hrv: 20, hrvBase: [30, 49] }]), "2026-11-10")).toEqual([]); // vanha data
  });

  it("garminPromptLines", () => {
    expect(garminPromptLines(null, "2026-11-10")).toContain("ei yhdistetty");
    const p = garminPromptLines({ ...g([{ date: "2026-11-10", restingHr: 55, hrv: 40 }]), activities: [act({})] }, "2026-11-10");
    expect(p).toContain("2026-11-10 | leposyke 55 | HRV 40");
    expect(p).toContain("Juoksu | 30 min");
  });
});
