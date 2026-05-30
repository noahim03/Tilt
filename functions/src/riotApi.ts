import { Match, PLATFORM_MAP, REGIONAL_MAP, Region } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ACCOUNT_HOST = "americas.api.riotgames.com";
const MAX_MATCH_COUNT = 100;

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface SummonerSuggestion {
  riotId: string;
  gameName: string;
  tagLine: string;
  region: Region;
  puuid: string;
}

export function parseRiotId(
  input: string
): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim();
  const hashIndex = trimmed.indexOf("#");
  if (hashIndex <= 0 || hashIndex === trimmed.length - 1) return null;
  return {
    gameName: trimmed.slice(0, hashIndex),
    tagLine: trimmed.slice(hashIndex + 1),
  };
}

export function formatRiotId(gameName: string, tagLine: string): string {
  return `${gameName}#${tagLine}`;
}

export function normalizeRegion(region: string): Region {
  const compact = region.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, Region> = {
    BR: "BR",
    BR1: "BR",
    EUN: "EUNE",
    EUNE: "EUNE",
    EUN1: "EUNE",
    EUW: "EUW",
    EUW1: "EUW",
    JP: "JP",
    JP1: "JP",
    KR: "KR",
    LAN: "LAN",
    LA1: "LAN",
    LAS: "LAS",
    LA2: "LAS",
    ME: "ME",
    ME1: "ME",
    NA: "NA",
    NA1: "NA",
    OC: "OCE",
    OCE: "OCE",
    OC1: "OCE",
    PH: "SG",
    PH2: "SG",
    RU: "RU",
    RU1: "RU",
    SG: "SG",
    SG2: "SG",
    TH: "SG",
    TH2: "SG",
    TR: "TR",
    TR1: "TR",
    TW: "TW",
    TW2: "TW",
    VN: "VN",
    VN2: "VN",
  };

  const normalized = aliases[compact];
  if (!normalized) {
    throw new Error(`Unsupported League region: ${region}`);
  }
  return normalized;
}

function platformToRegion(platform: string): Region {
  const value = platform.toLowerCase();
  const match = Object.entries(PLATFORM_MAP).find(
    ([, platformId]) => platformId === value
  );
  if (!match) {
    throw new Error(`Unsupported League region: ${platform}`);
  }
  return match[0] as Region;
}

async function riotFetch(url: string, apiKey: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "X-Riot-Token": apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    const error = new Error(`Riot API error ${res.status}: ${body}`);
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return res;
}

export async function getAccountByRiotId(
  gameName: string,
  tagLine: string,
  apiKey: string
): Promise<RiotAccount | null> {
  const url = `https://${ACCOUNT_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await fetch(url, {
    headers: { "X-Riot-Token": apiKey },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    const error = new Error(`Riot API error ${res.status}: ${body}`);
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  const data = await res.json();
  return {
    puuid: data.puuid,
    gameName: data.gameName,
    tagLine: data.tagLine,
  };
}

export async function getPlayerRegion(
  puuid: string,
  apiKey: string
): Promise<Region> {
  const url = `https://${ACCOUNT_HOST}/riot/account/v1/region/by-game/lol/by-puuid/${puuid}`;
  const res = await riotFetch(url, apiKey);
  const data = await res.json();
  return platformToRegion(data.region);
}

const DEFAULT_PROBE_TAGS = [
  "NA1",
  "EUW1",
  "EUN1",
  "KR",
  "BR1",
  "JP1",
  "LA1",
  "LA2",
  "OC1",
  "TR1",
];

async function accountToSuggestion(
  account: RiotAccount,
  apiKey: string,
  preferredRegion?: Region
): Promise<SummonerSuggestion> {
  const region = preferredRegion ?? (await getPlayerRegion(account.puuid, apiKey));
  return {
    riotId: formatRiotId(account.gameName, account.tagLine),
    gameName: account.gameName,
    tagLine: account.tagLine,
    region,
    puuid: account.puuid,
  };
}

