import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type Session, type TiltAnalysis, type TiltLevel } from "./lib/tilt";

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

const TIMELINE_GAME_LIMIT = 15;

export default function App() {
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [analysis, setAnalysis] = useState<TiltAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async (name = gameName, tag = tagLine) => {
    const trimmedName = name.trim();
    const trimmedTag = tag.trim();
    if (!trimmedName) return;
    if (!trimmedTag) {
      setError("Enter a Riot tag.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { account, analysis: riotAnalysis } = await analyzeRiotAccount(
        trimmedName,
        trimmedTag
      );
      setGameName(account.gameName);
      setTagLine(account.tagLine);
      setAnalysis(riotAnalysis);
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "Could not validate this account.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runAnalysis();
  };

  const playerNotFound = isPlayerNotFoundError(error);

  const goHome = () => {
    setGameName("");
    setTagLine("");
    setAnalysis(null);
    setError(null);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-display selection:bg-tilt-red/30">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goHome}
              aria-label="Go to home screen"
              className="size-8 bg-tilt-red rounded-sm flex items-center justify-center font-bold text-background tracking-tighter italic cursor-pointer transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-tilt-red/50 focus:ring-offset-2 focus:ring-offset-background"
            >
              TD
            </button>
            <span className="font-bold tracking-tight text-lg uppercase">
              Tilt Detector
            </span>
          </div>

          <form
            onSubmit={onSubmit}
            className="flex items-center gap-1 bg-black/40 border border-border p-1 rounded-md"
          >
            <div className="relative">
              <input
                type="text"
                value={gameName}
                onChange={(e) => {
                  const value = e.target.value;
                  const [name, tag] = value.split("#");
                  setGameName(name);
                  if (tag !== undefined) setTagLine(tag.toUpperCase());
                }}
                placeholder="SUMMONER NAME"
                spellCheck={false}
                disabled={loading}
                className="bg-transparent px-3 py-1.5 text-sm font-mono outline-none w-44 sm:w-56 focus:w-64 transition-all uppercase placeholder:text-muted-foreground/60"
              />
            </div>

            <span className="px-1 text-xs font-mono font-bold text-muted-foreground">
              #
            </span>
            <input
              type="text"
              value={tagLine}
              onChange={(e) => setTagLine(e.target.value.toUpperCase())}
              placeholder="TAG"
              spellCheck={false}
              disabled={loading}
              className="bg-transparent px-2 py-1.5 text-sm font-mono outline-none w-20 uppercase placeholder:text-muted-foreground/60"
            />

            <button
              type="submit"
              disabled={loading || !gameName.trim() || !tagLine.trim()}
              className="bg-foreground text-background px-4 py-1.5 text-xs font-bold uppercase tracking-tight hover:bg-white transition-colors cursor-pointer rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Scanning..." : "Analyze"}
            </button>
          </form>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {!analysis && !loading && playerNotFound && <PlayerNotFound onBack={goHome} />}
        {!analysis && !loading && !playerNotFound && <EmptyState error={error} />}
        {loading && <SkeletonState />}
        {analysis && <Diagnostics analysis={analysis} />}
      </main>

      <footer className="border-t border-border mt-12 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-8">
            <FooterStat label="Data Source" value="RIOT MATCH API v5" />
            <FooterStat label="Queue" value="RANKED SOLO/DUO" />
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.3em] text-center">
            Tilt Detector isn't endorsed by Riot Games.
          </div>
        </div>
      </footer>
    </div>
  );
}

