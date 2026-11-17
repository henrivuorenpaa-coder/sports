import { describe, expect, it } from "vitest";
import { eventsSignature, icuDur, intervalsEvents, workoutText } from "./intervals.ts";
import { defaultSettings } from "./schedule.ts";
import type { Ctx } from "./types.ts";

const c: Ctx = { settings: { ...defaultSettings("2026-11-02"), startDate: "2026-11-02" }, logs: [] };

describe("intervals", () => {
  it("icuDur", () => {
    expect(icuDur(5)).toBe("5m");
    expect(icuDur(1.5)).toBe("1m30s");
    expect(icuDur(1 / 3)).toBe("20s");
  });

  it("workoutText", () => {
    expect(workoutText([{ k: "wu", m: 5 }, { k: "iv", rep: 8, run: 1, walk: 1.5 }, { k: "cd", m: 5 }])).toBe(
      "Alkulämmittely\n- Reipas kävely 5m\n\n8x\n- Juoksu 1m\n- Kävely 1m30s\n\nLoppuverryttely\n- Kävely 5m");
    expect(workoutText([{ k: "test", m: 35, km: 5 }])).toBe("- Juoksu omaan tahtiin 5km");
    expect(workoutText([{ k: "iv", rep: 1, run: 12, walk: 2 }])).toBe("- Juoksu 12m\n- Kävely 2m");
  });

  it("intervalsEvents: tulevat tekemättömät, tehdyt pidetään", () => {
    const x = intervalsEvents(c, "2026-11-03");
    expect(x.oldest).toBe("2026-11-03");
    expect(x.newest).toBe("2026-11-16");
    expect(x.events.map((e) => e.start_date_local.slice(0, 10))).toEqual(["2026-11-04", "2026-11-07", "2026-11-11", "2026-11-14"]);
    expect(x.events[0].external_id).toBe("sports:run-0-5k:s0-0");
    expect(x.events[0].moving_time).toBe(30 * 60);
    expect(x.events[0].description).toContain("8x\n- Juoksu 1m");

    const done: Ctx = { ...c, logs: [{ id: "a", kind: "run", date: "2026-11-04", minutes: 30, note: "", status: "done", sessionKey: "s0-0" }] };
    const y = intervalsEvents(done, "2026-11-03");
    expect(y.events.map((e) => e.external_id)).not.toContain("sports:run-0-5k:s0-0");
    expect(y.keep).toEqual(["sports:run-0-5k:s0-0"]);
    expect(eventsSignature(y)).not.toBe(eventsSignature(x));
    expect(eventsSignature(intervalsEvents(c, "2026-11-03"))).toBe(eventsSignature(x));
  });
});
