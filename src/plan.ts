import { pad } from "./lib/dates.ts";
import type { Block, Kind } from "./types.ts";

/* ---------- lohkojen esitys ---------- */
export function fmt(m: number) {
  if (m < 1) return `${Math.round(m * 60)} s`;
  if (Number.isInteger(m)) return `${m} min`;
  const s = Math.round((m % 1) * 60);
  return `${Math.floor(m)}:${pad(s)} min`;
}
export const short = (m: number) => fmt(m).replace(" min", "");

export type SegKind = "walk" | "run" | "stride" | "test";
export function segs(blocks: Block[]): [SegKind, number][] {
  const out: [SegKind, number][] = [];
  for (const b of blocks) {
    if (b.k === "wu" || b.k === "cd" || b.k === "walk") out.push(["walk", b.m]);
    else if (b.k === "run") out.push(["run", b.m]);
    else if (b.k === "test") out.push(["test", b.m]);
    else if (b.k === "iv" || b.k === "str") for (let i = 0; i < b.rep; i++) {
      out.push([b.k === "str" ? "stride" : "run", b.run]);
      out.push(["walk", b.walk]);
    }
  }
  return out;
}

export function totals(blocks: Block[]) {
  let total = 0, run = 0, longest = 0;
  for (const [t, m] of segs(blocks)) {
    total += m;
    if (t !== "walk") { run += m; longest = Math.max(longest, m); }
  }
  return { total: Math.round(total), run: Math.round(run), longest };
}

export function steps(blocks: Block[]) {
  return blocks.map((b) => {
    switch (b.k) {
      case "wu": return { r: false, t: `${b.m} min reipas kävely – alkulämmittely` };
      case "cd": return { r: false, t: `${b.m} min kävely ja kevyt venyttely` };
      case "walk": return { r: false, t: `${fmt(b.m)} kävely` };
      case "run": return { r: true, t: `${fmt(b.m)} yhtäjaksoista juoksua, keskustelutahti` };
      case "test": return { r: true, t: `${b.km ?? 5} km juoksu omaan tahtiin (arvio noin ${b.m} min)` };
      case "str": return { r: true, t: `${b.rep} × 20 s reipas vedonomainen juoksu + 1 min kävely` };
      case "iv": return { r: true, t: `${b.rep} × ${fmt(b.run)} juoksu + ${fmt(b.walk)} kävely` };
    }
  });
}

export function summary(blocks: Block[]) {
  return blocks
    .filter((b) => b.k !== "wu" && b.k !== "cd")
    .map((b) => {
      switch (b.k) {
        case "iv": return `${b.rep}×${short(b.run)}′ / ${short(b.walk)}′`;
        case "run": return `${short(b.m)}′ yhtäjaksoisesti`;
        case "test": return `${b.km ?? 5} km`;
        case "str": return `${b.rep} vetoa`;
        default: return `${short(b.m)}′ kävely`;
      }
    })
    .join(" + ");
}

export function kindOf(blocks: Block[]) {
  const test = blocks.find((b) => b.k === "test");
  if (test) return `${test.km ?? 5} km`;
  return blocks.some((b) => b.k === "iv") ? "Juoksu–kävely" : "Kevyt juoksu";
}

export const rpeText = (r: number) =>
  r <= 2 ? "erittäin kevyt" : r <= 4 ? "kevyt – pystyt puhumaan" : r <= 6 ? "kohtalainen" : r <= 8 ? "raskas" : "maksimaalinen";

export const KIND: Record<Kind, string> = { tkd: "Taekwondo", run: "Juoksu", other: "Muu treeni" };

export const titleOf = (x: { kind: Kind; label?: string }) =>
  x.kind === "other" ? x.label || "Muu treeni" : x.kind === "run" ? x.label || "Vapaa juoksu" : x.label || "Taekwondo";
