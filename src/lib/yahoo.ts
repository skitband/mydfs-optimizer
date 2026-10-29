import "server-only";
import { optimize } from "./optimizer";
import {
  MAX_PER_TEAM,
  SALARY_CAP,
  SLOTS,
  type Game,
  type LineupSpot,
  type Player,
  type Position,
  type ResultPlayer,
  type ScoredGame,
  type Slate,
  type SlateResult,
  type Slot,
} from "./types";

const BASE = "https://dfyql-ro.sports.yahoo.com/v2";
const COMMON = "lang=en-US&region=US&device=desktop";
const TTL_MS = 60_000;
const FINAL_TTL_MS = 6 * 60 * 60_000;
const VALID_POSITIONS = new Set<Position>(["PG", "SG", "SF", "PF", "C"]);
const VALID_SLOTS = new Set<string>(SLOTS);

type CacheEntry = { expires: number; value: Promise<unknown> };
const cache = new Map<string, CacheEntry>();

async function getJson<T>(url: string, ttl = TTL_MS): Promise<T> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;

  const value = fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (DFS lineup optimizer)", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Yahoo responded ${res.status} for ${url}`);
    return res.json() as Promise<T>;
  });

  cache.set(url, { expires: Date.now() + ttl, value });
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
  points?: number | null;
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
        contestIds: list.map((c) => c.id),
      } satisfies Slate;
    }),
  );

  return slates.sort((a, b) => a.startTime - b.startTime);
}

type YahooSeries = {
  id: number;
  sportCode: string;
  state: string;
  salaryCapOverride: number | null;
  games: {
    id: string;
    homeTeam: YahooTeamRef;
    awayTeam: YahooTeamRef;
    homeScore?: number | null;
    awayScore?: number | null;
    status?: string;
  }[];
};

type YahooSeriesResponse = { series: { result: YahooSeries[] } };

type YahooEntry = {
  id: number;
  contestId: number;
  seriesId: number;
  rank: number;
  score: number;
  user?: { nickname?: string };
  lineupSlotList?: { lineupSlot?: { key: string }; player?: { code: string } }[];
};

type YahooEntriesResponse = {
  entries: { result: YahooEntry[] };
  pagination?: { result?: { totalCount?: number } };
};

const ENTRY_CONCURRENCY = 8;

async function getResultPool(contestIds: number[], gameCodes: Set<string>, ttl: number) {
  // Any contest in the series exposes actual points, even canceled ones; try a few in case some fail.
  for (const id of contestIds.slice(0, 5)) {
    const data = await getJson<YahooPlayersResponse>(`${BASE}/contestPlayers?${COMMON}&contestId=${id}`, ttl).catch(
      () => null,
    );
    const pool = (data?.players?.result ?? []).flatMap((raw): ResultPlayer[] => {
      const p = normalizePlayer(raw);
      if (!p || !gameCodes.has(p.gameCode)) return [];
      const { id, name, team, opponent, isHome, salary, positions, status, projection } = p;
      return [{ id, name, team, opponent, isHome, salary, positions, status, projection, points: round(raw.points ?? 0) }];
    });
    if (pool.length) return pool;
  }
  throw new Error("Could not load player results for this slate");
}

async function perfectLineup(pool: ResultPlayer[], salaryCap: number) {
  const { lineups } = await optimize({
    players: pool.map((p) => ({ id: p.id, team: p.team, salary: p.salary, positions: p.positions, projection: p.points })),
    locked: [],
    salaryCap,
    settings: { lineups: 1, minUnique: 1, maxExposure: 100, maxPerTeam: MAX_PER_TEAM, randomness: 0 },
  });
  const lineup = lineups[0];
  return lineup ? { spots: lineup.spots, salary: lineup.salary, points: round(lineup.projection) } : null;
}

async function bestEntry(seriesId: number, contestIds: number[], players: Map<string, ResultPlayer>, ttl: number) {
  const queue = [...contestIds];
  const tops: (YahooEntry & { entryCount: number })[] = [];
  await Promise.all(
    Array.from({ length: ENTRY_CONCURRENCY }, async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        const data = await getJson<YahooEntriesResponse>(
          `${BASE}/contestEntries?${COMMON}&contestId=${id}&start=0&limit=1&sort=rank`,
          ttl,
        ).catch(() => null);
        const entry = data?.entries?.result?.[0];
        if (entry?.seriesId === seriesId) tops.push({ ...entry, entryCount: data?.pagination?.result?.totalCount ?? 0 });
      }
    }),
  );

  const top = tops.reduce<(typeof tops)[number] | null>((a, b) => (!a || b.score > a.score ? b : a), null);
  if (!top) return null;

  const [detail, contest] = await Promise.all([
    getJson<YahooEntriesResponse>(`${BASE}/contestEntry/${top.id}?${COMMON}`, ttl),
    getJson<YahooContestsResponse>(`${BASE}/contest/${top.contestId}?${COMMON}`, ttl).catch(() => null),
  ]);
  const spots = (detail.entries?.result?.[0]?.lineupSlotList ?? []).flatMap((s): LineupSpot[] =>
    s.lineupSlot && VALID_SLOTS.has(s.lineupSlot.key) && s.player?.code
      ? [{ slot: s.lineupSlot.key as Slot, playerId: s.player.code }]
      : [],
  );
  if (!spots.length) return null;

  return {
    spots,
    salary: spots.reduce((sum, s) => sum + (players.get(s.playerId)?.salary ?? 0), 0),
    points: round(top.score),
    user: top.user?.nickname ?? "Unknown",
    rank: top.rank,
    entryCount: top.entryCount,
    contestTitle: contest?.contests?.result?.[0]?.title ?? `Contest ${top.contestId}`,
  };
}

export async function getSlateResult(seriesId: number, contestIds: number[]): Promise<SlateResult> {
  const data = await getJson<YahooSeriesResponse>(`${BASE}/series/${seriesId}?${COMMON}`);
  const series = data.series?.result?.[0];
  if (!series || series.sportCode !== "nba") throw new Error(`Series ${seriesId} is not an NBA slate`);

  const final = series.state === "completed";
  const ttl = final ? FINAL_TTL_MS : TTL_MS;
  const salaryCap = series.salaryCapOverride ?? SALARY_CAP;
  const pool = await getResultPool(contestIds, new Set(series.games.map((g) => g.id)), ttl);
  const byId = new Map(pool.map((p) => [p.id, p]));

  const [perfect, best] = await Promise.all([
    perfectLineup(pool, salaryCap),
    bestEntry(seriesId, contestIds, byId, ttl),
  ]);
  const used = new Set([...(perfect?.spots ?? []), ...(best?.spots ?? [])].map((s) => s.playerId));

  return {
    seriesId: String(seriesId),
    final,
    salaryCap,
    games: series.games.map(
      (g): ScoredGame => ({
        code: g.id,
        home: g.homeTeam.abbr,
        away: g.awayTeam.abbr,
        homeScore: g.homeScore ?? null,
        awayScore: g.awayScore ?? null,
        status: g.status ?? "",
      }),
    ),
    players: Object.fromEntries(pool.filter((p) => used.has(p.id)).map((p) => [p.id, p])),
    perfect,
    best,
    contestsChecked: contestIds.length,
  };
}
