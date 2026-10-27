import "server-only";
import loadHighs from "highs";
import { LineupSearch } from "./lineup-search";
import {
  MAX_PER_TEAM,
  MIN_TEAMS,
  SALARY_CAP,
  SLOTS,
  type Lineup,
  type LineupSpot,
  type OptimizeRequest,
  type OptimizeResponse,
  type OptimizerPlayer,
  type Position,
  type Slot,
} from "./types";

type Highs = Awaited<ReturnType<typeof loadHighs>>;

const ROSTER_SIZE = SLOTS.length;

const SLOT_ELIGIBILITY: Record<Position, Slot[]> = {
  PG: ["PG", "G", "UTIL"],
  SG: ["SG", "G", "UTIL"],
  SF: ["SF", "F", "UTIL"],
  PF: ["PF", "F", "UTIL"],
  C: ["C", "UTIL"],
};

let highsPromise: Promise<Highs> | null = null;

function getHighs() {
  highsPromise ??= loadHighs();
  return highsPromise;
}

export class OptimizeInputError extends Error {}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function parseOptimizeRequest(body: unknown): OptimizeRequest {
  if (!body || typeof body !== "object") throw new OptimizeInputError("Invalid request body");
  const { players, locked, settings, salaryCap } = body as Partial<OptimizeRequest>;

  if (!Array.isArray(players) || players.length === 0) throw new OptimizeInputError("No players supplied");
  if (players.length > 1000) throw new OptimizeInputError("Too many players");

  const validPositions = new Set(Object.keys(SLOT_ELIGIBILITY));
  const cleanPlayers: OptimizerPlayer[] = players.map((p, i) => {
    const positions = Array.isArray(p?.positions)
      ? (p.positions.filter((pos) => validPositions.has(pos)) as Position[])
      : [];
    if (typeof p?.id !== "string" || typeof p.team !== "string" || !positions.length) {
      throw new OptimizeInputError(`Invalid player at index ${i}`);
    }
    const salary = Number(p.salary);
    const projection = Number(p.projection);
    if (!Number.isInteger(salary) || salary < 0 || !Number.isFinite(projection)) {
      throw new OptimizeInputError(`Invalid salary/projection for ${p.id}`);
    }
    return { id: p.id, team: p.team, positions, salary, projection: Math.min(250, Math.max(-50, projection)) };
  });

  const s = settings ?? ({} as OptimizeRequest["settings"]);
  return {
    players: cleanPlayers,
    locked: Array.isArray(locked) ? locked.filter((id): id is string => typeof id === "string") : [],
    salaryCap: clampInt(salaryCap, 1, 1_000, SALARY_CAP),
    settings: {
      lineups: clampInt(s.lineups, 1, 50, 1),
      minUnique: clampInt(s.minUnique, 1, ROSTER_SIZE, 1),
      maxExposure: clampInt(s.maxExposure, 1, 100, 100),
      maxPerTeam: clampInt(s.maxPerTeam, 1, MAX_PER_TEAM, MAX_PER_TEAM),
      randomness: clampInt(s.randomness, 0, 50, 0),
    },
  };
}

type Model = {
  players: OptimizerPlayer[];
  locked: Set<string>;
  teams: string[];
  salaryCap: number;
  maxPerTeam: number;
};

type SolveConstraints = {
  projections: number[];
  banned: Set<number>;
  previous: number[][];
  maxOverlap: number;
};

const UTIL_INDEX = SLOTS.indexOf("UTIL");
const SLOT_PREFERENCE: Slot[] = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"];

function slotMask(p: OptimizerPlayer) {
  let mask = 0;
  for (const pos of p.positions) for (const slot of SLOT_ELIGIBILITY[pos]) mask |= 1 << SLOTS.indexOf(slot);
  return mask & ~(1 << UTIL_INDEX);
}

const popcount = (n: number) => n.toString(2).replaceAll("0", "").length;

function sumTerms(terms: string[]) {
  const lines: string[] = [];
  for (let i = 0; i < terms.length; i += 12) lines.push(terms.slice(i, i + 12).join(" "));
  return lines.join("\n   ");
}

/**
 * One binary per player. Slot feasibility uses Hall's theorem: since every player fits UTIL,
 * a valid slot assignment exists iff for each set T of non-UTIL slots, the number of picked
 * players whose eligible slots all lie in T is at most |T| + 1. Only unions of eligibility
 * masks present in the pool need a constraint. This avoids the symmetry of per-slot variables.
 */
