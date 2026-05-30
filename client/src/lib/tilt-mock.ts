import { analyze, type MatchSummary, type TiltAnalysis } from "./tilt";

const CHAMPS = ["Aatrox", "Lee Sin", "Jayce", "K'Sante", "Ornn", "Jax", "Ahri", "Yasuo", "Zed", "Lulu"];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function mockAnalyze(riotId: string, regionLabel: string): TiltAnalysis {
  const [name, tag = "EUW"] = riotId.split("#");
  const r = rand(hash(riotId || "demo"));
  const now = Date.now();
  const matches: MatchSummary[] = [];

  // 3 sessions over the past 3 days, most recent shows degradation
  const sessionDefs = [
    { startHoursAgo: 50, count: 4, winChance: 0.6, baseKda: 3.2, baseCs: 7.2, decay: 0 },
    { startHoursAgo: 26, count: 5, winChance: 0.5, baseKda: 2.8, baseCs: 6.9, decay: 0.05 },
    { startHoursAgo: 2.5, count: 6, winChance: 0.25, baseKda: 3.4, baseCs: 7.0, decay: 0.18 },
  ];

  for (const sess of sessionDefs) {
    let t = now - sess.startHoursAgo * 3600 * 1000;
    for (let i = 0; i < sess.count; i++) {
      const tiltFactor = 1 - sess.decay * i;
      const duration = 1500 + Math.floor(r() * 900);
      const win = r() < sess.winChance * (i < sess.count / 2 ? 1.3 : 0.6);
      const kda = Math.max(0.2, sess.baseKda * tiltFactor + (r() - 0.5));
      const deaths = Math.max(1, Math.round(4 + r() * 4 + (1 - tiltFactor) * 5));
      const kills = Math.max(0, Math.round((kda * deaths) / 2));
      const assists = Math.max(0, Math.round((kda * deaths) / 2));
      const cspm = Math.max(2, sess.baseCs * tiltFactor + (r() - 0.5));
      matches.push({
        matchId: `MOCK_${t}_${i}`,
        champion: CHAMPS[Math.floor(r() * CHAMPS.length)],
        championId: 0,
        win,
        kills,
        deaths,
        assists,
        cs: Math.round(cspm * (duration / 60)),
        durationSec: duration,
        gameEndMs: t + duration * 1000,
        queue: "420",
      });
      t += duration * 1000 + (5 + Math.floor(r() * 8)) * 60 * 1000;
    }
  }

  return analyze(matches, { name: name || "Demo", tag, region: regionLabel });
}
