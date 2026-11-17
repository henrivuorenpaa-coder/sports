import { describe, expect, it } from "vitest";
import { cleanProposals, coachPrompt, validBlocks } from "./coach.ts";
import { defaultSettings } from "./schedule.ts";
import type { Ctx } from "./types.ts";

const c: Ctx = { settings: { ...defaultSettings("2026-11-02"), startDate: "2026-11-02" }, logs: [] };
const today = "2026-11-10";

describe("validBlocks", () => {
  it("hyväksyy kelvolliset lohkot ja pyöristää 15 sekuntiin", () => {
    expect(validBlocks([{ k: "wu", m: 5 }, { k: "iv", rep: 5.2, run: 2.1, walk: 1.5 }, { k: "cd", m: 5 }]))
      .toEqual([{ k: "wu", m: 5 }, { k: "iv", rep: 5, run: 2, walk: 1.5 }, { k: "cd", m: 5 }]);
  });

  it("hylkää tuntemattomat ja rajojen ulkopuoliset lohkot", () => {
    expect(validBlocks([])).toBeNull();
    expect(validBlocks([{ k: "sprint", m: 5 }])).toBeNull();
    expect(validBlocks([{ k: "run", m: 120 }])).toBeNull();
    expect(validBlocks([{ k: "iv", rep: 50, run: 1, walk: 1 }])).toBeNull();
    expect(validBlocks("x")).toBeNull();
  });
});

describe("cleanProposals", () => {
  it("pitää vain tulevat, olemassa olevat juoksut", () => {
    const out = cleanProposals(c, [
      { type: "skip", key: "s0-0", reason: "mennyt" },
      { type: "skip", key: "s9-9", reason: "ei ole" },
      { type: "move", key: "s1-1", date: "2026-11-15", reason: "ok" },
    ], today);
    expect(out).toEqual([{ type: "move", key: "s1-1", date: "2026-11-15", reason: "ok" }]);
  });

  it("rajaa enintään kolmeen ja tarkistaa viikkonumeron", () => {
    const out = cleanProposals(c, [
      { type: "repeat_week", week: 0 },
      { type: "repeat_week", week: 2, reason: "x" },
      { type: "skip", key: "s1-1" },
      { type: "skip", key: "s2-0" },
    ], today);
    expect(out).toEqual([{ type: "repeat_week", week: 2, reason: "x" }, { type: "skip", key: "s1-1", reason: "" }]);
  });

  it("hylkää virheelliset korvaavat lohkot", () => {
    expect(cleanProposals(c, [{ type: "replace", key: "s1-1", blocks: [{ k: "x" }] }], today)).toEqual([]);
    expect(cleanProposals(c, null, today)).toEqual([]);
  });
});

describe("coachPrompt", () => {
  it("sisältää avaimet, päivän ja kysymyksen", () => {
    const p = coachPrompt(c, today, "Pohkeet kipeät");
    expect(p).toContain("Tänään: 2026-11-10 (tiistai)");
    expect(p).toContain("s1-0 | 2026-11-11");
    expect(p).toContain('"""Pohkeet kipeät"""');
  });
});
