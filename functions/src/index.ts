import "./env";
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {
  fetchAllMatches,
  getMatchIds,
  normalizeRegion,
  resolveSummoner,
  searchSummonerSuggestions,
} from "./riotApi";
import { buildResponse, groupIntoSessions } from "./sessionLogic";
import { AnalyzePlayerResponse, Region } from "./types";

admin.initializeApp();
const db = admin.firestore();

const CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MATCH_COUNT = 100;
const functionRuntime = functions.runWith({
  memory: "512MB",
  timeoutSeconds: 120,
  secrets: ["RIOT_API_KEY"],
});

interface AnalyzePlayerPayload {
  summonerName?: string;
  region?: string;
  matchCount?: number;
  forceRefresh?: boolean;
}

interface SearchSummonerPayload {
  query?: string;
  region?: string;
}

function getApiKey(): string {
  const key = process.env.RIOT_API_KEY;
  if (!key) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Riot API key not configured. Set RIOT_API_KEY in .env/functions.env (local) or Firebase secrets (production)."
    );
  }
  return key;
}

function toHttpsError(err: unknown): functions.https.HttpsError {
  if (err instanceof functions.https.HttpsError) return err;

  const message = err instanceof Error ? err.message : "Unknown error";
  if (message.includes("No player found") || message.includes("Summoner not found")) {
    return new functions.https.HttpsError("not-found", message);
  }
  if (message.includes("Multiple players found")) {
    return new functions.https.HttpsError("invalid-argument", message);
  }
  if (message.includes("Riot API error 403") || message.includes("Riot API error 401")) {
    return new functions.https.HttpsError(
      "failed-precondition",
      "Riot API key expired or invalid. Update RIOT_API_KEY in .env/functions.env."
    );
  }
  if (message.includes("Riot API error 404")) {
    return new functions.https.HttpsError("not-found", "Riot data was not found for this player.");
  }
  if (message.includes("Riot API error 429")) {
    return new functions.https.HttpsError(
      "resource-exhausted",
      "Riot API rate limit hit. Wait a minute and try again."
    );
  }
  if (message.includes("Unsupported League region")) {
    return new functions.https.HttpsError("invalid-argument", message);
  }
  return new functions.https.HttpsError("internal", message);
}

async function analyzePlayerHandler(data: unknown) {
  const { summonerName, region, matchCount, forceRefresh } =
    data as AnalyzePlayerPayload;

  if (!summonerName || typeof summonerName !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "summonerName is required"
    );
  }
  if (region !== undefined && typeof region !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "region must be a string when provided"
    );
  }

  const normalizedRegion: Region | undefined = region
    ? normalizeRegion(region)
    : undefined;
  const count =
    typeof matchCount === "number" && Number.isFinite(matchCount)
      ? Math.min(Math.max(Math.round(matchCount), 1), DEFAULT_MATCH_COUNT)
      : DEFAULT_MATCH_COUNT;

  const apiKey = getApiKey();
  const summoner = await resolveSummoner(
    summonerName.trim(),
    apiKey,
    normalizedRegion
  );
  const { puuid } = summoner;
  const analysisRegion = normalizedRegion ?? summoner.region;

  const cacheRef = db.collection("summoners").doc(`${analysisRegion}_${puuid}_${count}`);
  const cached = await cacheRef.get();

  if (!forceRefresh && cached.exists) {
    const cacheData = cached.data()!;
    const age = Date.now() - cacheData.cachedAt;
    if (age < CACHE_TTL_MS) {
      return cacheData.result as AnalyzePlayerResponse;
    }
  }

  const matchIds = await getMatchIds(puuid, analysisRegion, apiKey, count);
  const matches = await fetchAllMatches(matchIds, analysisRegion, apiKey, puuid);

  matches.reverse();

  const sessionGroups = groupIntoSessions(matches);
  const result = buildResponse(
    `${summoner.gameName}#${summoner.tagLine}`,
    analysisRegion,
    sessionGroups
  );

  await cacheRef.set({
    result,
    cachedAt: Date.now(),
  });

  return result;
}

async function searchSummonerHandler(data: unknown) {
  const { query, region } = data as SearchSummonerPayload;

  if (!query || typeof query !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "query is required"
    );
  }
  if (region !== undefined && typeof region !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "region must be a string when provided"
    );
  }

  const apiKey = getApiKey();
  const suggestions = await searchSummonerSuggestions(
    query.trim(),
    apiKey,
    region
  );
  return { suggestions };
}

function wrapHandler<T>(handler: (data: unknown) => Promise<T>) {
  return async (data: unknown) => {
    try {
      return await handler(data);
    } catch (err) {
      throw toHttpsError(err);
    }
  };
}

export const analyzePlayer = functionRuntime.https.onCall(
  wrapHandler(analyzePlayerHandler)
);

export const searchSummoner = functionRuntime.https.onCall(
  wrapHandler(searchSummonerHandler)
);
