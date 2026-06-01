export type MatchSummary = {
  matchId: string;
  champion: string;
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSec: number;
  gameEndMs: number;
  queue: string;
};

export type Session = {
  startMs: number;
  endMs: number;
  matches: MatchSummary[];
};

export type TiltLevel = "green" | "yellow" | "red";

export type TiltAnalysis = {
  summoner: { name: string; tag: string; region: string };
  level: TiltLevel;
  headline: string;
  verdict: string;
  metrics: {
    currentStreak: number; // negative = losses, positive = wins
    gamesToday: number;
    winRateDelta: number; // percentage diff vs overall
    csPerMinDelta: number;
    kdaDelta: number;
    mentalTempC: number;
  };
  sessions: Session[];
  currentSession: Session | null;
  trend: { game: number; kda: number; csPerMin: number; win: boolean; champion: string }[];
  tiltInflectionIndex: number | null;
};

export const REGIONS = [
  { value: "na1", label: "NA1", routing: "americas" },
  { value: "euw1", label: "EUW", routing: "europe" },
  { value: "eun1", label: "EUNE", routing: "europe" },
  { value: "kr", label: "KR", routing: "asia" },
  { value: "br1", label: "BR", routing: "americas" },
  { value: "jp1", label: "JP", routing: "asia" },
  { value: "la1", label: "LAN", routing: "americas" },
  { value: "la2", label: "LAS", routing: "americas" },
  { value: "oc1", label: "OCE", routing: "sea" },
  { value: "tr1", label: "TR", routing: "europe" },
  { value: "ru", label: "RU", routing: "europe" },
] as const;

export type RegionValue = (typeof REGIONS)[number]["value"];

// Group matches into sessions: gap > 60 min => new session
export function groupSessions(matches: MatchSummary[], gapMinutes = 60): Session[] {
  const sorted = [...matches].sort((a, b) => a.gameEndMs - b.gameEndMs);
  const sessions: Session[] = [];
  for (const m of sorted) {
    const last = sessions[sessions.length - 1];
    if (last && m.gameEndMs - last.endMs <= gapMinutes * 60 * 1000) {
      last.matches.push(m);
      last.endMs = m.gameEndMs;
    } else {
      sessions.push({ startMs: m.gameEndMs - m.durationSec * 1000, endMs: m.gameEndMs, matches: [m] });
    }
  }
  return sessions;
}

const kda = (m: MatchSummary) => (m.deaths === 0 ? m.kills + m.assists : (m.kills + m.assists) / m.deaths);
const cspm = (m: MatchSummary) => m.cs / (m.durationSec / 60);

export function analyze(
  matches: MatchSummary[],
  summoner: { name: string; tag: string; region: string },
): TiltAnalysis {
  const sessions = groupSessions(matches);
  const currentSession = sessions[sessions.length - 1] ?? null;

  // streak from most recent backwards
  let streak = 0;
  const recent = [...matches].sort((a, b) => b.gameEndMs - a.gameEndMs);
  if (recent.length) {
    const firstWin = recent[0].win;
    for (const m of recent) {
      if (m.win === firstWin) streak++;
      else break;
    }
    if (!firstWin) streak = -streak;
  }

  const overallWR = matches.length ? matches.filter((m) => m.win).length / matches.length : 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMatches = matches.filter((m) => m.gameEndMs >= todayStart.getTime());
  const todayWR = todayMatches.length ? todayMatches.filter((m) => m.win).length / todayMatches.length : overallWR;
  const winRateDelta = (todayWR - overallWR) * 100;
  const gamesToday = todayMatches.length;

  let csPerMinDelta = 0;
  let kdaDelta = 0;
  let tiltInflectionIndex: number | null = null;
  const trend: TiltAnalysis["trend"] = matches.map((m, i) => ({
    game: i + 1,
    kda: +kda(m).toFixed(2),
    csPerMin: +cspm(m).toFixed(2),
    win: m.win,
    champion: m.champion,
  }));

  if (currentSession && currentSession.matches.length >= 2) {
    const sm = currentSession.matches;
    const half = Math.floor(sm.length / 2);
    const first = sm.slice(0, half);
    const second = sm.slice(half);
    const avg = (arr: MatchSummary[], fn: (m: MatchSummary) => number) =>
      arr.reduce((s, m) => s + fn(m), 0) / Math.max(1, arr.length);
    const csA = avg(first, cspm);
    const csB = avg(second, cspm);
    const kA = avg(first, kda);
    const kB = avg(second, kda);
    csPerMinDelta = csA ? ((csB - csA) / csA) * 100 : 0;
    kdaDelta = kA ? ((kB - kA) / kA) * 100 : 0;

    // inflection = first index in second half where kda < kA
    for (let i = half; i < sm.length; i++) {
      if (kda(sm[i]) < kA * 0.7) {
        tiltInflectionIndex = i;
        break;
      }
    }
  }

  // Scoring to tilt level
  let score = 50;
  if (streak <= -3) score += 30 + (Math.abs(streak) - 3) * 10;
  if (csPerMinDelta < -10) score += Math.abs(csPerMinDelta);
  if (kdaDelta < -20) score += Math.abs(kdaDelta) * 0.6;
  if (winRateDelta < -15) score += Math.abs(winRateDelta) * 0.5;
  if (streak >= 2) score -= 20;
  score = Math.max(20, Math.min(120, score));

  let level: TiltLevel = "green";
  if (score >= 85) level = "red";
  else if (score >= 60) level = "yellow";

  const headline =
    level === "red"
      ? "CRITICAL TILT"
      : level === "yellow"
        ? "WARNING SIGNS"
        : "CLEAR HEAD";

  const parts: string[] = [];
  if (streak <= -3) parts.push(`You are on a ${Math.abs(streak)}-match loss streak.`);
  else if (streak >= 3) parts.push(`You are on a ${streak}-match win streak - ride it.`);
  if (csPerMinDelta < -8)
    parts.push(`Your CS/min has dropped ${Math.abs(csPerMinDelta).toFixed(0)}% in the second half of this session.`);
  if (kdaDelta < -15) parts.push(`KDA has fallen ${Math.abs(kdaDelta).toFixed(0)}% from your session start.`);
  if (parts.length === 0) {
    parts.push(
      level === "green"
        ? "No signs of tilt. Your stats are holding steady - keep queuing."
        : "Stats are slipping. Take a short break before your next match.",
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
      gamesToday,
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
