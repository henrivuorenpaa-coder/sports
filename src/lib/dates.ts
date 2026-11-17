// Päivämäärät käsitellään merkkijonoina "YYYY-MM-DD" paikallisessa ajassa (klo 12 välttää kesäaikaongelmat).
export const WD = ["ma", "ti", "ke", "to", "pe", "la", "su"];
export const WDL = ["maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai", "sunnuntai"];
export const WDESS = ["maanantaina", "tiistaina", "keskiviikkona", "torstaina", "perjantaina", "lauantaina", "sunnuntaina"];
export const WDPL = ["maanantaisin", "tiistaisin", "keskiviikkoisin", "torstaisin", "perjantaisin", "lauantaisin", "sunnuntaisin"];

export const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
/** Viikonpäivä 0 = maanantai … 6 = sunnuntai. */
export const wd = (s: string) => (parse(s).getDay() + 6) % 7;
export const fi = (s: string) => {
  const d = parse(s);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
};
export const fiLong = (s: string) => `${WD[wd(s)]} ${fi(s)}`;
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
export const todayIso = () => iso(new Date());
export const mondayOf = (s: string) => addDays(s, -wd(s));
export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
