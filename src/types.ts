export type TimedBlock = { k: "wu" | "cd" | "walk" | "run" | "test"; m: number };
export type RepBlock = { k: "iv" | "str"; rep: number; run: number; walk: number };
export type Block = TimedBlock | RepBlock;

export interface PlanWeek {
  title: string;
  focus: string;
  s: Block[][];
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
  ruleRef?: string;
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
