"use client";

import { useMemo, useState } from "react";
import type { Player, Position } from "@/lib/types";
import { isOut, valuePer } from "@/lib/format";
import { Avatar, IconButton, StatusBadge, cx } from "./ui";
import { BlockIcon, CloseIcon, LockIcon, SearchIcon } from "./icons";

const TABS: ("ALL" | Position)[] = ["ALL", "PG", "SG", "SF", "PF", "C"];
const SORTS = { proj: "Projection", value: "Value", salary: "Salary" } as const;
type SortKey = keyof typeof SORTS;

type Props = {
  players: Player[];
  isLoading: boolean;
  projectionOf: (p: Player) => number;
  baseProjectionOf: (p: Player) => number;
  locked: Set<string>;
  excluded: Set<string>;
  excludeInjured: boolean;
  onToggleLock: (id: string) => void;
  onToggleExclude: (id: string) => void;
  onOverride: (id: string, value: number | null) => void;
  onReset: () => void;
  onClose: () => void;
  className?: string;
};

export function PlayerPool({
  players,
  isLoading,
  projectionOf,
  baseProjectionOf,
  locked,
  excluded,
  excludeInjured,
  onToggleLock,
  onToggleExclude,
  onOverride,
  onReset,
  onClose,
  className,
}: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("ALL");
  const [sort, setSort] = useState<SortKey>("proj");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = players.filter(
      (p) =>
        (tab === "ALL" || p.positions.includes(tab)) &&
        (!q || p.name.toLowerCase().includes(q) || p.team.toLowerCase() === q),
    );
    const score = (p: Player) =>
      sort === "proj" ? projectionOf(p) : sort === "salary" ? p.salary : valuePer(projectionOf(p), p.salary);
    return filtered.sort((a, b) => {
      const pinned = Number(locked.has(b.id)) - Number(locked.has(a.id));
      return pinned || score(b) - score(a);
    });
  }, [players, tab, sort, query, projectionOf, locked]);

  const overrides = players.filter((p) => projectionOf(p) !== baseProjectionOf(p)).length;
  const dirty = locked.size + excluded.size + overrides > 0;

  return (
    <aside className={cx("flex min-h-0 flex-col bg-tg-bg", className)}>
      <header className="flex h-14 shrink-0 items-center gap-3 px-3">
        <IconButton aria-label="Close player pool" onClick={onClose}>
          <CloseIcon />
        </IconButton>
        <h2 className="flex-1 text-xl font-medium">Player Pool</h2>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg px-2 py-1 text-sm font-medium text-tg-primary hover:bg-tg-primary/10"
          >
            Reset
          </button>
        )}
      </header>

      <div className="px-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-full border-2 border-transparent bg-tg-surface px-3 text-tg-muted focus-within:border-tg-primary focus-within:bg-tg-bg">
          <SearchIcon size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players or team"
            className="w-full bg-transparent text-sm text-tg-text outline-none placeholder:text-tg-muted"
          />
        </label>
        <div className="mt-2 flex items-center gap-2 text-xs text-tg-muted">
          <span>{players.length} players</span>
          <span className="flex items-center gap-1 text-tg-primary">
            <LockIcon size={13} /> {locked.size}
          </span>
          <span className="flex items-center gap-1 text-tg-danger">
            <BlockIcon size={13} /> {excluded.size}
          </span>
          {overrides > 0 && <span>✎ {overrides}</span>}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort players"
            className="ml-auto rounded-md bg-transparent py-0.5 text-xs font-medium text-tg-primary outline-none"
          >
            {Object.entries(SORTS).map(([k, label]) => (
              <option key={k} value={k}>
                Sort: {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav className="flex shrink-0 border-b border-tg-border px-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              "relative flex-1 py-2.5 text-sm font-medium transition-colors",
              tab === t ? "text-tg-primary" : "text-tg-muted hover:text-tg-text",
            )}
          >
            {t === "ALL" ? "All" : t}
            {tab === t && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-tg-primary" />}
          </button>
        ))}
      </nav>

      <div className="tg-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
        {isLoading &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 p-2">
              <div className="size-10 rounded-full bg-tg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 rounded bg-tg-surface" />
                <div className="h-3 w-1/3 rounded bg-tg-surface" />
              </div>
            </div>
          ))}

        {!isLoading && !rows.length && <p className="p-6 text-center text-sm text-tg-muted">No players found.</p>}

        {rows.map((p) => {
          const isLocked = locked.has(p.id);
          const isExcluded = excluded.has(p.id) || (excludeInjured && isOut(p.status) && !isLocked);
          const proj = projectionOf(p);
          const overridden = proj !== baseProjectionOf(p);
          return (
            <div
              key={p.id}
              className={cx(
                "flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-tg-surface",
                isLocked && "bg-tg-primary/8",
                isExcluded && "opacity-45",
              )}
            >
              <Avatar name={p.name} seed={p.team} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-medium">{p.name}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="truncate text-[13px] text-tg-muted">
                  <span className="font-medium text-tg-text">${p.salary}</span> · {p.positions.join("/")} · {p.team}{" "}
                  {p.isHome ? "vs" : "@"} {p.opponent} · {valuePer(proj, p.salary).toFixed(2)}x
                </div>
              </div>
              <input
                key={`${p.id}:${proj}`}
                type="number"
                step="0.1"
                inputMode="decimal"
                defaultValue={proj}
                aria-label={`Projection for ${p.name}`}
                title="Edit projection (clear to reset)"
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                onBlur={(e) => {
                  const raw = e.currentTarget.value.trim();
                  const n = Number(raw);
                  if (raw === "" || !Number.isFinite(n) || n === baseProjectionOf(p)) onOverride(p.id, null);
                  else if (n !== proj) onOverride(p.id, Math.round(n * 100) / 100);
                }}
                className={cx(
                  "w-14 rounded-lg bg-tg-surface px-1.5 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-tg-primary",
                  overridden ? "font-bold text-tg-primary" : "text-tg-text",
                )}
              />
              <div className="flex">
                <IconButton
                  aria-label={isLocked ? `Unlock ${p.name}` : `Lock ${p.name}`}
                  aria-pressed={isLocked}
                  active={isLocked}
                  className="size-8"
                  onClick={() => onToggleLock(p.id)}
                >
                  <LockIcon size={17} open={!isLocked} />
                </IconButton>
                <IconButton
                  aria-label={excluded.has(p.id) ? `Include ${p.name}` : `Exclude ${p.name}`}
                  aria-pressed={excluded.has(p.id)}
                  className={cx("size-8", excluded.has(p.id) && "bg-tg-danger/12 text-tg-danger hover:bg-tg-danger/20")}
                  onClick={() => onToggleExclude(p.id)}
                >
                  <BlockIcon size={17} />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
