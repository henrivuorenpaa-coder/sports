// Sama malli kuin allowance-appissa: avaimet ympäristömuuttujista, puuttuvat raportoidaan selkeästi.
export const FIREBASE_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

type EnvSource = Record<string, string | undefined>;

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export function getMissingFirebaseEnvVars(env: EnvSource) {
  return FIREBASE_ENV_KEYS.filter((key) => !env[key]);
}

export function getFirebaseSetupState(env: EnvSource) {
  const missing = getMissingFirebaseEnvVars(env);
  return {
    isReady: missing.length === 0,
    missing,
    message: missing.length
      ? `Firebase-asetukset puuttuvat: ${missing.join(", ")}. Lisää ne .env.local-tiedostoon tai Vercelin ympäristömuuttujiin.`
      : "",
  };
}

export function getFirebaseClientConfig(env: EnvSource): FirebaseClientConfig | null {
  if (getMissingFirebaseEnvVars(env).length) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY!,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN!,
    projectId: env.VITE_FIREBASE_PROJECT_ID!,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID!,
    appId: env.VITE_FIREBASE_APP_ID!,
  };
}
