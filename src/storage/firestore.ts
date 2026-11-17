import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch, type Firestore } from "firebase/firestore";
import type { CoachState, GarminActivity, GarminData, GarminDay, GarminZones, LogEntry, Settings } from "../types.ts";
import type { Store, StoreData } from "./store.ts";

/** Firestore-tallennus polussa `users/{uid}/…`. Security rules sallivat vain oman uid:n. */
export function firestoreStore(db: Firestore, uid: string): Store {
  const base = `users/${uid}`;
  const settingsRef = doc(db, base, "settings", "main");
  const coachRef = doc(db, base, "coach", "last");
  const logCol = collection(db, base, "log");
  // Garmin: `garmin/meta` (zones, syncedAt), `garmin/day-YYYY-MM-DD`, `garmin/act-<id>`.
  const garminCol = collection(db, base, "garmin");
  return {
    mode: "cloud",
    subscribe(onData, onError) {
      const offs = [
        onSnapshot(logCol, (snap) => onData({ logs: snap.docs.map((d) => d.data() as LogEntry) }), () => onError("Kirjauksia ei voitu ladata.")),
        onSnapshot(settingsRef, (snap) => onData({ settings: snap.exists() ? (snap.data() as Settings) : null }), () => onError("Asetuksia ei voitu ladata.")),
        onSnapshot(coachRef, (snap) => { if (snap.exists()) onData({ coach: snap.data() as CoachState }); }, () => {}),
        onSnapshot(garminCol, (snap) => {
          const g: GarminData = { days: [], activities: [], zones: null, syncedAt: null };
          for (const d of snap.docs) {
            if (d.id === "meta") { const m = d.data() as { zones?: GarminZones; syncedAt?: string }; g.zones = m.zones ?? null; g.syncedAt = m.syncedAt ?? null; }
            else if (d.id.startsWith("day-")) g.days.push(d.data() as GarminDay);
            else if (d.id.startsWith("act-")) g.activities.push(d.data() as GarminActivity);
          }
          g.days.sort((a, b) => (a.date < b.date ? -1 : 1));
          onData({ garmin: g });
        }, () => {}),
      ];
      return () => offs.forEach((off) => off());
    },
    saveSettings: (s: Settings) => setDoc(settingsRef, s),
    putLog: (e: LogEntry) => setDoc(doc(logCol, e.id), e),
    removeLog: (id: string) => deleteDoc(doc(logCol, id)),
    saveCoach: (c: CoachState) => setDoc(coachRef, c),
    async saveGarmin(g: GarminData) {
      const b = writeBatch(db);
      b.set(doc(garminCol, "meta"), { zones: g.zones, syncedAt: g.syncedAt });
      for (const d of g.days) b.set(doc(garminCol, `day-${d.date}`), d);
      for (const a of g.activities) b.set(doc(garminCol, `act-${a.id}`), a);
      await b.commit();
    },
    async importAll(d: StoreData) {
      // Firestore-erä on enintään 500 kirjoitusta; jaetaan osiin.
      const writes: [ReturnType<typeof doc>, object][] = [];
      if (d.settings) writes.push([settingsRef, d.settings]);
      if (d.coach) writes.push([coachRef, d.coach]);
      for (const l of d.logs) writes.push([doc(logCol, l.id), l]);
      for (let i = 0; i < writes.length; i += 450) {
        const b = writeBatch(db);
        for (const [ref, v] of writes.slice(i, i + 450)) b.set(ref, v);
        await b.commit();
      }
    },
  };
}
