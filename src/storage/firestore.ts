import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch, type Firestore } from "firebase/firestore";
import type { CoachState, LogEntry, Settings } from "../types.ts";
import type { Store, StoreData } from "./store.ts";

/** Firestore-tallennus polussa `users/{uid}/…`. Security rules sallivat vain oman uid:n. */
export function firestoreStore(db: Firestore, uid: string): Store {
  const base = `users/${uid}`;
  const settingsRef = doc(db, base, "settings", "main");
  const coachRef = doc(db, base, "coach", "last");
  const logCol = collection(db, base, "log");
  return {
    mode: "cloud",
    subscribe(onData, onError) {
      const offs = [
        onSnapshot(logCol, (snap) => onData({ logs: snap.docs.map((d) => d.data() as LogEntry) }), () => onError("Kirjauksia ei voitu ladata.")),
        onSnapshot(settingsRef, (snap) => onData({ settings: snap.exists() ? (snap.data() as Settings) : null }), () => onError("Asetuksia ei voitu ladata.")),
        onSnapshot(coachRef, (snap) => { if (snap.exists()) onData({ coach: snap.data() as CoachState }); }, () => {}),
      ];
      return () => offs.forEach((off) => off());
    },
    saveSettings: (s: Settings) => setDoc(settingsRef, s),
    putLog: (e: LogEntry) => setDoc(doc(logCol, e.id), e),
    removeLog: (id: string) => deleteDoc(doc(logCol, id)),
    saveCoach: (c: CoachState) => setDoc(coachRef, c),
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