function buildLp(model: Model, c: SolveConstraints) {
  const { players, locked, teams, salaryCap, maxPerTeam } = model;
  const active = players.map((_, i) => i).filter((i) => !c.banned.has(i));
  const masks = players.map(slotMask);
  const z = (i: number) => `z${i}`;
  const sum = (ids: number[]) => sumTerms(ids.map((i) => `+ ${z(i)}`));

  for (let s = 0; s < SLOTS.length; s++) {
    if (s !== UTIL_INDEX && !active.some((i) => masks[i] & (1 << s))) {
      throw new OptimizeInputError(`No eligible players for ${SLOTS[s]}`);
    }
  }

  const rows: string[] = [`roster: ${sum(active)} = ${ROSTER_SIZE}`];

  const unions = new Set<number>();
  for (const m of new Set(active.map((i) => masks[i]))) {
    for (const u of [...unions]) unions.add(u | m);
    unions.add(m);
  }
  [...unions].forEach((t, k) => {
    const limit = popcount(t) + 1;
    const inside = active.filter((i) => (masks[i] & ~t) === 0);
    if (inside.length > limit) rows.push(`hall${k}: ${sum(inside)} <= ${limit}`);
  });

  for (const i of active) if (locked.has(players[i].id)) rows.push(`lock${i}: ${z(i)} = 1`);

  rows.push(`cap: ${sumTerms(active.map((i) => `+ ${players[i].salary} ${z(i)}`))} <= ${salaryCap}`);

  const teamVars: string[] = [];
  teams.forEach((team, t) => {
    const members = active.filter((i) => players[i].team === team);
    if (!members.length) return;
    if (members.length > maxPerTeam) rows.push(`tmax${t}: ${sum(members)} <= ${maxPerTeam}`);
    rows.push(`tmin${t}: ${sum(members)} - y${t} >= 0`);
    teamVars.push(`y${t}`);
  });
  if (teamVars.length < MIN_TEAMS) throw new OptimizeInputError(`Player pool must span at least ${MIN_TEAMS} teams`);
  rows.push(`teams: ${sumTerms(teamVars.map((y) => `+ ${y}`))} >= ${MIN_TEAMS}`);

  c.previous.forEach((lineup, k) => {
    const ids = lineup.filter((i) => !c.banned.has(i));
    if (ids.length > c.maxOverlap) rows.push(`uniq${k}: ${sum(ids)} <= ${c.maxOverlap}`);
  });

  return [
    "Maximize",
    ` obj: ${sumTerms(active.map((i) => `+ ${c.projections[i].toFixed(4)} ${z(i)}`))}`,
    "Subject To",
    ...rows.map((r) => ` ${r}`),
    "Binary",
    ` ${sumTerms([...active.map(z), ...teamVars])}`,
    "End",
  ].join("\n");
}

function assignSlots(picked: number[], players: OptimizerPlayer[]): LineupSpot[] {
  const options = picked.map((i) => {
    const mask = slotMask(players[i]) | (1 << UTIL_INDEX);
    return SLOT_PREFERENCE.map((slot) => SLOTS.indexOf(slot)).filter((s) => mask & (1 << s));
  });
  const owner = new Array<number>(SLOTS.length).fill(-1);
  const augment = (k: number, seen: boolean[]): boolean => {
    for (const s of options[k]) {
      if (seen[s]) continue;
      seen[s] = true;
      if (owner[s] === -1 || augment(owner[s], seen)) {
        owner[s] = k;
        return true;
      }
    }
    return false;
  };
  const order = picked.map((_, k) => k).sort((a, b) => options[a].length - options[b].length);
  for (const k of order) {
    if (!augment(k, [])) throw new Error("Solver returned a lineup that cannot fill every slot");
  }
  return SLOTS.map((slot, s) => ({ slot, playerId: players[picked[owner[s]]].id }));
}

type SolveResult = { status: "optimal" | "infeasible" | "failed"; picks: number[] };

const STATUS_OPTIMAL = 7;
const STATUS_INFEASIBLE = 8;
const STATUS_TIME_LIMIT = 13;
const TIME_BUDGET_MS = 30_000;

/** Exact MILP fallback (HiGHS) for settings where the enumeration in `LineupSearch` would grow too large. */
async function solveIlp(lp: string): Promise<SolveResult> {
  const run = async (): Promise<SolveResult> => {
    const highs = await getHighs();
    const model = highs.createModel({ format: "lp", data: lp });
    try {
      model.options.set({ output_flag: false, time_limit: 15 });
      const { modelStatus } = model.run();
      if (modelStatus === STATUS_INFEASIBLE) return { status: "infeasible", picks: [] };
      if (modelStatus !== STATUS_OPTIMAL && modelStatus !== STATUS_TIME_LIMIT) return { status: "failed", picks: [] };

      const { colValue } = model.getSolution();
      const picks: number[] = [];
      colValue.forEach((x, j) => {
        const name = model.getColName(j);
        if (name.startsWith("z") && x > 0.5) picks.push(Number(name.slice(1)));
      });
      // A time-limited run is only usable if it already holds a complete incumbent.
      return { status: picks.length === ROSTER_SIZE ? "optimal" : "failed", picks };
    } finally {
      model.dispose();
    }
  };
  try {
    return await run();
  } catch {
    // The WASM instance can end up in a bad state after a failure; retry with a fresh one.
    highsPromise = null;
    return run();
  }
}

