import { initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const requiredEnvVars = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

for (const key of requiredEnvVars) {
  if (!import.meta.env[key]) {
    throw new Error(
      `Missing ${key}. Copy .env/client.env.example to .env/client.env and fill in your Firebase config.`
    );
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export interface GameStats {
  matchId: string;
  championName: string;
  win: boolean;
  kda: number;
  csPerMin: number;
  kills: number;
  deaths: number;
  assists: number;
  visionScore: number;
  gameDuration: number;
  gameStartTimestamp: number;
}

export interface SessionResult {
  date: string;
  games: GameStats[];
  tiltDetected: boolean;
  tiltReason: string | null;
  kdaTrend: { early: number; late: number };
  csTrend: { early: number; late: number };
}

export interface AnalyzePlayerResponse {
  summonerName: string;
  region: string;
  sessions: SessionResult[];
  overallTiltRisk: "low" | "medium" | "high";
}

export type Region = "NA" | "EUW" | "KR";

export interface SummonerSuggestion {
  riotId: string;
  gameName: string;
  tagLine: string;
  region: string;
  puuid: string;
}
