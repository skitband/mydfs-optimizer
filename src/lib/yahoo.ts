import "server-only";
import type { Game, Player, Position, Slate } from "./types";

const BASE = "https://dfyql-ro.sports.yahoo.com/v2";
const COMMON = "lang=en-US&region=US&device=desktop";
const TTL_MS = 60_000;
const VALID_POSITIONS = new Set<Position>(["PG", "SG", "SF", "PF", "C"]);

type CacheEntry = { expires: number; value: Promise<unknown> };
const cache = new Map<string, CacheEntry>();

async function getJson<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (DFS lineup optimizer)", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Yahoo responded ${res.status} for ${url}`);
    return res.json() as Promise<T>;
  });

  cache.set(url, { expires: Date.now() + TTL_MS, value });
  value.catch(() => cache.delete(url));
  return value;
}

type YahooMoney = { value: number } | null;

type YahooContest = {
  id: number;
  title: string;
  state: string;
  seriesId: number;
  sportCode: string;
  salaryCap: number;
  startTime: number;
  slateType: string;
  paidTotalPrize: YahooMoney;
};

type YahooContestsResponse = { contests: { result: YahooContest[] } };

type YahooTeamRef = { code: string; abbr: string };

type YahooPlayer = {
  code: string;
  firstName: string;
  lastName: string;
  status: string;
  imageUrl?: string;
  teamAbbr: string;
  game: {
    code: string;
    startTime: number;
    homeTeam: YahooTeamRef;
    awayTeam: YahooTeamRef;
    odds?: { overUnder?: number | null; homeSpread?: number | null } | null;
  };
  salary: number;
  projectedPoints: number | null;
  fantasyPointsPerGame: number | null;
  starting: string;
  primaryPosition: string;
  eligiblePositions: string[];
};

type YahooPlayersResponse = { players: { result: YahooPlayer[] } };

const SILHOUETTE = "silhouette";

function normalizePlayer(p: YahooPlayer): Player | null {
  const positions = (p.eligiblePositions?.length ? p.eligiblePositions : [p.primaryPosition]).filter(
    (pos): pos is Position => VALID_POSITIONS.has(pos as Position),
  );
  if (!positions.length || !p.game) return null;

  const isHome = p.game.homeTeam.abbr === p.teamAbbr;
  const fppg = round(p.fantasyPointsPerGame ?? 0);
  return {
    id: p.code,
    name: `${p.firstName} ${p.lastName}`.trim(),
    team: p.teamAbbr,
    opponent: isHome ? p.game.awayTeam.abbr : p.game.homeTeam.abbr,
    isHome,
    gameCode: p.game.code,
    gameStartTime: p.game.startTime,
    positions,
    salary: p.salary,
    projection: round(p.projectedPoints ?? fppg),
    fppg,
    status: p.status && p.status !== "N/A" ? p.status : "",
    starting: p.starting,
    imageUrl: p.imageUrl && !p.imageUrl.includes(SILHOUETTE) ? p.imageUrl : null,
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getContestPlayers(contestId: number) {
  const data = await getJson<YahooPlayersResponse>(`${BASE}/contestPlayers?${COMMON}&contestId=${contestId}`);
  const raw = data.players?.result ?? [];
  const players = raw.map(normalizePlayer).filter((p): p is Player => p !== null);

  const games = new Map<string, Game>();
  for (const p of raw) {
    if (!p.game || games.has(p.game.code)) continue;
    games.set(p.game.code, {
      code: p.game.code,
      home: p.game.homeTeam.abbr,
      away: p.game.awayTeam.abbr,
      startTime: p.game.startTime,
      overUnder: p.game.odds?.overUnder ?? null,
      homeSpread: p.game.odds?.homeSpread ?? null,
    });
  }

  return {
    players: players.sort((a, b) => b.projection - a.projection),
    games: [...games.values()].sort((a, b) => a.startTime - b.startTime || a.home.localeCompare(b.home)),
  };
}

export async function getSlates(): Promise<Slate[]> {
  const data = await getJson<YahooContestsResponse>(`${BASE}/contestsFilteredWeb?${COMMON}&sport=nba`);
  const contests = (data.contests?.result ?? []).filter(
    (c) => c.sportCode === "nba" && c.slateType === "MULTI_GAME" && c.state === "upcoming",
  );

  const bySeries = new Map<number, YahooContest[]>();
  for (const c of contests) {
    const list = bySeries.get(c.seriesId) ?? [];
    list.push(c);
    bySeries.set(c.seriesId, list);
  }

  const slates = await Promise.all(
    [...bySeries.entries()].map(async ([seriesId, list]) => {
      const rep = list[0];
      const { games, players } = await getContestPlayers(rep.id).catch(() => ({ games: [], players: [] }));
      return {
        id: String(seriesId),
        contestId: rep.id,
        startTime: Math.min(...list.map((c) => c.startTime)),
        contestCount: list.length,
        salaryCap: rep.salaryCap,
        biggestPrize: Math.max(...list.map((c) => c.paidTotalPrize?.value ?? 0)),
        games,
        playerCount: players.length,
      } satisfies Slate;
    }),
  );

  return slates.sort((a, b) => a.startTime - b.startTime);
}
