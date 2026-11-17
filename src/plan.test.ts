import { describe, expect, it } from "vitest";
import { fmt, kindOf, segs, summary, totals } from "./plan.ts";
import { PROGRAMS, planFor, programOf } from "./programs/index.ts";
import { PLAN2, PLAN3 } from "./programs/run-0-5k.ts";
import type { Block } from "./types.ts";

describe("ohjelmat", () => {
  it("molemmissa on 8 viikkoa ja oikea määrä juoksuja", () => {
    expect(PLAN2).toHaveLength(8);
    expect(PLAN3).toHaveLength(8);
    PLAN2.forEach((w) => expect(w.s).toHaveLength(2));
    PLAN3.forEach((w) => expect(w.s).toHaveLength(3));
  });

  it("planFor valitsee ohjelman juoksupäivien määrästä", () => {
    expect(planFor({ runDays: [2, 5] })).toBe(PLAN2);
    expect(planFor({ runDays: [0, 2, 5] })).toBe(PLAN3);
    expect(planFor({ runDays: [0, 2, 4, 6] })).toBe(PLAN3); // ei 4 kerran versiota → lähin pienempi
  });

  it("tuntematon tai puuttuva programId → oletusohjelma", () => {
    expect(programOf({}).id).toBe(PROGRAMS[0].id);
    expect(programOf({ programId: "ei-ole" }).id).toBe(PROGRAMS[0].id);
  });

  it("ohjelmien id:t ovat yksilöllisiä ja jokaisella on versio", () => {
    expect(new Set(PROGRAMS.map((p) => p.id)).size).toBe(PROGRAMS.length);
    PROGRAMS.forEach((p) => expect(Object.keys(p.variants).length).toBeGreaterThan(0));
  });

  it("pisin juoksupätkä ei koskaan lyhene viikosta toiseen", () => {
    for (const P of PROGRAMS.flatMap((p) => Object.values(p.variants))) {
      const longest = P.map((w) => Math.max(...w.s.map((b) => totals(b).longest)));
      for (let i = 1; i < longest.length; i++) expect(longest[i]).toBeGreaterThanOrEqual(longest[i - 1]);
    }
  });

  it("viimeinen juoksu on 5 km:n testi", () => {
    expect(kindOf(PLAN2[7].s[1])).toBe("5 km");
    expect(kindOf(PLAN3[7].s[2])).toBe("5 km");
  });
});

describe("lohkojen laskenta", () => {
  const ivBlocks: Block[] = [{ k: "wu", m: 5 }, { k: "iv", rep: 8, run: 1, walk: 1.5 }, { k: "cd", m: 5 }];

  it("segs purkaa toistot juoksu- ja kävelypätkiksi", () => {
    const s = segs(ivBlocks);
    expect(s).toHaveLength(1 + 16 + 1);
    expect(s[1]).toEqual(["run", 1]);
    expect(s[2]).toEqual(["walk", 1.5]);
  });

  it("totals laskee kokonaiskeston, juoksun ja pisimmän pätkän", () => {
    expect(totals(ivBlocks)).toEqual({ total: 30, run: 8, longest: 1 });
    expect(totals([{ k: "wu", m: 5 }, { k: "run", m: 20 }, { k: "cd", m: 5 }])).toEqual({ total: 30, run: 20, longest: 20 });
  });

  it("vedot lasketaan juoksuksi", () => {
    const t = totals([{ k: "str", rep: 4, run: 1 / 3, walk: 1 }]);
    expect(t.longest).toBeCloseTo(1 / 3);
    expect(segs([{ k: "str", rep: 1, run: 1 / 3, walk: 1 }])[0][0]).toBe("stride");
  });

  it("fmt muotoilee minuutit ja sekunnit", () => {
    expect(fmt(5)).toBe("5 min");
    expect(fmt(1.5)).toBe("1:30 min");
    expect(fmt(1 / 3)).toBe("20 s");
  });

  it("summary jättää alku- ja loppukävelyn pois", () => {
    expect(summary(ivBlocks)).toBe("8×1′ / 1:30′");
    expect(summary([{ k: "wu", m: 5 }, { k: "run", m: 15 }, { k: "walk", m: 2 }, { k: "run", m: 5 }, { k: "cd", m: 5 }]))
      .toBe("15′ yhtäjaksoisesti + 2′ kävely + 5′ yhtäjaksoisesti");
  });
});
