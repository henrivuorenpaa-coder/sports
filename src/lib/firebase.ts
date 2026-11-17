import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type Auth, type User } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { getFirebaseClientConfig, getFirebaseSetupState } from "./firebase-env.ts";

const env = import.meta.env as Record<string, string | undefined>;
export const firebaseSetup = getFirebaseSetupState(env);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function init() {
  if (app) return true;
  const config = getFirebaseClientConfig(env);
  if (!config) return false;
  app = getApps()[0] ?? initializeApp(config);
  auth = getAuth(app);
  // Offline-välimuisti: sovellus toimii PWA:na myös ilman verkkoa ja synkronoi myöhemmin.
  db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  return true;
}

export function getFirebaseDb() {
  return init() ? db : null;
}

export function watchUser(cb: (user: User | null) => void) {
  if (!init() || !auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle() {
  if (!init() || !auth) throw new Error(firebaseSetup.message);
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // Kotinäytön PWA (erityisesti iOS) estää usein ponnahdusikkunat → uudelleenohjaus.
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
    } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
      throw e;
    }
  }
}

export async function signOutUser() {
  if (auth) await signOut(auth);
}
