import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { functions, type AnalyzePlayerResponse, type SummonerSuggestion } from "./firebase";
import { REGIONS, type MatchSummary, type RegionValue, type Session, type TiltAnalysis, type TiltLevel } from "./lib/tilt";

const TILT_STYLES: Record<
  TiltLevel,
  { ring: string; text: string; dot: string; bg: string; label: string }
> = {
  red: {
    ring: "border-tilt-red/40",
    text: "text-tilt-red",
    dot: "bg-tilt-red shadow-[0_0_12px_color-mix(in_oklab,var(--tilt-red)_60%,transparent)]",
    bg: "bg-tilt-red",
    label: "CRITICAL",
  },
  yellow: {
    ring: "border-tilt-yellow/40",
    text: "text-tilt-yellow",
    dot: "bg-tilt-yellow shadow-[0_0_12px_color-mix(in_oklab,var(--tilt-yellow)_60%,transparent)]",
    bg: "bg-tilt-yellow",
    label: "WARNING",
  },
  green: {
    ring: "border-tilt-green/40",
    text: "text-tilt-green",
    dot: "bg-tilt-green shadow-[0_0_12px_color-mix(in_oklab,var(--tilt-green)_60%,transparent)]",
    bg: "bg-tilt-green",
    label: "STABLE",
  },
};

const DEFAULT_REGION: RegionValue = "na1";

