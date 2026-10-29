# Lineup Bot — Yahoo NBA DFS Lineup Optimizer

A Telegram-inspired web app that builds optimal **Yahoo Daily Fantasy NBA** lineups from live Yahoo salaries,
projections and injury statuses.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4 and TanStack Query 5.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
```

```bash
npm run build && npm start   # production
npm run lint
npx tsc --noEmit
```

No API keys are required.

## Data source

Yahoo Daily Fantasy exposes public, read-only JSON endpoints (the same ones its own web app uses). The app proxies
them through Next.js route handlers (cached in memory for 60 s):

| Route | Upstream |
| --- | --- |
| `GET /api/slates` | `https://dfyql-ro.sports.yahoo.com/v2/contestsFilteredWeb?sport=nba` — upcoming multi-game contests, grouped into slates by `seriesId` |
| `GET /api/slates/:contestId/players` | `https://dfyql-ro.sports.yahoo.com/v2/contestPlayers?contestId=…` — salaries, eligible positions, Yahoo projections, FPPG, injury status, Vegas lines |
| `GET /api/history/:seriesId?contests=…` | `series/:id`, `contestPlayers` (actual `points`), `contestEntries` + `contestEntry/:id` — final scores, perfect lineup (solved on actual points) and the top-scoring entry across the given contests |
| `POST /api/optimize` | Lineup solver (runs on the server) |

These endpoints are unofficial and may change without notice.

## Yahoo NBA rules enforced

- 8 slots: **PG, SG, G (PG/SG), SF, PF, F (SF/PF), C, UTIL**
- **$200** salary cap
- Players from at least **3 teams**, at most **6** from one team (configurable lower)

## Optimizer

`src/lib/lineup-search.ts` is an exact best-first search: a DP table bounds the best possible completion for any
partial lineup, and a DFS enumerates every valid lineup within a widening window of the optimum. Lineups are produced
sequentially — each is the highest-projected lineup that satisfies the rules, locks, exposure caps and the
"min unique players" constraint against all previous lineups. Typical runs take well under a second for 50 lineups.

For extreme settings where enumeration would explode, it falls back to an exact MILP solved with
[HiGHS](https://highs.dev) (WebAssembly, `highs` package).

Features: lock / exclude players, edit projections, Yahoo projection or season FPPG, skip injured (O/INJ), number of
lineups (1–50), min unique players, max exposure, max per team, projection randomness for GPP variety, copy lineups,
CSV export, light/dark (Night Mode) themes.

## Project layout

```
src/app/                 routes (page, layout, API route handlers)
src/components/          Telegram-style UI (sidebar, chat, composer, player pool)
src/hooks/               TanStack Query hooks, workspace state
src/lib/                 Yahoo client, optimizer, shared types
```
