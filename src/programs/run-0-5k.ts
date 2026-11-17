import type { Block, PlanWeek, Program } from "../types.ts";

/* ---------- Ohjelmat: 8 viikkoa juoksu–kävelystä 5 km:iin ---------- */
const WU: Block = { k: "wu", m: 5 };
const CD: Block = { k: "cd", m: 5 };
const iv = (rep: number, run: number, walk: number): Block => ({ k: "iv", rep, run, walk });
const cont = (m: number): Block => ({ k: "run", m });
const walk = (m: number): Block => ({ k: "walk", m });
const strides = (rep: number): Block => ({ k: "str", rep, run: 1 / 3, walk: 1 });
const test5k: Block = { k: "test", m: 35, km: 5 };

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

export const RUN_0_5K: Program = {
  id: "run-0-5k",
  name: "0 → 5 km",
  title: "Takaisin juoksuun: 0 → 5 km",
  description: "8 viikkoa juoksu–kävelystä 5 km:n yhtäjaksoiseen juoksuun. Sopii paluuseen pitkän tauon jälkeen.",
  goal: "juosta 5 km yhtäjaksoisesti ohjelman lopussa. Valmennettava palaa juoksuun pitkän tauon jälkeen",
  goalLabel: "Kohti 5 km:ä",
  goalMinutes: 35,
  finishText: "Seuraava askel voi olla 5 km:n ylläpito tai 10 km:n ohjelma. Kysy valmentajalta.",
  variants: { 2: PLAN2, 3: PLAN3 },
};
