const ROUTING_REGIONS = ["americas", "europe", "asia", "sea"];
const RANKED_SOLO_QUEUE_ID = 420;
const SESSION_GAP_MINUTES = 90;
const MATCH_COUNT = 15;
const CACHE_TTL_MS = 30 * 60 * 1000;
const RIOT_REQUEST_DELAY_MS = 140;
const analysisCache = new Map();
let nextRiotRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRiotSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, nextRiotRequestAt - now);
  nextRiotRequestAt = Math.max(now, nextRiotRequestAt) + RIOT_REQUEST_DELAY_MS;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

function routingRegionFromTagLine(tagLine) {
  const tag = tagLine.trim().toUpperCase();
  const americas = new Set(["NA", "NA1", "BR", "BR1", "LAN", "LA1", "LAS", "LA2"]);
  const europe = new Set(["EUW", "EUW1", "EUNE", "EUN1", "TR", "TR1", "RU", "ME", "ME1"]);
  const asia = new Set(["KR", "JP", "JP1"]);
  const sea = new Set(["OCE", "OC1", "SG", "SG2", "TW", "TW2", "VN", "VN2", "PH", "PH2", "TH", "TH2"]);

  if (americas.has(tag)) return "americas";
  if (europe.has(tag)) return "europe";
  if (asia.has(tag)) return "asia";
  if (sea.has(tag)) return "sea";
  return "americas";
}

function orderedRoutesForTagLine(tagLine) {
  const preferred = routingRegionFromTagLine(tagLine);
  return [preferred, ...ROUTING_REGIONS.filter((route) => route !== preferred)];
}

function kda(match) {
  return match.deaths === 0
    ? match.kills + match.assists
    : (match.kills + match.assists) / match.deaths;
}

function cspm(match) {
  return match.cs / Math.max(1, match.durationSec / 60);
}

function groupSessions(matches, gapMinutes = SESSION_GAP_MINUTES) {
  const sorted = [...matches].sort((a, b) => a.gameEndMs - b.gameEndMs);
  const sessions = [];

  for (const match of sorted) {
    const last = sessions[sessions.length - 1];
    if (last && match.gameEndMs - last.endMs <= gapMinutes * 60 * 1000) {
      last.matches.push(match);
      last.endMs = match.gameEndMs;
    } else {
      sessions.push({
        startMs: match.gameEndMs - match.durationSec * 1000,
        endMs: match.gameEndMs,
        matches: [match],
      });
    }
  }

  return sessions;
}

function analyze(matches, summoner) {
  const sessions = groupSessions(matches);
  const currentSession = sessions[sessions.length - 1] ?? null;
  const recent = [...matches].sort((a, b) => b.gameEndMs - a.gameEndMs);
  let streak = 0;

  if (recent.length) {
    const firstWin = recent[0].win;
    for (const match of recent) {
      if (match.win !== firstWin) break;
      streak++;
    }
    if (!firstWin) streak = -streak;
  }

  const overallWR = matches.length
    ? matches.filter((match) => match.win).length / matches.length
    : 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMatches = matches.filter(
    (match) => match.gameEndMs >= todayStart.getTime()
  );
  const todayWR = todayMatches.length
    ? todayMatches.filter((match) => match.win).length / todayMatches.length
    : overallWR;
  const winRateDelta = (todayWR - overallWR) * 100;
  const sessionsToday = sessions.filter(
    (session) => session.endMs >= todayStart.getTime()
  ).length;

  let csPerMinDelta = 0;
  let kdaDelta = 0;
  let tiltInflectionIndex = null;
  const trend = matches.map((match, index) => ({
    game: index + 1,
    kda: +kda(match).toFixed(2),
    csPerMin: +cspm(match).toFixed(2),
    win: match.win,
    champion: match.champion,
  }));

  if (currentSession && currentSession.matches.length >= 2) {
    const sessionMatches = currentSession.matches;
    const half = Math.floor(sessionMatches.length / 2);
    const first = sessionMatches.slice(0, half);
    const second = sessionMatches.slice(half);
    const avg = (items, fn) =>
      items.reduce((sum, item) => sum + fn(item), 0) / Math.max(1, items.length);
    const csA = avg(first, cspm);
    const csB = avg(second, cspm);
    const kA = avg(first, kda);
    const kB = avg(second, kda);

    csPerMinDelta = csA ? ((csB - csA) / csA) * 100 : 0;
    kdaDelta = kA ? ((kB - kA) / kA) * 100 : 0;

    for (let index = half; index < sessionMatches.length; index++) {
      if (kda(sessionMatches[index]) < kA * 0.7) {
        tiltInflectionIndex = index;
        break;
      }
    }
  }

  let score = 50;
  if (streak <= -3) score += 30 + (Math.abs(streak) - 3) * 10;
  if (csPerMinDelta < -10) score += Math.abs(csPerMinDelta);
  if (kdaDelta < -20) score += Math.abs(kdaDelta) * 0.6;
  if (winRateDelta < -15) score += Math.abs(winRateDelta) * 0.5;
  if (streak >= 2) score -= 20;
  score = Math.max(20, Math.min(120, score));

  const level = score >= 85 ? "red" : score >= 60 ? "yellow" : "green";
  const headline =
    level === "red"
      ? "CRITICAL TILT"
      : level === "yellow"
        ? "WARNING SIGNS"
        : "CLEAR HEAD";

  const parts = [];
  if (streak <= -3) {
    parts.push(`You are on a ${Math.abs(streak)}-match loss streak.`);
  } else if (streak >= 3) {
    parts.push(`You are on a ${streak}-match win streak - ride it.`);
  }
  if (csPerMinDelta < -8) {
    parts.push(
      `Your CS/min has dropped ${Math.abs(csPerMinDelta).toFixed(
        0
      )}% in the second half of this session.`
    );
  }
  if (kdaDelta < -15) {
    parts.push(
      `KDA has fallen ${Math.abs(kdaDelta).toFixed(
        0
      )}% from your session start.`
    );
  }
  if (parts.length === 0) {
    parts.push(
      level === "green"
        ? "No signs of tilt. Your ranked stats are holding steady - keep queuing."
        : "Ranked stats are slipping. Take a short break before your next match."
    );
  }

  const verdict =
    parts.join(" ") +
    (level === "red"
      ? " Immediate logout recommended."
      : level === "yellow"
        ? " Consider a 15-minute break."
        : "");

  return {
    summoner,
    level,
    headline,
    verdict,
    metrics: {
      currentStreak: streak,
      sessionsToday,
      winRateDelta: +winRateDelta.toFixed(1),
      csPerMinDelta: +csPerMinDelta.toFixed(1),
      kdaDelta: +kdaDelta.toFixed(1),
      mentalTempC: Math.round(36 + (score - 50) * 0.6),
    },
    sessions,
    currentSession,
    trend,
    tiltInflectionIndex,
  };
}

