export type TimedBlock = { k: "wu" | "cd" | "walk" | "run"; m: number };
/** Testijuoksu: `km` kilometriä, arvioitu kesto `m` min. */
export type TestBlock = { k: "test"; m: number; km?: number };
export type RepBlock = { k: "iv" | "str"; rep: number; run: number; walk: number };
export type Block = TimedBlock | TestBlock | RepBlock;

export interface PlanWeek {
  title: string;
  focus: string;
  s: Block[][];
}

/** Valittava harjoitusohjelma. Uudet ohjelmat lisätään `src/programs/`-kansioon ja luetteloon `PROGRAMS`. */
export interface Program {
  id: string;
  /** Lyhyt nimi valintalistaan, esim. "0 → 5 km". */
  name: string;
  /** Otsikko ohjelmanäkymään. */
  title: string;
  /** Yhden lauseen kuvaus asetuksiin. */
  description: string;
  /** Tavoite valmentajan promptiin. */
  goal: string;
  /** Edistymismittari: otsikko ja pisimmän yhtäjaksoisen juoksun tavoite minuutteina. */
  goalLabel: string;
  goalMinutes: number;
  /** Teksti, kun ohjelman juoksut on käyty läpi. */
  finishText: string;
  /** Ohjelma juoksukertojen määrän mukaan (esim. 2 ja 3 kertaa viikossa). */
  variants: Record<number, PlanWeek[]>;
}

export type Kind = "run" | "tkd" | "other";

export interface Rule {
  id: string;
  kind: Kind;
  weekday: number;
  minutes: number;
  from?: string;
  until?: string;
  label?: string;
}

export interface Settings {
  /** Aktiivinen ohjelma. Puuttuu vanhasta datasta → oletusohjelma. */
  programId?: string;
  startDate: string;
  runDays: number[];
  tkdMin: number;
  repeats: number[];
  dismissed: number[];
  moves: Record<string, string>;
  skips: Record<string, boolean>;
  overrides: Record<string, Block[]>;
  rSkips: string[];
  recurring: Rule[];
  /** intervals.icu-vienti: `auto` = päivitä kalenteri muutosten jälkeen, `sig` = viimeksi viedyn sisällön tunniste. */
  intervals?: { auto: boolean; sig?: string; at?: string };
}

export interface LogEntry {
  id: string;
  kind: Kind;
  date: string;
  minutes: number;
  rpe?: number;
  km?: number;
  note: string;
  status?: "done" | "planned";
  sessionKey?: string;
  /** Ohjelma, jonka juoksuun `sessionKey` viittaa. Puuttuu vanhasta datasta → oletusohjelma. */
  programId?: string;
  ruleRef?: string;
  /** Garmin-aktiviteetti, josta kirjaus tehtiin. */
  garminId?: string;
  label?: string;
  createdAt?: number;
}

/** Kaikki aikataulun laskentaan tarvittava tila. */
export interface Ctx {
  settings: Settings;
  logs: LogEntry[];
}

export interface Session {
  key: string;
  slot: number;
  base: number;
  idx: number;
  orig: string;
  date: string;
  moved: boolean;
  blocks: Block[];
  adjusted: boolean;
  name: string;
  skipped: boolean;
  done: LogEntry | undefined;
}

export interface Virtual extends Rule {
  ref: string;
  date: string;
}

export type Proposal =
  | { type: "replace"; key: string; blocks: Block[]; reason: string; status?: PropStatus }
  | { type: "move"; key: string; date: string; reason: string; status?: PropStatus }
  | { type: "skip"; key: string; reason: string; status?: PropStatus }
  | { type: "repeat_week"; week: number; reason: string; status?: PropStatus };
export type PropStatus = "applied" | "rejected";

export interface CoachState {
  analysis?: string;
  proposals?: Proposal[];
  at?: string;
  q?: string;
  error?: string;
}

export type NoteKind = "tkd" | "warn" | "ok";

/* ---------- Garmin (api/garmin.ts → Firestore `garmin/…`) ---------- */
export interface GarminActivity {
  id: string;
  date: string;
  /** Alkamisaika "HH:MM" paikallista aikaa. */
  time: string;
  /** Garminin typeKey, esim. running, treadmill_running, mixed_martial_arts. */
  type: string;
  name: string;
  minutes: number;
  km?: number;
  avgHr?: number;
  maxHr?: number;
  /** Aerobinen harjoitusvaikutus 0–5. */
  te?: number;
}

export interface GarminDay {
  date: string;
  restingHr?: number;
  /** Viime yön HRV-keskiarvo (ms), viikon keskiarvo, status ja oma normaalihaarukka [ala, ylä]. */
  hrv?: number;
  hrvWeek?: number;
  hrvStatus?: string;
  hrvBase?: [number, number];
  sleepH?: number;
  sleepScore?: number;
  bbMax?: number;
  stress?: number;
  vo2?: number;
}

export interface GarminZones {
  /** Sykealueiden 1–5 alarajat. */
  floors: number[];
  max?: number;
}

export interface GarminData {
  days: GarminDay[];
  activities: GarminActivity[];
  zones: GarminZones | null;
  syncedAt: string | null;
}
