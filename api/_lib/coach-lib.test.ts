import { describe, expect, it } from "vitest";
import { extractJson, isAllowed, parseAllowed } from "./coach-lib.js";

describe("coach-lib", () => {
  it("parseAllowed + isAllowed", () => {
    const allowed = parseAllowed(" A@x.fi , b@y.fi,");
    expect(allowed).toEqual(["a@x.fi", "b@y.fi"]);
    expect(isAllowed("a@X.fi", allowed)).toBe(true);
    expect(isAllowed("c@x.fi", allowed)).toBe(false);
    expect(isAllowed(undefined, allowed)).toBe(false);
    expect(isAllowed("a@x.fi", parseAllowed(undefined))).toBe(false);
  });

  it("extractJson sietää aitoja ja tekstiä", () => {
    expect(extractJson('```json\n{"analysis":"ok","proposals":[]}\n```')).toEqual({ analysis: "ok", proposals: [] });
    expect(extractJson("ei jsonia")).toBeNull();
    expect(extractJson("{rikki")).toBeNull();
  });
});