async function riotFetch(url, apiKey) {
  await waitForRiotSlot();
  const res = await fetch(url, {
    headers: { "X-Riot-Token": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    const error = new Error(`Riot API error ${res.status}: ${body}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

async function getAccount(gameName, tagLine, apiKey) {
  for (const route of orderedRoutesForTagLine(tagLine)) {
    const url = `https://${route}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName
    )}/${encodeURIComponent(tagLine)}`;

    await waitForRiotSlot();
    const res = await fetch(url, {
      headers: { "X-Riot-Token": apiKey },
    });

    if (res.status === 404) continue;

    if (!res.ok) {
      const body = await res.text();
      const error = new Error(`Riot API error ${res.status}: ${body}`);
      error.status = res.status;
      throw error;
    }

    const account = await res.json();
    return {
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
    };
  }

  const error = new Error("Account doesn't exist.");
  error.status = 404;
  throw error;
}

async function getRankedMatchIds(puuid, route, apiKey) {
  const url = `https://${route}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(
    puuid
  )}/ids?queue=${RANKED_SOLO_QUEUE_ID}&type=ranked&start=0&count=${MATCH_COUNT}`;

  const ids = await riotFetch(url, apiKey);
  return Array.isArray(ids) ? ids : [];
}

async function getMatch(route, matchId, puuid, apiKey) {
  const url = `https://${route}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(
    matchId
  )}`;
  const match = await riotFetch(url, apiKey);
  const participant = match.info.participants.find((p) => p.puuid === puuid);

  if (!participant || match.info.queueId !== RANKED_SOLO_QUEUE_ID) {
    return null;
  }

  const durationSec =
    match.info.gameDuration > 10000
      ? Math.round(match.info.gameDuration / 1000)
      : match.info.gameDuration;
  const gameEndMs =
    match.info.gameEndTimestamp ??
    match.info.gameStartTimestamp + durationSec * 1000;

  return {
    matchId: match.metadata.matchId,
    champion: participant.championName,
    championId: participant.championId,
    win: participant.win,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    cs:
      (participant.totalMinionsKilled ?? 0) +
      (participant.neutralMinionsKilled ?? 0),
    durationSec,
    gameEndMs,
    queue: String(match.info.queueId),
  };
}

async function analyzeRiotPlayer(gameName, tagLine, apiKey) {
  const cacheKey = `${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const account = await getAccount(gameName, tagLine, apiKey);
  const route = routingRegionFromTagLine(account.tagLine);
  const ids = await getRankedMatchIds(account.puuid, route, apiKey);
  const matches = [];

  for (const matchId of ids) {
    const match = await getMatch(route, matchId, account.puuid, apiKey);
    if (match) matches.push(match);
  }

  const uniqueMatches = [...new Map(matches.map((m) => [m.matchId, m])).values()]
    .sort((a, b) => b.gameEndMs - a.gameEndMs)
    .slice(0, MATCH_COUNT)
    .sort((a, b) => a.gameEndMs - b.gameEndMs);

  const result = {
    account,
    analysis: analyze(uniqueMatches, {
      name: account.gameName,
      tag: account.tagLine,
      region: "Ranked Solo/Duo",
    }),
    matchCount: uniqueMatches.length,
    queueId: RANKED_SOLO_QUEUE_ID,
  };

  analysisCache.set(cacheKey, {
    cachedAt: Date.now(),
    result,
  });

  return result;
}

module.exports = {
  analyzeRiotPlayer,
  getAccount,
};
