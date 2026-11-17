import { describe, expect, it } from "vitest";
import { addDays, mondayOf, wd } from "./lib/dates.ts";
import { defaultSettings, notesFor, repeatPatch, repeatSuggestion, schedule, slotMap, status, virtualsOn } from "./schedule.ts";
import type { Ctx, LogEntry, Settings } from "./types.ts";

const START = "2026-11-02"; // maanantai
const base = (patch: Partial<Settings> = {}): Settings => ({
  ...defaultSettings(START),
  startDate: START,
  runDays: [2, 5],
  ...patch,
});
const ctx = (st: Partial<Settings> = {}, logs: LogEntry[] = []): Ctx => ({ settings: base(st), logs });
const run = (sessionKey: string, date: string, rpe = 4): LogEntry => ({ id: `l-${sessionKey}`, kind: "run", date, minutes: 30, rpe, note: "", status: "done", sessionKey });

describe("päivämäärät", () => {
  it("wd ja mondayOf toimivat maanantaipohjaisesti", () => {
    expect(wd(START)).toBe(0);
    expect(wd("2026-11-08")).toBe(6);
    expect(mondayOf("2026-11-08")).toBe(START);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("defaultSettings aloittaa tältä viikolta, jos ensimmäinen juoksupäivä ei ole ohi", () => {
    expect(defaultSettings("2026-11-03").startDate).toBe(START); // ti
    expect(defaultSettings("2026-11-05").startDate).toBe("2026-11-09"); // to → seuraava viikko
  });
});

describe("schedule", () => {
  it("luo 8 viikkoa × 2 juoksua oikeille päiville", () => {
    const s = schedule(ctx());
    expect(s).toHaveLength(16);
    expect(s[0]).toMatchObject({ key: "s0-0", date: "2026-11-04", slot: 0 });
    expect(s[1]).toMatchObject({ key: "s0-1", date: "2026-11-07" });
    expect(s[15]).toMatchObject({ key: "s7-1", date: addDays(START, 7 * 7 + 5) });
  });

  it("huomioi siirrot, ohitukset, muokkaukset ja kirjaukset", () => {
    const blocks = [{ k: "run" as const, m: 10 }];
    const s = schedule(ctx(
      { moves: { "s0-0": "2026-11-05" }, skips: { "s0-1": true }, overrides: { "s1-0": blocks } },
      [run("s1-1", "2026-11-14")],
    ));
    const by = Object.fromEntries(s.map((x) => [x.key, x]));
    expect(by["s0-0"]).toMatchObject({ date: "2026-11-05", orig: "2026-11-04", moved: true });
    expect(by["s0-1"].skipped).toBe(true);
    expect(by["s1-0"]).toMatchObject({ adjusted: true, blocks });
    expect(by["s1-1"].done?.id).toBe("l-s1-1");
  });

  it("toisen ohjelman kirjaus ei merkitse juoksua tehdyksi", () => {
    const other = { ...run("s0-0", "2026-11-04"), programId: "joku-muu" };
    expect(schedule(ctx({}, [other]))[0].done).toBeUndefined();
    expect(schedule(ctx({ programId: "joku-muu" }, [other]))[0].done?.id).toBe("l-s0-0");
  });

  it("vanha kirjaus ilman programId:tä kuuluu oletusohjelmaan", () => {
    expect(schedule(ctx({ programId: undefined }, [run("s0-0", "2026-11-04")]))[0].done).toBeDefined();
  });

  it("suunniteltu kirjaus ei merkitse juoksua tehdyksi", () => {
    const s = schedule(ctx({}, [{ ...run("s0-0", "2026-11-04"), status: "planned" }]));
    expect(s[0].done).toBeUndefined();
  });

  it("status kertoo juoksun tilan", () => {
    const [s] = schedule(ctx());
    expect(status(s, "2026-11-04")[0]).toBe("today");
    expect(status(s, "2026-11-05")[0]).toBe("missed");
    expect(status(s, "2026-11-03")[0]).toBe("up");
  });
});

describe("viikon toisto", () => {
  it("slotMap lisää toistetun viikon heti alkuperäisen perään", () => {
    expect(slotMap(base({ repeats: [1] }))).toEqual([0, 1, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("repeatPatch siirtää myöhempien viikkojen avaimia yhdellä", () => {
    const st = base({ moves: { "s0-1": "2026-11-08", "s3-0": "2026-11-26" }, skips: { "s2-1": true } });
    const p = repeatPatch(st, 1);
    expect(p.repeats).toEqual([1]);
    expect(p.moves).toEqual({ "s0-1": "2026-11-08", "s4-0": "2026-11-26" });
    expect(p.skips).toEqual({ "s3-1": true });
  });

  it("repeatSuggestion ehdottaa toistoa, jos edellinen viikko jäi kesken", () => {
    const today = "2026-11-10"; // viikko 2 tiistai
    expect(repeatSuggestion(ctx(), today)).toMatchObject({ slot: 0, base: 0, prevDone: 0 });
    expect(repeatSuggestion(ctx({}, [run("s0-0", "2026-11-04")]), today)).toBeNull();
    expect(repeatSuggestion(ctx({ dismissed: [0] }), today)).toBeNull();
  });
});

describe("toistuvat treenit ja vinkit", () => {
  const tkdRule = { id: "tkd-1", kind: "tkd" as const, weekday: 1, minutes: 75, from: START };

  it("virtualsOn näyttää säännön, kunnes se kirjataan tai ohitetaan", () => {
    const d = "2026-11-03";
    expect(virtualsOn(ctx({ recurring: [tkdRule] }), d)).toHaveLength(1);
    expect(virtualsOn(ctx({ recurring: [tkdRule], rSkips: [`tkd-1@${d}`] }), d)).toHaveLength(0);
    const logged: LogEntry = { id: "x", kind: "tkd", date: d, minutes: 75, note: "", status: "done", ruleRef: `tkd-1@${d}` };
    expect(virtualsOn(ctx({ recurring: [tkdRule] }, [logged]), d)).toHaveLength(0);
    expect(virtualsOn(ctx({ recurring: [{ ...tkdRule, until: "2026-11-02" }] }), d)).toHaveLength(0);
  });

  it("notesFor varoittaa raskaan taekwondon jälkeisestä päivästä", () => {
    const c = ctx({ recurring: [] }, [{ id: "t", kind: "tkd", date: "2026-11-03", minutes: 75, rpe: 8, note: "", status: "done" }]);
    const s = schedule(c)[0]; // ke 4.11.
    const notes = notesFor(c, s, "2026-11-04");
    expect(notes.some(([k, t]) => k === "warn" && t.includes("RPE 8"))).toBe(true);
  });
});