function PlayerNotFound({ onBack }: { onBack: () => void }) {
  return (
    <section className="min-h-[60vh] flex items-center justify-center animate-reveal">
      <div className="w-full max-w-xl border border-tilt-red/40 bg-zinc-900/50 rounded-xl p-8 md:p-10 text-center">
        <img
          src="/img/error.png"
          alt="Player not found"
          className="mx-auto mb-6 max-h-56 w-auto object-contain drop-shadow-2xl"
        />
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-tilt-red mb-3 block">
          Lookup Failed
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
          Player Does Not Exist
        </h1>
        <p className="text-zinc-400 leading-relaxed mb-8">
          That Riot ID could not be found. Check the summoner name and tag, then
          try again.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-black/40 px-4 py-2 font-mono text-sm font-bold uppercase tracking-tight text-foreground transition-colors hover:border-tilt-red/60 hover:text-tilt-red"
        >
          <span aria-hidden="true">&larr;</span>
          Back to homescreen
        </button>
      </div>
    </section>
  );
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <section className="animate-reveal">
      <div className="relative overflow-hidden bg-zinc-900/50 border border-border rounded-xl p-8 md:p-12">
        <div className="pointer-events-none absolute right-6 top-10 bottom-8 hidden w-80 lg:block xl:right-10 xl:w-96">
          <img
            src="/img/mad.png"
            alt=""
            className="absolute top-0 right-0 w-[62%] object-contain opacity-95 drop-shadow-2xl"
          />
          <img
            src="/img/calm.png"
            alt=""
            className="absolute top-1/2 left-0 w-[66%] -translate-y-1/2 object-contain opacity-95 drop-shadow-2xl"
          />
          <img
            src="/img/happy.png"
            alt=""
            className="absolute bottom-0 right-0 w-[62%] object-contain opacity-95 drop-shadow-2xl"
          />
        </div>

        <div className="relative z-10 max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4 block">
            Session Analysis Verdict
          </span>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter mb-6 text-balance leading-none">
            ARE YOU{" "}
            <span className="inline-flex items-baseline gap-3">
              <span className="text-tilt-red italic">TILTING</span>
              <span className="text-foreground">?</span>
            </span>
          </h1>
          <p className="text-lg text-zinc-400 text-pretty leading-relaxed mb-6 border-l-2 border-tilt-red/50 pl-6">
            Tilt Detector analyzes your last 15 ranked games to tell you if your
            performance is getting worse and whether you should log off before it
            costs you more LP.
          </p>
          <div className="mt-8 max-w-xl border border-border bg-black/25 rounded-xl p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
              How It Works
            </h2>
            <div className="grid gap-3">
              {[
                "Enter your summoner name",
                "We analyze your last 15 ranked games",
                "See if you're tilting and when it started",
              ].map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-4 border border-border bg-black/35 rounded-lg px-4 py-3"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-tilt-red text-background font-mono text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-zinc-200">
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {error && (
            <div className="mt-4 inline-flex items-center gap-2 border border-tilt-red/50 bg-tilt-red/10 text-tilt-red px-4 py-2 rounded-md font-mono text-xs">
              <span className="size-1.5 rounded-full bg-tilt-red animate-pulse-slow" />
              {error}
            </div>
          )}
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
  const moodImage = getMoodImage(analysis);
  const timelineSessions = getRecentTimelineSessions(
    analysis.sessions,
    TIMELINE_GAME_LIMIT
  );
  const timelineGameCount = timelineSessions.reduce(
    (total, session) => total + session.matches.length,
    0
  );
  const tiltScoreData = buildTiltScoreData(analysis.trend);

  return (
    <>
      <section className="animate-reveal">
        <div className={`relative overflow-hidden bg-zinc-900/50 border ${styles.ring} rounded-xl p-8 md:p-12`}>
          <div className="absolute top-0 right-0 p-6">
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full ${styles.dot} animate-pulse-slow`} />
              <span className={`font-mono text-[10px] tracking-widest font-bold uppercase ${styles.text}`}>
                Live Diagnostics
              </span>
            </div>
          </div>

          <img
            src={moodImage.src}
            alt={moodImage.alt}
            className="pointer-events-none absolute right-8 bottom-0 hidden max-h-[82%] w-[34%] max-w-sm object-contain object-bottom opacity-95 drop-shadow-2xl lg:block"
          />

          <div className="relative z-10 max-w-2xl">
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
              <Stat label="Games Today" value={String(m.gamesToday)} />
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
            Session Timeline / Latest {timelineGameCount} games
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
            {timelineSessions.map((s) => (
              <div
                key={`${s.startMs}-${s.endMs}`}
                className="flex flex-col gap-2 pr-4 border-r border-border last:border-r-0 shrink-0"
              >
                <div className="space-y-1">
                  <span className="block text-[10px] font-mono text-muted-foreground uppercase">
                    {sessionLabel(s.endMs)} / {s.matches.length}g
                  </span>
                  <span className="block text-[10px] font-mono text-zinc-500 uppercase">
                    {sessionTimestamp(s.endMs)}
                  </span>
                </div>
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
            Tilt Score / Ranked Games
          </h2>
          <div className="relative h-72 bg-zinc-900/30 border border-border rounded-xl p-4">
            {tiltScoreData.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tiltScoreData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid stroke="oklch(0.3 0.013 286)" strokeDasharray="3 3" />
                  <ReferenceArea y1={0} y2={33} fill="var(--tilt-green)" fillOpacity={0.08} />
                  <ReferenceArea y1={34} y2={66} fill="var(--tilt-yellow)" fillOpacity={0.08} />
                  <ReferenceArea y1={67} y2={100} fill="var(--tilt-red)" fillOpacity={0.08} />
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
                    domain={[0, 100]}
                    stroke="oklch(0.6 0.013 286)"
                    tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
                    ticks={[0, 33, 66, 100]}
                    tickFormatter={(value) => {
                      if (value === 0) return "Calm";
                      if (value === 100) return "Tilting";
                      return String(value);
                    }}
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
                    content={<TrendTooltip />}
                  />
                  <Line
                    type="monotone"
                    dataKey="tiltScore"
                    stroke="var(--foreground)"
                    strokeWidth={2.5}
                    dot={<TrendDot />}
                    activeDot={<TrendDot active />}
                    name="Tilt Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground font-mono">
                Not enough ranked games yet to calculate a tilt score trend.
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

type TrendPoint = TiltAnalysis["trend"][number] & {
  tiltScore: number;
};

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: TrendPoint;
  active?: boolean;
}

function TrendDot({ cx, cy, payload, active }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={active ? 6 : 4}
      fill={payload.win ? "var(--tilt-green)" : "var(--tilt-red)"}
      stroke="oklch(0.145 0.01 285)"
      strokeWidth={2}
    />
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: TrendPoint;
  }>;
  label?: string | number;
}

function TrendTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  if (!point) return null;

  return (
    <div className="rounded-lg border border-border bg-zinc-900 px-3 py-2 font-mono text-xs shadow-xl">
      <div className="mb-1 text-zinc-400">Game {label}</div>
      <div className="font-bold text-foreground">{point.champion}</div>
      <div className={point.win ? "text-tilt-green" : "text-tilt-red"}>
        {point.win ? "Victory" : "Defeat"}
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-5">
          <span style={{ color: "var(--foreground)" }}>Tilt Score</span>
          <span className="text-foreground">{point.tiltScore}</span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span style={{ color: "var(--tilt-red)" }}>KDA</span>
          <span className="text-foreground">{point.kda.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span style={{ color: "var(--tilt-yellow)" }}>CS/min</span>
          <span className="text-foreground">{point.csPerMin.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function getMoodImage(analysis: TiltAnalysis) {
  if (analysis.level === "red") {
    return { src: "/img/mad.png", alt: "Tilted mood" };
  }

  if (analysis.metrics.currentStreak >= 2) {
    return { src: "/img/happy.png", alt: "Happy mood" };
  }

  return { src: "/img/calm.png", alt: "Calm mood" };
}

function buildTiltScoreData(trend: TiltAnalysis["trend"]): TrendPoint[] {
  const baselineKda = avg(trend.map((game) => game.kda));
  const baselineCs = avg(trend.map((game) => game.csPerMin));

  return trend.map((game) => {
    const kdaRatio = baselineKda > 0 ? game.kda / baselineKda : 1;
    const csRatio = baselineCs > 0 ? game.csPerMin / baselineCs : 1;
    const winModifier = game.win ? -10 : 15;
    const score =
      50 +
      (1 - kdaRatio) * 25 +
      (1 - csRatio) * 15 +
      winModifier;

    return {
      ...game,
      tiltScore: Math.max(0, Math.min(100, Math.round(score))),
    };
  });
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function sessionTimestamp(ms: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function getRecentTimelineSessions(sessions: Session[], maxGames: number) {
  let remaining = maxGames;

  return [...sessions]
    .sort((a, b) => b.endMs - a.endMs)
    .map((session) => {
      const matches = [...session.matches]
        .sort((a, b) => b.gameEndMs - a.gameEndMs)
        .slice(0, remaining);
      remaining -= matches.length;

      return {
        ...session,
        startMs: matches[matches.length - 1]
          ? matches[matches.length - 1].gameEndMs -
            matches[matches.length - 1].durationSec * 1000
          : session.startMs,
        endMs: matches[0]?.gameEndMs ?? session.endMs,
        matches,
      };
    })
    .filter((session) => session.matches.length > 0);
}

async function analyzeRiotAccount(gameName: string, tagLine: string) {
  const params = new URLSearchParams({ gameName, tagLine });
  const res = await fetch(`/api/analyze?${params.toString()}`);
  const data = (await res.json().catch(() => ({}))) as {
    account?: { puuid: string; gameName: string; tagLine: string };
    analysis?: TiltAnalysis;
    message?: string;
  };

  if (res.status === 404) {
    throw new Error(data.message ?? "Account doesn't exist.");
  }

  if (!res.ok || !data.account || !data.analysis) {
    throw new Error(data.message ?? "Could not analyze this account.");
  }

  return { account: data.account, analysis: data.analysis };
}

function isPlayerNotFoundError(error: string | null) {
  if (!error) return false;
  return /account doesn't exist|account does not exist|player doesn't exist|player does not exist|not found/i.test(
    error
  );
}
