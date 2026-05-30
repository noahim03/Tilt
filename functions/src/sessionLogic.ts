import {
  AnalyzePlayerResponse,
  GameStats,
  Match,
  SessionResult,
} from "./types";

function calcKda(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(1, deaths);
}

function calcCsPerMin(totalMinionsKilled: number, gameDuration: number): number {
  if (gameDuration <= 0) return 0;
  return totalMinionsKilled / (gameDuration / 60);
}

function matchToGameStats(match: Match): GameStats {
  return {
    matchId: match.matchId,
    championName: match.championName,
    win: match.win,
    kda: calcKda(match.kills, match.deaths, match.assists),
    csPerMin: calcCsPerMin(match.totalMinionsKilled, match.gameDuration),
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    visionScore: match.visionScore,
    gameDuration: match.gameDuration,
    gameStartTimestamp: match.gameStartTimestamp,
  };
}

export function groupIntoSessions(
  matches: Match[],
  gapMinutes = 150
): Match[][] {
  if (matches.length === 0) return [];

  const sessions: Match[][] = [];
  let current: Match[] = [matches[0]];

  for (let i = 1; i < matches.length; i++) {
    const previousEnd =
      matches[i - 1].gameStartTimestamp + matches[i - 1].gameDuration * 1000;
    const gap = matches[i].gameStartTimestamp - previousEnd;
    if (gap <= gapMinutes * 60 * 1000) {
      current.push(matches[i]);
    } else {
      sessions.push(current);
      current = [matches[i]];
    }
  }
  sessions.push(current);
  return sessions;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function detectLossStreak(games: GameStats[]): { streak: number; startIndex: number } | null {
  let maxStreak = 0;
  let maxStart = 0;
  let currentStreak = 0;
  let currentStart = 0;

  for (let i = 0; i < games.length; i++) {
    if (!games[i].win) {
      if (currentStreak === 0) currentStart = i;
      currentStreak++;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        maxStart = currentStart;
      }
    } else {
      currentStreak = 0;
    }
  }

  if (maxStreak >= 3) {
    return { streak: maxStreak, startIndex: maxStart };
  }
  return null;
}

function detectTilt(sessionMatches: Match[]): SessionResult {
  const games = sessionMatches.map(matchToGameStats);
  const date = new Date(games[0].gameStartTimestamp).toISOString().split("T")[0];

  const reasons: string[] = [];
  let tiltDetected = false;

  const mid = Math.ceil(games.length / 2);
  const earlyGames = games.slice(0, mid);
  const lateGames = games.slice(mid);

  const earlyKda = avg(earlyGames.map((g) => g.kda));
  const lateKda = lateGames.length > 0 ? avg(lateGames.map((g) => g.kda)) : earlyKda;
  const earlyCs = avg(earlyGames.map((g) => g.csPerMin));
  const lateCs = lateGames.length > 0 ? avg(lateGames.map((g) => g.csPerMin)) : earlyCs;

  if (games.length >= 2) {
    if (earlyKda > 0 && lateKda < earlyKda * 0.8) {
      const dropPct = Math.round(((earlyKda - lateKda) / earlyKda) * 100);
      reasons.push(
        `Your KDA dropped ${dropPct}% in the second half of this session`
      );
      tiltDetected = true;
    }

    if (earlyCs > 0 && lateCs < earlyCs * 0.85) {
      const dropPct = Math.round(((earlyCs - lateCs) / earlyCs) * 100);
      reasons.push(
        `Your CS/min dropped ${dropPct}% in the second half of this session`
      );
      tiltDetected = true;
    }
  }

  const lossStreak = detectLossStreak(games);
  if (lossStreak) {
    reasons.push(
      `You went on a ${lossStreak.streak}-game loss streak in this session`
    );
    tiltDetected = true;
  }

  return {
    date,
    games,
    tiltDetected,
    tiltReason: reasons.length > 0 ? reasons.join(". ") : null,
    kdaTrend: { early: earlyKda, late: lateKda },
    csTrend: { early: earlyCs, late: lateCs },
  };
}

export function processSessions(sessionGroups: Match[][]): SessionResult[] {
  return sessionGroups.map(detectTilt);
}

export function calcOverallTiltRisk(
  sessions: SessionResult[]
): "low" | "medium" | "high" {
  const recent = sessions.slice(0, 3);
  if (recent.length === 0) return "low";

  const tiltCount = recent.filter((s) => s.tiltDetected).length;
  if (tiltCount >= 2) return "high";
  if (tiltCount === 1) return "medium";
  return "low";
}

export function buildResponse(
  summonerName: string,
  region: string,
  sessionGroups: Match[][]
): AnalyzePlayerResponse {
  const sessions = processSessions([...sessionGroups].reverse());
  return {
    summonerName,
    region,
    sessions,
    overallTiltRisk: calcOverallTiltRisk(sessions),
  };
}