export default function App() {
  const [riotId, setRiotId] = useState("");
  const [region, setRegion] = useState<RegionValue>(DEFAULT_REGION);
  const [analysis, setAnalysis] = useState<TiltAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<SummonerSuggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = riotId.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const searchSummoner = httpsCallable(functions, "searchSummoner");
        const result = await searchSummoner({ query, region });
        const data = result.data as { suggestions: SummonerSuggestion[] };
        setSuggestions(data.suggestions);
        setActiveSuggestion(0);
        setSuggestionsOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [riotId, region]);

  useEffect(() => {
    const closeSuggestions = (event: MouseEvent) => {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(event.target as Node)
      ) {
        setSuggestionsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeSuggestions);
    return () => document.removeEventListener("mousedown", closeSuggestions);
  }, []);

  const selectSuggestion = (suggestion: SummonerSuggestion) => {
    setRiotId(suggestion.riotId);
    const suggestionRegion = regionValueFromLabel(suggestion.region);
    setRegion(suggestionRegion);
    setSuggestionsOpen(false);
    void runAnalysis(suggestion.riotId, suggestionRegion);
  };

  const runAnalysis = async (
    value = riotId,
    selectedRegion: RegionValue = region
  ) => {
    const summonerName = value.trim();
    if (!summonerName) return;

    setLoading(true);
    setError(null);
    setSuggestionsOpen(false);

    try {
      const analyzePlayer = httpsCallable(functions, "analyzePlayer");
      const result = await analyzePlayer({
        summonerName,
        region: selectedRegion,
        matchCount: 100,
      });
      setAnalysis(toTiltAnalysis(result.data as AnalyzePlayerResponse));
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string; message?: string };
      if (firebaseErr.code === "functions/unavailable") {
        setError("Backend unavailable. Run npm run dev from the project root.");
      } else {
        setError(firebaseErr.message ?? "Could not analyze this Riot ID.");
      }
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestionsOpen && suggestions[activeSuggestion]) {
      selectSuggestion(suggestions[activeSuggestion]);
      return;
    }
    void runAnalysis();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestionsOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((index) =>
        index === 0 ? suggestions.length - 1 : index - 1
      );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-display selection:bg-tilt-red/30">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-tilt-red rounded-sm flex items-center justify-center font-bold text-background tracking-tighter italic">
              TD
            </div>
            <span className="font-bold tracking-tight text-lg uppercase">
              Tilt Detector
            </span>
          </div>

          <form
            onSubmit={onSubmit}
            className="flex items-center gap-1 bg-black/40 border border-border p-1 rounded-md"
          >
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as RegionValue)}
              className="bg-transparent px-2 py-1.5 text-xs font-mono text-muted-foreground uppercase tracking-widest outline-none cursor-pointer"
              disabled={loading}
              aria-label="Region"
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value} className="bg-background">
                  {r.label}
                </option>
              ))}
            </select>

            <div className="relative" ref={searchWrapRef}>
              <input
                type="text"
                value={riotId}
                onChange={(e) => {
                  setRiotId(e.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onKeyDown={handleInputKeyDown}
                placeholder="GAMENAME#TAG"
                spellCheck={false}
                disabled={loading}
                className="bg-transparent px-3 py-1.5 text-sm font-mono outline-none w-44 sm:w-56 focus:w-64 transition-all uppercase placeholder:text-muted-foreground/60"
              />

              {suggestionsOpen &&
                riotId.trim().length >= 2 &&
                (searching || suggestions.length > 0) && (
                  <div className="absolute top-[calc(100%+0.35rem)] right-0 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-sm border border-zinc-950 bg-zinc-800 shadow-2xl">
                    <div className="border-b border-zinc-950 bg-zinc-900/60 px-3 py-2 text-xs font-extrabold">
                      Summoner Profiles
                    </div>
                    {searching && (
                      <div className="px-3 py-3 text-xs font-mono text-muted-foreground">
                        Searching...
                      </div>
                    )}
                    {!searching &&
                      suggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.puuid}
                          type="button"
                          onMouseEnter={() => setActiveSuggestion(index)}
                          onClick={() => selectSuggestion(suggestion)}
                          className={`flex w-full items-center gap-3 border-b border-zinc-950 px-3 py-2 text-left last:border-b-0 ${
                            activeSuggestion === index
                              ? "bg-zinc-700/70"
                              : "bg-transparent hover:bg-zinc-700/60"
                          }`}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-black text-sm font-extrabold text-white">
                            {suggestion.gameName.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-extrabold text-tilt-red">
                              {suggestion.gameName}
                              <span className="ml-1 text-zinc-400">
                                #{suggestion.tagLine}
                              </span>
                            </span>
                            <span className="block text-[11px] font-mono uppercase text-zinc-400">
                              {suggestion.region}
                            </span>
                          </span>
                        </button>
                      ))}
                  </div>
                )}
            </div>

            <button
              type="submit"
              disabled={loading || !riotId.trim()}
              className="bg-foreground text-background px-4 py-1.5 text-xs font-bold uppercase tracking-tight hover:bg-white transition-colors cursor-pointer rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Scanning..." : "Analyze"}
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {!analysis && !loading && <EmptyState error={error} />}
        {loading && <SkeletonState />}
        {analysis && <Diagnostics analysis={analysis} />}
      </main>

      <footer className="border-t border-border mt-12 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-8">
            <FooterStat label="Data Source" value="RIOT GAMES API v5" />
            <FooterStat label="Analysis Model" value="TILT-BETA-0.4" />
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.3em] text-center">
            Tilt Detector isn't endorsed by Riot Games.
          </div>
        </div>
      </footer>
    </div>
  );
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <section className="animate-reveal">
      <div className="relative overflow-hidden bg-zinc-900/50 border border-border rounded-xl p-8 md:p-12">
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4 block">
            Session Analysis Verdict
          </span>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 text-balance leading-none">
            ARE YOU <span className="text-tilt-red italic">TILTING</span>?
          </h1>
          <p className="text-lg text-zinc-400 text-pretty leading-relaxed mb-6 border-l-2 border-tilt-red/50 pl-6">
            Drop your Riot ID above and we'll scan your last 100 matches. We
            group them into sessions, track KDA and CS/min degradation, and tell
            you in plain English whether to keep queuing or log off before you
            bleed more LP.
          </p>
          {error && (
            <div className="mt-4 inline-flex items-center gap-2 border border-tilt-red/50 bg-tilt-red/10 text-tilt-red px-4 py-2 rounded-md font-mono text-xs">
              <span className="size-1.5 rounded-full bg-tilt-red animate-pulse-slow" />
              {error}
            </div>
          )}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
            {[
              { k: "Format", v: "Name#TAG" },
              { k: "Example", v: "Faker#KR1" },
              { k: "Region", v: "Pick yours" },
            ].map((x) => (
              <div key={x.k} className="bg-black/40 border border-border p-3 rounded-lg">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                  {x.k}
                </div>
                <div className="text-sm font-bold font-mono">{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SkeletonState() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-80 bg-zinc-900/40 border border-border rounded-xl" />
      <div className="h-24 bg-zinc-900/40 border border-border rounded-xl" />
      <div className="grid md:grid-cols-3 gap-8">
        <div className="h-64 bg-zinc-900/40 border border-border rounded-xl md:col-span-2" />
        <div className="h-64 bg-zinc-900/40 border border-border rounded-xl" />
      </div>
    </div>
  );
}

function Diagnostics({ analysis }: { analysis: TiltAnalysis }) {
  const styles = TILT_STYLES[analysis.level];
  const m = analysis.metrics;

  return (
    <>
      <section className="animate-reveal">
        <div className={`relative overflow-hidden bg-zinc-900/50 border ${styles.ring} rounded-xl p-8 md:p-12`}>
          <div className="absolute top-0 right-0 p-6">
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${styles.dot} animate-pulse-slow`} />
              <span className={`font-mono text-[10px] tracking-widest font-bold uppercase ${styles.text}`}>
                Live Diagnostics / {analysis.summoner.region}
              </span>
            </div>
          </div>

          <div className="max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4 block">
              {analysis.summoner.name}#{analysis.summoner.tag} / Verdict
            </span>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 text-balance leading-none">
              {analysis.headline.split(" ")[0]}{" "}
              <span className={`${styles.text} italic`}>
                {analysis.headline.split(" ").slice(1).join(" ")}
              </span>
            </h1>
            <p className={`text-lg md:text-xl text-zinc-300 text-pretty leading-relaxed mb-8 border-l-2 pl-6 ${styles.ring}`}>
              {analysis.verdict}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Streak" value={fmtStreak(m.currentStreak)} bad={m.currentStreak <= -2} />
              <Stat label="Sessions Today" value={String(m.sessionsToday)} />
              <Stat
                label="CS/min Delta"
                value={`${m.csPerMinDelta > 0 ? "+" : ""}${m.csPerMinDelta}%`}
                bad={m.csPerMinDelta < -8}
              />
              <Stat label="Mental Temp" value={`${m.mentalTempC}C`} bad={m.mentalTempC >= 75} />
            </div>
          </div>
        </div>
      </section>

      <section className="animate-reveal" style={{ animationDelay: "150ms" }}>
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Session Timeline / {analysis.sessions.length} sessions
          </h2>
          <div className="flex gap-4 font-mono text-[10px] uppercase text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="size-1.5 bg-tilt-green rounded-full" /> Victory
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 bg-tilt-red rounded-full" /> Defeat
            </span>
          </div>
        </div>
        <div className="bg-zinc-900/30 border border-border p-4 rounded-xl overflow-x-auto">
          <div className="flex gap-4 min-w-fit">
            {analysis.sessions.map((s) => (
              <div
                key={`${s.startMs}-${s.endMs}`}
                className="flex flex-col gap-2 pr-4 border-r border-border last:border-r-0 shrink-0"
              >
                <span className="text-[10px] font-mono text-muted-foreground uppercase">
                  {sessionLabel(s.endMs)} / {s.matches.length}g
                </span>
                <div className="flex gap-1">
                  {s.matches.map((mm) => (
                    <div
                      key={mm.matchId}
                      title={`${mm.champion} / ${mm.kills}/${mm.deaths}/${mm.assists}`}
                      className={`size-9 rounded-sm flex items-center justify-center text-[11px] font-bold font-mono border ${
                        mm.win
                          ? "border-tilt-green/40 text-tilt-green bg-tilt-green/5"
                          : "border-tilt-red/50 text-tilt-red bg-tilt-red/10"
                      }`}
                    >
                      {mm.win ? "W" : "L"}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid md:grid-cols-3 gap-8 animate-reveal" style={{ animationDelay: "300ms" }}>
        <div className="md:col-span-2 space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            KDA + CS/Min / Current Session
          </h2>
          <div className="relative h-72 bg-zinc-900/30 border border-border rounded-xl p-4">
            {analysis.trend.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.trend} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid stroke="oklch(0.3 0.013 286)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="game"
                    stroke="oklch(0.6 0.013 286)"
                    tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                    label={{
                      value: "GAME #",
                      position: "insideBottom",
                      offset: -2,
                      fill: "oklch(0.6 0.013 286)",
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    stroke="oklch(0.6 0.013 286)"
                    tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.205 0.012 285)",
                      border: "1px solid oklch(0.3 0.013 286)",
                      borderRadius: 8,
                      fontFamily: "JetBrains Mono",
                      fontSize: 12,
                    }}
                    labelFormatter={(g) => `Game ${g}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="kda"
                    stroke="var(--tilt-red)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "var(--tilt-red)" }}
                    name="KDA"
                  />
                  <Line
                    type="monotone"
                    dataKey="csPerMin"
                    stroke="var(--tilt-yellow)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="CS/min"
                  />
                  {analysis.tiltInflectionIndex !== null && (
                    <ReferenceDot
                      x={analysis.trend[analysis.tiltInflectionIndex]?.game}
                      y={analysis.trend[analysis.tiltInflectionIndex]?.kda}
                      r={8}
                      fill="var(--tilt-red)"
                      stroke="var(--tilt-red)"
                      strokeOpacity={0.3}
                      strokeWidth={6}
                      label={{
                        value: "TILT POINT",
                        position: "top",
                        fill: "var(--tilt-red)",
                        fontSize: 10,
                        fontFamily: "JetBrains Mono",
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground font-mono">
                Current session has fewer than 2 games, so there is not enough trend data yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Action Protocol
          </h2>
          <div
            className={`${styles.bg} border ${styles.ring} rounded-xl p-6 text-background`}
            style={{ color: "var(--background)" }}
          >
            <div className="size-12 rounded-full border-2 border-background/20 flex items-center justify-center mb-6 font-mono font-bold text-lg">
              {styles.label[0]}
            </div>
            <h3 className="text-2xl font-extrabold tracking-tight mb-2 uppercase">
              {analysis.level === "red"
                ? "Force Logout"
                : analysis.level === "yellow"
                  ? "Take A Break"
                  : "Keep Queuing"}
            </h3>
            <p className="text-sm font-medium leading-relaxed opacity-90">
              {analysis.level === "red"
                ? "Statistically, this session is sliding. Closing the client now protects your rank."
                : analysis.level === "yellow"
                  ? "Stats are slipping. Take 15 minutes away from the screen before the next match."
                  : "Your mechanical output is steady. No reason to stop yet."}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="bg-black/40 border border-border p-4 rounded-lg">
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono ${bad ? "text-tilt-red" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
}

function toTiltAnalysis(response: AnalyzePlayerResponse): TiltAnalysis {
  const [name, tag = response.region] = response.summonerName.split("#");
  const latestSession = response.sessions[0] ?? null;
  const sessions: Session[] = [...response.sessions].reverse().map((session) => {
    const matches = session.games.map((game): MatchSummary => ({
      matchId: game.matchId,
      champion: game.championName,
      championId: 0,
      win: game.win,
      kills: game.kills,
      deaths: game.deaths,
      assists: game.assists,
      cs: Math.round(game.csPerMin * (game.gameDuration / 60)),
      durationSec: game.gameDuration,
      gameEndMs: game.gameStartTimestamp + game.gameDuration * 1000,
      queue: "420",
    }));

    return {
      startMs: matches[0]?.gameEndMs - (matches[0]?.durationSec ?? 0) * 1000,
      endMs: matches[matches.length - 1]?.gameEndMs ?? Date.now(),
      matches,
    };
  });

  const trend =
    latestSession?.games.map((game, index) => ({
      game: index + 1,
      kda: +game.kda.toFixed(2),
      csPerMin: +game.csPerMin.toFixed(2),
      win: game.win,
      champion: game.championName,
    })) ?? [];
  const level = riskToLevel(response.overallTiltRisk);
  const latestGames = latestSession?.games ?? [];
  const kdaDelta = percentDelta(latestSession?.kdaTrend.early, latestSession?.kdaTrend.late);
  const csPerMinDelta = percentDelta(latestSession?.csTrend.early, latestSession?.csTrend.late);
  const currentStreak = getCurrentStreak(response);
  const tiltInflectionIndex = getTiltInflectionIndex(latestGames, latestSession?.kdaTrend.early ?? 0);

  return {
    summoner: { name: name || response.summonerName, tag, region: response.region },
    level,
    headline:
      level === "red"
        ? "CRITICAL TILT"
        : level === "yellow"
          ? "WARNING SIGNS"
          : "CLEAR HEAD",
    verdict:
      latestSession?.tiltReason ??
      "No signs of tilt. Your stats are holding steady, so you are clear to keep queuing.",
    metrics: {
      currentStreak,
      sessionsToday: sessions.filter((s) => isToday(s.endMs)).length,
      winRateDelta: 0,
      csPerMinDelta,
      kdaDelta,
      mentalTempC: level === "red" ? 86 : level === "yellow" ? 70 : 45,
    },
    sessions,
    currentSession: sessions[sessions.length - 1] ?? null,
    trend,
    tiltInflectionIndex,
  };
}

function riskToLevel(risk: AnalyzePlayerResponse["overallTiltRisk"]): TiltLevel {
  if (risk === "high") return "red";
  if (risk === "medium") return "yellow";
  return "green";
}

function percentDelta(early = 0, late = 0) {
  if (early <= 0) return 0;
  return +(((late - early) / early) * 100).toFixed(1);
}

function getTiltInflectionIndex(
  games: AnalyzePlayerResponse["sessions"][number]["games"],
  earlyKda: number
) {
  if (games.length < 2 || earlyKda <= 0) return null;
  const half = Math.ceil(games.length / 2);
  for (let i = half; i < games.length; i++) {
    if (games[i].kda < earlyKda * 0.7) return i;
  }
  return null;
}

function getCurrentStreak(response: AnalyzePlayerResponse) {
  const recentGames = response.sessions.flatMap((session) => [...session.games].reverse());
  if (recentGames.length === 0) return 0;
  const firstWin = recentGames[0].win;
  let streak = 0;
  for (const game of recentGames) {
    if (game.win !== firstWin) break;
    streak++;
  }
  return firstWin ? streak : -streak;
}

function isToday(ms: number) {
  const date = new Date(ms);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function fmtStreak(streak: number) {
  if (streak === 0) return "-";
  return `${streak > 0 ? "W" : "L"}${Math.abs(streak)}`;
}

function sessionLabel(ms: number) {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / (1000 * 60 * 60));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function regionValueFromLabel(label: string): RegionValue {
  return REGIONS.find((region) => region.label === label)?.value ?? DEFAULT_REGION;
}
