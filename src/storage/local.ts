import type { CoachState, GarminData, LogEntry, Settings } from "../types.ts";
import type { Store, StoreData } from "./store.ts";

// Sama avain kuin Askel 5K -artefaktissa, jotta selaimeen tallennetut tiedot säilyvät.
const LS = "askel5k.v3";

export function readLocal(): StoreData {
  const out: StoreData = { settings: null, logs: [], coach: null };
  try {
    const j = JSON.parse(localStorage.getItem(LS) || "null");
    if (j) { out.settings = j.settings || null; out.logs = j.logs || []; }
    const c = JSON.parse(localStorage.getItem(LS + ".coach") || "null");
    if (c) out.coach = c;
  } catch { /* tyhjä tai estetty tallennus */ }
  return out;
}

export const hasLocalData = () => {
  const d = readLocal();
  return !!d.settings || d.logs.length > 0;
};

export function clearLocal() {
  try { localStorage.removeItem(LS); localStorage.removeItem(LS + ".coach"); } catch { /* ohitetaan */ }
}

export function localStore(): Store {
  let data = readLocal();
  let emit: (p: Partial<StoreData>) => void = () => {};
  const persist = () => {
    try { localStorage.setItem(LS, JSON.stringify({ settings: data.settings, logs: data.logs })); } catch { /* ohitetaan */ }
  };
  return {
    mode: "local",
    subscribe(onData) {
      emit = onData;
      onData(data);
      return () => { emit = () => {}; };
    },
    async saveSettings(s: Settings) { data.settings = s; persist(); emit({ settings: s }); },
    async putLog(e: LogEntry) {
      data.logs = data.logs.filter((l) => l.id !== e.id).concat(e);
      persist(); emit({ logs: data.logs });
    },
    async removeLog(id: string) {
      data.logs = data.logs.filter((l) => l.id !== id);
      persist(); emit({ logs: data.logs });
    },
    async saveCoach(c: CoachState) {
      data.coach = c;
      try { localStorage.setItem(LS + ".coach", JSON.stringify(c)); } catch { /* ohitetaan */ }
    },
    // Garmin-synkronointi vaatii kirjautumisen, joten paikallinen tila ei tallenna sitä.
    async saveGarmin(_g: GarminData) {},
    async importAll(d: StoreData) {
      data = { ...d };
      persist();
      if (d.coach) await this.saveCoach(d.coach);
      emit(data);
    },
  };
}
