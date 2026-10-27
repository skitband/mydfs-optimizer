import "server-only";

/**
 * Exact best-first lineup search.
 *
 * A DP table gives, for every (player index, set of open slots, salary left), an upper bound on the
 * points still obtainable. A DFS uses it to enumerate every valid lineup scoring within a window of
 * the optimum; candidates are then scanned best-first, so the first one satisfying the caller's
 * diversity rules is the true optimum under those rules. The window doubles until a lineup is found
 * or every lineup has been enumerated.
 */

export type SearchPlayer = {
  salary: number;
  /** One bit per roster slot this player may fill (UTIL included). */
  slotBits: number[];
  team: number;
  locked: boolean;
};

export type Candidate = { picks: number[]; value: number };

const NEG = -32768;
const SCALE = 10;
const FIRST_WINDOW = 3;
const MAX_LEAVES = 1_500_000;
const MAX_TABLE_CELLS = 40_000_000;

const popcount = (n: number) => {
  let c = 0;
  for (; n; n &= n - 1) c++;
  return c;
};

export class LineupSearch {
  private readonly fullMask: number;
  private readonly masks: number;
  private readonly width: number;
  private table: Int16Array | null = null;
  private order: number[] = [];
  private projections: number[] = [];
  private best = NEG;
  private candidates: Candidate[] = [];
  private window = 0;
  private exhaustive = false;
  private scanFrom = 0;

  constructor(
    private readonly players: SearchPlayer[],
    rosterSize: number,
    private readonly cap: number,
    private readonly maxPerTeam: number,
    private readonly minTeams: number,
  ) {
    this.fullMask = (1 << rosterSize) - 1;
    this.masks = 1 << rosterSize;
    this.width = this.masks * (cap + 1);
  }

  /** Whether the bound table fits the memory budget for this pool size and cap. */
  static fits(playerCount: number, rosterSize: number, cap: number) {
    return (playerCount + 1) * (1 << rosterSize) * (cap + 1) <= MAX_TABLE_CELLS;
  }

  reset(projections: number[], banned: Set<number>) {
    this.projections = projections;
    this.order = this.players
      .map((_, i) => i)
      .filter((i) => !banned.has(i))
      .sort((a, b) => projections[b] - projections[a]);
    this.candidates = [];
    this.window = 0;
    this.exhaustive = false;
    this.scanFrom = 0;
    this.buildTable();
  }

  /** Best lineup accepted by `accept`, `null` if none exists, or "overflow" if the search grew too large. */
  next(accept: (picks: number[]) => boolean): Candidate | null | "overflow" {
    if (this.best === NEG) return null;
    for (;;) {
      for (let k = this.scanFrom; k < this.candidates.length; k++) {
        if (accept(this.candidates[k].picks)) {
          // Rules only get stricter over time, so earlier rejects never need rechecking.
          this.scanFrom = k + 1;
          return this.candidates[k];
        }
      }
      this.scanFrom = this.candidates.length;
      if (this.exhaustive) return null;
      if (!this.enumerate(this.window ? this.window * 2 : FIRST_WINDOW)) return "overflow";
    }
  }

  private buildTable() {
    const n = this.order.length;
    const { width, cap, fullMask } = this;
    const size = (n + 1) * width;
    if (!this.table || this.table.length < size) this.table = new Int16Array(size);
    const B = this.table;

    B.fill(NEG, n * width, (n + 1) * width);
    for (let c = 0; c <= cap; c++) B[n * width + c] = 0;

    for (let i = n - 1; i >= 0; i--) {
      const p = this.players[this.order[i]];
      const gain = Math.ceil(this.projections[this.order[i]] * SCALE);
      const base = i * width;
      const next = base + width;
      B.copyWithin(base, next, next + width);
      for (let mask = 1; mask <= fullMask; mask++) {
        for (const bit of p.slotBits) {
          if (!(mask & bit)) continue;
          const from = next + (mask ^ bit) * (cap + 1) - p.salary;
          const to = base + mask * (cap + 1);
          for (let c = p.salary; c <= cap; c++) {
            const prev = B[from + c];
            if (prev !== NEG && prev + gain > B[to + c]) B[to + c] = prev + gain;
          }
        }
      }
    }
    this.best = B[fullMask * (cap + 1) + cap];
  }

  private enumerate(window: number): boolean {
    const { order, players, projections, cap, width, maxPerTeam, minTeams } = this;
    const B = this.table!;
    const n = order.length;
    const bestPts = this.best / SCALE;
    const final = window >= bestPts + 1000;
    const threshold = final ? -Infinity : bestPts - window;
    const thresholdScaled = final ? -Infinity : Math.floor(threshold * SCALE) - 1;

    const lockedAfter = new Int32Array(n + 1);
    for (let i = n - 1; i >= 0; i--) lockedAfter[i] = lockedAfter[i + 1] + (players[order[i]].locked ? 1 : 0);

    const teamCount = new Int32Array(Math.max(0, ...players.map((p) => p.team)) + 1);
    const chosen: number[] = [];
    const seen = new Set<string>();
    const found: Candidate[] = [];
    let leaves = 0;
    let overflow = false;

    const dfs = (i: number, free: number, capLeft: number, scaled: number, value: number) => {
      if (overflow) return;
      if (free === 0) {
        if (lockedAfter[i] > 0 || value < threshold) return;
        if (++leaves > MAX_LEAVES) {
          overflow = true;
          return;
        }
        const key = chosen.join(",");
        if (seen.has(key)) return;
        seen.add(key);

        let teams = 0;
        let ok = true;
        for (const k of chosen) {
          const t = players[order[k]].team;
          if (teamCount[t]++ === 0) teams++;
          if (teamCount[t] > maxPerTeam) ok = false;
        }
        for (const k of chosen) teamCount[players[order[k]].team] = 0;
        if (ok && teams >= minTeams) found.push({ picks: chosen.map((k) => order[k]), value });
        return;
      }
      if (i >= n || lockedAfter[i] > popcount(free)) return;
      const bound = B[i * width + free * (cap + 1) + capLeft];
      if (bound === NEG || scaled + bound < thresholdScaled) return;

      const g = order[i];
      const p = players[g];
      if (p.salary <= capLeft) {
        const gain = Math.ceil(projections[g] * SCALE);
        chosen.push(i);
        for (const bit of p.slotBits) {
          // Different slot choices for the same player set are deduplicated by `seen` at the leaf.
          if (free & bit) dfs(i + 1, free ^ bit, capLeft - p.salary, scaled + gain, value + projections[g]);
        }
        chosen.pop();
      }
      if (!p.locked) dfs(i + 1, free, capLeft, scaled, value);
    };

    dfs(0, this.fullMask, cap, 0, 0);
    if (overflow) return false;

    found.sort((a, b) => b.value - a.value);
    this.candidates = found;
    this.window = window;
    this.exhaustive = final;
    this.scanFrom = 0;
    return true;
  }
}