export async function optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
  const started = performance.now();
  const { settings } = req;
  const locked = new Set(req.locked);

  const players = req.players.filter((p) => locked.has(p.id) || p.projection > 0);
  const missingLocks = req.locked.filter((id) => !players.some((p) => p.id === id));
  if (missingLocks.length) throw new OptimizeInputError(`Locked players not in pool: ${missingLocks.join(", ")}`);
  if (locked.size > ROSTER_SIZE) throw new OptimizeInputError(`You can lock at most ${ROSTER_SIZE} players`);

  const teams = [...new Set(players.map((p) => p.team))].sort();
  const model: Model = {
    players,
    locked,
    teams,
    salaryCap: req.salaryCap ?? SALARY_CAP,
    maxPerTeam: settings.maxPerTeam,
  };

  const search = LineupSearch.fits(players.length, ROSTER_SIZE, model.salaryCap)
    ? new LineupSearch(
        players.map((p) => ({
          salary: p.salary,
          slotBits: [...new Set(p.positions.flatMap((pos) => SLOT_ELIGIBILITY[pos]))].map((s) => 1 << SLOTS.indexOf(s)),
          team: teams.indexOf(p.team),
          locked: locked.has(p.id),
        })),
        ROSTER_SIZE,
        model.salaryCap,
        settings.maxPerTeam,
        MIN_TEAMS,
      )
    : null;
  let searchKey: string | null = null;
  let searchOverflowed = false;

  const maxOverlap = ROSTER_SIZE - settings.minUnique;
  const maxUses = Math.max(1, Math.floor((settings.lineups * settings.maxExposure) / 100 + 1e-9));
  const usage = new Map<number, number>();
  const previous: number[][] = [];
  const previousSets: Set<number>[] = [];
  const lineups: Lineup[] = [];
  let message: string | undefined;

  const isDiverse = (picks: number[]) =>
    previousSets.every((prev) => picks.reduce((overlap, i) => overlap + (prev.has(i) ? 1 : 0), 0) <= maxOverlap);

  for (let n = 0; n < settings.lineups; n++) {
    if (performance.now() - started > TIME_BUDGET_MS) {
      message = `Stopped after ${n} lineups to stay within the time limit.`;
      break;
    }

    const noise = settings.randomness / 100;
    const constraints: SolveConstraints = {
      projections: players.map((p) =>
        noise > 0 ? p.projection * (1 + noise * (Math.random() * 2 - 1)) : p.projection,
      ),
      banned: new Set(
        [...usage.entries()].filter(([i, count]) => count >= maxUses && !locked.has(players[i].id)).map(([i]) => i),
      ),
      previous,
      maxOverlap,
    };

    let lp: string;
    try {
      // Also validates that the remaining pool can fill every slot and span enough teams.
      lp = buildLp(model, constraints);
    } catch (err) {
      if (n === 0 || !(err instanceof OptimizeInputError)) throw err;
      message = `Stopped at ${n} lineup${n === 1 ? "" : "s"}: ${err.message} once exposure limits apply.`;
      break;
    }

    let result: SolveResult | null = null;
    if (search && !searchOverflowed) {
      const key = noise > 0 ? `random-${n}` : [...constraints.banned].join(",");
      if (key !== searchKey) {
        search.reset(constraints.projections, constraints.banned);
        searchKey = key;
      }
      const found = search.next(isDiverse);
      if (found === null) result = { status: "infeasible", picks: [] };
      else if (found === "overflow") searchOverflowed = true;
      else result = { status: "optimal", picks: found.picks };
    }
    result ??= await solveIlp(lp);

    if (result.status !== "optimal") {
      message =
        result.status === "failed"
          ? `The solver could not finish lineup ${n + 1}; try fewer lineups or fewer constraints.`
          : n === 0
            ? "No valid lineup exists with these constraints."
            : `Only ${n} unique lineup${n === 1 ? "" : "s"} possible with these constraints.`;
      break;
    }

    const picked = result.picks;
    lineups.push({
      spots: assignSlots(picked, players),
      salary: picked.reduce((sum, i) => sum + players[i].salary, 0),
      projection: Math.round(picked.reduce((sum, i) => sum + players[i].projection, 0) * 100) / 100,
    });
    previous.push(picked);
    previousSets.push(new Set(picked));
    picked.forEach((i) => usage.set(i, (usage.get(i) ?? 0) + 1));
  }

  return {
    lineups,
    requested: settings.lineups,
    elapsedMs: Math.round(performance.now() - started),
    message,
  };
}
