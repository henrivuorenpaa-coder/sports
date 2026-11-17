import type { PlanWeek, Program, Settings } from "../types.ts";
import { RUN_0_5K } from "./run-0-5k.ts";

/** Kaikki valittavat ohjelmat. Ensimmäinen on oletus (myös vanhalle datalle, jossa ei ole `programId`:tä). */
export const PROGRAMS: Program[] = [RUN_0_5K];
export const DEFAULT_PROGRAM_ID = PROGRAMS[0].id;

export const programIdOf = (st: Pick<Settings, "programId">) => st.programId || DEFAULT_PROGRAM_ID;

export const programOf = (st: Pick<Settings, "programId">): Program =>
  PROGRAMS.find((p) => p.id === programIdOf(st)) ?? PROGRAMS[0];

/** Juoksukertojen määrät, joille ohjelmasta on versio (esim. [2, 3]). */
export const runCountsOf = (p: Program) => Object.keys(p.variants).map(Number).sort((a, b) => a - b);

/** Aktiivisen ohjelman viikot valitulle juoksukertojen määrälle (lähin pienempi, jos tarkkaa ei ole). */
export function planFor(st: Pick<Settings, "programId" | "runDays">): PlanWeek[] {
  const p = programOf(st), n = st.runDays.length;
  const counts = runCountsOf(p);
  const best = [...counts].reverse().find((c) => c <= n) ?? counts[0];
  return p.variants[best];
}
