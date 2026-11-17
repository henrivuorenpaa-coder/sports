import type { CoachState, GarminData, LogEntry, Settings } from "../types.ts";

export interface StoreData {
  settings: Settings | null;
  logs: LogEntry[];
  coach: CoachState | null;
}

export const EMPTY_GARMIN: GarminData = { days: [], activities: [], zones: null, syncedAt: null };

/**
 * Tallennuskerros. Kokoelmat ovat samat kuin Claude-artefaktissa:
 * `settings/main`, `log/<id>` ja `coach/last` – Firestoressa käyttäjän alla (`users/{uid}/...`).
 */
export interface Store {
  readonly mode: "local" | "cloud";
  /** Kuuntelee muutoksia. `onData` kutsutaan heti nykyisellä tilalla ja aina, kun jokin muuttuu. */
  subscribe(onData: (patch: Partial<StoreData & { garmin: GarminData }>) => void, onError: (msg: string) => void): () => void;
  saveSettings(s: Settings): Promise<void>;
  putLog(e: LogEntry): Promise<void>;
  removeLog(id: string): Promise<void>;
  saveCoach(c: CoachState): Promise<void>;
  /** Tallentaa Garmin-synkronoinnin tuloksen (päivät ja aktiviteetit id:n mukaan, vanhat säilyvät). */
  saveGarmin(g: GarminData): Promise<void>;
  /** Kirjoittaa kaiken kerralla (tuonti ja siirto laitteelta tilille). */
  importAll(d: StoreData): Promise<void>;
}