async function searchByGameName(
  gameName: string,
  apiKey: string,
  preferredRegion?: Region
): Promise<SummonerSuggestion[]> {
  const trimmed = gameName.trim();
  if (trimmed.length < 2) return [];

  const found = new Map<string, SummonerSuggestion>();
  const probeTags = preferredRegion
    ? [PLATFORM_MAP[preferredRegion].toUpperCase(), preferredRegion]
    : DEFAULT_PROBE_TAGS;

  await Promise.all(
    [...new Set(probeTags)].map(async (tag) => {
      const account = await getAccountByRiotId(trimmed, tag, apiKey);
      if (!account) return;
      if (account.gameName.toLowerCase() !== trimmed.toLowerCase()) return;
      const suggestion = await accountToSuggestion(account, apiKey, preferredRegion);
      found.set(account.puuid, suggestion);
    })
  );

  return [...found.values()];
}

export async function resolveSummoner(
  input: string,
  apiKey: string,
  preferredRegion?: string
): Promise<SummonerSuggestion> {
  const trimmed = input.trim();
  const region = preferredRegion ? normalizeRegion(preferredRegion) : undefined;
  const parsed = parseRiotId(trimmed);

  if (parsed) {
    const account = await getAccountByRiotId(
      parsed.gameName,
      parsed.tagLine,
      apiKey
    );
    if (!account) {
      throw new Error(`No player found for ${formatRiotId(parsed.gameName, parsed.tagLine)}`);
    }
    return accountToSuggestion(account, apiKey, region);
  }

  const matches = await searchByGameName(trimmed, apiKey, region);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Multiple players found for "${trimmed}". Select one from the list.`
    );
  }
  throw new Error(
    `No player found with the name "${trimmed}". Check the spelling on your LoL profile.`
  );
}

export async function searchSummonerSuggestions(
  query: string,
  apiKey: string,
  preferredRegion?: string
): Promise<SummonerSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const region = preferredRegion ? normalizeRegion(preferredRegion) : undefined;

  const parsed = parseRiotId(trimmed);
  if (parsed) {
    const account = await getAccountByRiotId(
      parsed.gameName,
      parsed.tagLine,
      apiKey
    );
    if (!account) return [];
    return [await accountToSuggestion(account, apiKey, region)];
  }

  return searchByGameName(trimmed, apiKey, region);
}

export async function getMatchIds(
  puuid: string,
  region: Region,
  apiKey: string,
  count = 100
): Promise<string[]> {
  const regional = REGIONAL_MAP[region];
  const safeCount = Math.min(Math.max(count, 1), MAX_MATCH_COUNT);
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=${safeCount}`;
  const res = await riotFetch(url, apiKey);
  return res.json();
}

interface RiotMatchParticipant {
  puuid: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  visionScore: number;
  win: boolean;
  championName: string;
}

interface RiotMatchInfo {
  gameDuration: number;
  gameStartTimestamp: number;
}

interface RiotMatchResponse {
  info: RiotMatchInfo & { participants: RiotMatchParticipant[] };
}

export async function fetchMatch(
  matchId: string,
  region: Region,
  apiKey: string,
  puuid: string
): Promise<Match> {
  const regional = REGIONAL_MAP[region];
  const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const res = await riotFetch(url, apiKey);
  const data: RiotMatchResponse = await res.json();

  const participant = data.info.participants.find((p) => p.puuid === puuid);
  if (!participant) {
    throw new Error(`Player not found in match ${matchId}`);
  }

  return {
    matchId,
    championName: participant.championName,
    win: participant.win,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    totalMinionsKilled: participant.totalMinionsKilled,
    visionScore: participant.visionScore,
    gameDuration: data.info.gameDuration,
    gameStartTimestamp: data.info.gameStartTimestamp,
  };
}

export async function fetchAllMatches(
  matchIds: string[],
  region: Region,
  apiKey: string,
  puuid: string
): Promise<Match[]> {
  const matches: Match[] = [];
  for (const matchId of matchIds) {
    const data = await fetchMatch(matchId, region, apiKey, puuid);
    matches.push(data);
    await sleep(60);
  }
  return matches;
}
