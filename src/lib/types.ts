export const SLOTS = ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL"] as const;
export type Slot = (typeof SLOTS)[number];

export type Position = "PG" | "SG" | "SF" | "PF" | "C";

export const SALARY_CAP = 200;
export const MIN_TEAMS = 3;
export const MAX_PER_TEAM = 6;

export type Game = {
  code: string;
  home: string;
  away: string;
  startTime: number;
  overUnder: number | null;
  homeSpread: number | null;
};

export type Slate = {
  id: string;
  contestId: number;
  startTime: number;
  contestCount: number;
  salaryCap: number;
  biggestPrize: number;
  games: Game[];
  playerCount: number;
};

export type Player = {
  id: string;
  name: string;
  team: string;
  opponent: string;
  isHome: boolean;
  gameCode: string;
  gameStartTime: number;
  positions: Position[];
  salary: number;
  projection: number;
  fppg: number;
  status: string;
  starting: string;
  imageUrl: string | null;
};

export type OptimizerPlayer = Pick<Player, "id" | "team" | "salary" | "positions"> & {
  projection: number;
};

export type OptimizeSettings = {
  lineups: number;
  minUnique: number;
  maxExposure: number;
  maxPerTeam: number;
  randomness: number;
};

export type OptimizeRequest = {
  players: OptimizerPlayer[];
  locked: string[];
  settings: OptimizeSettings;
  salaryCap?: number;
};

export type LineupSpot = { slot: Slot; playerId: string };

export type Lineup = {
  spots: LineupSpot[];
  salary: number;
  projection: number;
};

export type OptimizeResponse = {
  lineups: Lineup[];
  requested: number;
  elapsedMs: number;
  message?: string;
};
