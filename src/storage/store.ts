import type { CoachState, LogEntry, Settings } from "../types.ts";

export interface StoreData {
  settings: Settings | null;
  logs: LogEntry[];
  coach: CoachState | null;
}

/**
 * Tallennuskerros. Kokoelmat ovat samat kuin Claude-artefaktissa:
 * `settings/main`, `log/<id>` ja `coach/last` – Firestoressa käyttäjän alla (`users/{uid}/...`).
 */
export interface Store {
  readonly mode: "local" | "cloud";
  /** Kuuntelee muutoksia. `onData` kutsutaan heti nykyisellä tilalla ja aina, kun jokin muuttuu. */
  subscribe(onData: (patch: Partial<StoreData>) => void, onError: (msg: string) => void): () => void;
  saveSettings(s: Settings): Promise<void>;
  putLog(e: LogEntry): Promise<void>;
  removeLog(id: string): Promise<void>;
  saveCoach(c: CoachState): Promise<void>;
  /** Kirjoittaa kaiken kerralla (tuonti ja siirto laitteelta tilille). */
  importAll(d: StoreData): Promise<void>;
}
