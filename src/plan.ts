import { pad } from "./lib/dates.ts";
import type { Block, Kind, PlanWeek } from "./types.ts";

/* ---------- Ohjelmat: 8 viikkoa juoksu–kävelystä 5 km:iin ---------- */
const WU: Block = { k: "wu", m: 5 };
const CD: Block = { k: "cd", m: 5 };
const iv = (rep: number, run: number, walk: number): Block => ({ k: "iv", rep, run, walk });
const cont = (m: number): Block => ({ k: "run", m });
const walk = (m: number): Block => ({ k: "walk", m });
const strides = (rep: number): Block => ({ k: "str", rep, run: 1 / 3, walk: 1 });
const test5k: Block = { k: "test", m: 35 };

/** 2 juoksua viikossa (oletus, taekwondon rinnalla). */
export const PLAN2: PlanWeek[] = [
  { title: "Liikkeelle", focus: "Totutetaan jalat ja jänteet iskutukseen. Juokse niin hitaasti, että pystyt puhumaan kokonaisin lausein. Kävely on osa treeniä.",
    s: [[WU, iv(8, 1, 1.5), CD], [WU, iv(7, 1.5, 1.5), CD]] },
  { title: "Pidemmät pätkät", focus: "Juoksupätkät pitenevät kahteen ja kolmeen minuuttiin. Vauhti pysyy samana – kunto kasvaa kestosta, ei vauhdista.",
    s: [[WU, iv(6, 2, 1.5), CD], [WU, iv(5, 3, 1.5), CD]] },
  { title: "Rytmi löytyy", focus: "Neljän ja viiden minuutin juoksuja. Jos hengitys karkaa, hidasta ennemmin kuin kävele.",
    s: [[WU, iv(5, 4, 1.5), CD], [WU, iv(4, 5, 1.5), CD]] },
  { title: "Vakiinnutus", focus: "Viikko, jolla keho ehtii sopeutua. Määrä pysyy lähes samana, pisin pätkä kasvaa seitsemään minuuttiin.",
    s: [[WU, iv(4, 5, 1.5), CD], [WU, iv(3, 7, 2), CD]] },
  { title: "Kymmenen minuuttia", focus: "Iso askel: ensimmäiset yli kymmenen minuutin yhtäjaksoiset juoksut. Hitaus on sallittua ja suositeltavaa.",
    s: [[WU, iv(3, 8, 2), CD], [WU, iv(2, 12, 2), CD]] },
  { title: "Ensimmäinen 20 minuuttia", focus: "Kävelytauot vähenevät. Viikon lopuksi 20 minuuttia ilman taukoa.",
    s: [[WU, cont(15), walk(2), cont(5), CD], [WU, cont(20), CD]] },
  { title: "Kestävyys", focus: "Yhtäjaksoista juoksua 22–25 minuuttia. Nyt rakennetaan varmuutta viiden kilometrin matkalle.",
    s: [[WU, cont(22), CD], [WU, cont(25), CD]] },
  { title: "Viiden kilometrin viikko", focus: "Kevyt juoksu ja vedot alkuviikolla, viikonloppuna 5 km omaan tahtiin. Tavoite on juosta koko matka, ei aika.",
    s: [[WU, cont(15), strides(4), CD], [WU, test5k, CD]] },
];

/** 3 juoksua viikossa. */
export const PLAN3: PlanWeek[] = [
  { title: "Liikkeelle", focus: "Totutetaan jalat ja jänteet iskutukseen. Juokse niin hitaasti, että pystyt puhumaan kokonaisin lausein.",
    s: [[WU, iv(8, 1, 1.5), CD], [WU, iv(8, 1, 1.5), CD], [WU, iv(10, 1, 1), CD]] },
  { title: "Pidemmät pätkät", focus: "Juoksupätkät pitenevät puoleentoista ja kahteen minuuttiin. Vauhti pysyy samana.",
    s: [[WU, iv(7, 1.5, 1.5), CD], [WU, iv(6, 2, 1.5), CD], [WU, iv(6, 2, 1), CD]] },
  { title: "Kolmen minuutin rytmi", focus: "Ensimmäiset 3–4 minuutin juoksut. Jos hengitys karkaa, hidasta ennemmin kuin kävele.",
    s: [[WU, iv(5, 3, 1.5), CD], [WU, iv(5, 3, 1), CD], [WU, iv(4, 4, 1.5), CD]] },
  { title: "Vakiinnutus", focus: "Viikko, jolla keho ehtii sopeutua.",
    s: [[WU, iv(4, 4, 1.5), CD], [WU, iv(3, 5, 2), CD], [WU, iv(4, 5, 1.5), CD]] },
  { title: "Kymmenen minuuttia", focus: "Ensimmäiset 7–10 minuutin yhtäjaksoiset juoksut.",
    s: [[WU, iv(3, 7, 2), CD], [WU, iv(3, 8, 2), CD], [WU, iv(2, 10, 2), CD]] },
  { title: "Ensimmäinen 20 minuuttia", focus: "Kävelytauot vähenevät. Viikon lopuksi 20 minuuttia ilman taukoa.",
    s: [[WU, iv(2, 12, 2), CD], [WU, cont(15), walk(2), cont(5), CD], [WU, cont(20), CD]] },
  { title: "Kestävyys", focus: "Yhtäjaksoista juoksua 20–25 minuuttia.",
    s: [[WU, cont(20), CD], [WU, cont(25), CD], [WU, cont(25), CD]] },
  { title: "Viiden kilometrin viikko", focus: "Kevennetään alkuviikko ja juostaan lopuksi 5 km omaan tahtiin.",
    s: [[WU, cont(25), CD], [WU, cont(15), strides(4), CD], [WU, test5k, CD]] },
];

export const planFor = (runDays: number[]) => (runDays.length === 3 ? PLAN3 : PLAN2);

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
      case "test": return { r: true, t: `5 km juoksu omaan tahtiin (arvio 30–38 min)` };
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
        case "test": return "5 km";
        case "str": return `${b.rep} vetoa`;
        default: return `${short(b.m)}′ kävely`;
      }
    })
    .join(" + ");
}

export const kindOf = (blocks: Block[]) =>
  blocks.some((b) => b.k === "test") ? "5 km" : blocks.some((b) => b.k === "iv") ? "Juoksu–kävely" : "Kevyt juoksu";

export const rpeText = (r: number) =>
  r <= 2 ? "erittäin kevyt" : r <= 4 ? "kevyt – pystyt puhumaan" : r <= 6 ? "kohtalainen" : r <= 8 ? "raskas" : "maksimaalinen";

export const KIND: Record<Kind, string> = { tkd: "Taekwondo", run: "Juoksu", other: "Muu treeni" };

export const titleOf = (x: { kind: Kind; label?: string }) =>
  x.kind === "other" ? x.label || "Muu treeni" : x.kind === "run" ? x.label || "Vapaa juoksu" : x.label || "Taekwondo";
