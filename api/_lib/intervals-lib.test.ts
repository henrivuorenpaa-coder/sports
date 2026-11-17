import { describe, expect, it } from "vitest";
import { diffEvents, parsePushBody } from "./intervals-lib.js";

const w = (k: string, date: string, description = "d") =>
  ({ external_id: `sports:p:${k}`, start_date_local: `${date}T00:00:00`, name: "n", description, moving_time: 1800 });

describe("intervals-lib", () => {
  it("diffEvents", () => {
    const d = diffEvents(
      [w("a", "2026-11-04"), w("b", "2026-11-07", "uusi"), w("c", "2026-11-11")],
      [
        { id: 1, external_id: "sports:p:a", start_date_local: "2026-11-04T00:00:00", name: "n", description: "d" },
        { id: 2, external_id: "sports:p:b", start_date_local: "2026-11-07T00:00:00", name: "n", description: "vanha" },
        { id: 3, external_id: "sports:p:old", start_date_local: "2026-11-05T00:00:00" },
        { id: 4, external_id: "sports:p:done", start_date_local: "2026-11-03T00:00:00" },
        { id: 5, external_id: null, name: "oma treeni" },
        { id: 6, external_id: "sports:p:a", start_date_local: "2026-11-04T00:00:00" },
      ],
      ["sports:p:done"],
    );
    expect(d.create.map((e) => e.external_id)).toEqual(["sports:p:c"]);
    expect(d.update.map((u) => u.id)).toEqual([2]);
    expect(d.remove).toEqual([3, 6]);
    expect(d.unchanged).toBe(1);
  });

  it("parsePushBody", () => {
    const ok = { oldest: "2026-11-03", newest: "2026-11-16", events: [w("a", "2026-11-04")], keep: [] };
    expect(parsePushBody(ok)?.events).toHaveLength(1);
    expect(parsePushBody({ ...ok, events: [{ ...w("a", "2026-11-04"), external_id: "muu:a" }] })).toBeNull();
    expect(parsePushBody({ ...ok, events: [w("a", "2026-12-24")] })).toBeNull();
    expect(parsePushBody({ ...ok, oldest: "x" })).toBeNull();
    expect(parsePushBody(null)).toBeNull();
  });
});
