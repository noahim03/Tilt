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

export interface Match {
  matchId: string;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  visionScore: number;
  gameDuration: number;
  gameStartTimestamp: number;
}

export type Region =
  | "BR"
  | "EUNE"
  | "EUW"
  | "JP"
  | "KR"
  | "LAN"
  | "LAS"
  | "ME"
  | "NA"
  | "OCE"
  | "RU"
  | "SG"
  | "TR"
  | "TW"
  | "VN";

export const PLATFORM_MAP: Record<Region, string> = {
  BR: "br1",
  EUNE: "eun1",
  NA: "na1",
  EUW: "euw1",
  JP: "jp1",
  KR: "kr",
  LAN: "la1",
  LAS: "la2",
  ME: "me1",
  OCE: "oc1",
  RU: "ru",
  SG: "sg2",
  TR: "tr1",
  TW: "tw2",
  VN: "vn2",
};

export const REGIONAL_MAP: Record<Region, string> = {
  BR: "americas",
  EUNE: "europe",
  NA: "americas",
  EUW: "europe",
  JP: "asia",
  KR: "asia",
  LAN: "americas",
  LAS: "americas",
  ME: "europe",
  OCE: "sea",
  RU: "europe",
  SG: "sea",
  TR: "europe",
  TW: "sea",
  VN: "sea",
};
