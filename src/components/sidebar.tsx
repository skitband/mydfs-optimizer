"use client";

import { useCallback, useState } from "react";
import type { Game, Slate } from "@/lib/types";
import { formatDay, formatTime } from "@/lib/format";
import { useTheme } from "@/hooks/use-workspace";
import { useEscape } from "@/hooks/use-escape";
import type { HistorySlate } from "@/hooks/use-history";
import { Avatar, IconButton, Toggle, cx } from "./ui";
import { InfoIcon, MenuIcon, MoonIcon, RefreshIcon, SearchIcon } from "./icons";

export type SidebarTab = "upcoming" | "history";

type Props = {
  slates: Slate[] | undefined;
  history: HistorySlate[];
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  isLoading: boolean;
  error: Error | null;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  className?: string;
};

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "history", label: "History" },
];

export function Sidebar({
  slates,
  history,
  tab,
  onTabChange,
  isLoading,
  error,
  selectedId,
  onSelect,
  onRefresh,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { dark, setDark } = useTheme();
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEscape(menuOpen, closeMenu);

  const q = query.trim().toUpperCase();
  const matches = (s: { games: Game[] }) => !q || s.games.some((g) => g.home.includes(q) || g.away.includes(q));
  const visible = (slates ?? []).filter(matches);
  const visibleHistory = history.filter(matches);

  return (
    <aside className={cx("flex min-h-0 flex-col border-r border-tg-border bg-tg-bg", className)}>
      <div className="relative flex items-center gap-2 px-3 py-2">
        <IconButton aria-label="Menu" onClick={() => setMenuOpen((o) => !o)} active={menuOpen}>
          <MenuIcon />
        </IconButton>
        <label className="flex h-[42px] flex-1 items-center gap-2 rounded-full border-2 border-transparent bg-tg-surface px-3 text-tg-muted focus-within:border-tg-primary focus-within:bg-tg-bg">
          <SearchIcon size={20} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team (e.g. LAL)"
            className="w-full bg-transparent text-[15px] text-tg-text outline-none placeholder:text-tg-muted"
          />
        </label>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div className="tg-pop absolute top-14 left-3 z-30 w-64 rounded-xl bg-tg-elevated/95 p-1 shadow-xl ring-1 ring-black/5 backdrop-blur">
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={dark}
                onClick={() => setDark(!dark)}
                className="flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-tg-surface"
              >
                <MoonIcon size={20} className="text-tg-muted" />
                <span className="flex-1 text-left">Night Mode</span>
                <Toggle checked={dark} label="Night mode" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onRefresh();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-tg-surface"
              >
                <RefreshIcon size={20} className="text-tg-muted" />
                Refresh slates
              </button>
              <div className="flex gap-4 px-3 py-2.5 text-xs text-tg-muted">
                <InfoIcon size={20} className="shrink-0" />
                <span>Salaries, projections &amp; injuries come live from Yahoo Daily Fantasy&apos;s public feed.</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div role="tablist" className="flex border-b border-tg-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTabChange(t.id)}
            className={cx(
              "relative px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "text-tg-primary" : "text-tg-muted hover:text-tg-text",
            )}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-tg-primary" />}
          </button>
        ))}
      </div>

      <div className="tg-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 p-2">
              <div className="size-[54px] rounded-full bg-tg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-tg-surface" />
                <div className="h-3 w-1/2 rounded bg-tg-surface" />
              </div>
            </div>
          ))}

        {error && (
          <div className="m-3 rounded-xl bg-tg-danger/10 p-3 text-sm text-tg-danger">
            {error.message}
            <button type="button" onClick={onRefresh} className="mt-2 block font-medium underline">
              Try again
            </button>
          </div>
        )}

        {tab === "upcoming" && slates && !visible.length && (
          <p className="p-6 text-center text-sm text-tg-muted">
            {slates.length
              ? "No slates match that team."
              : "No upcoming Yahoo NBA slates right now. Check back closer to game day."}
          </p>
        )}

        {tab === "history" && slates && !visibleHistory.length && (
          <p className="p-6 text-center text-sm text-tg-muted">
            {history.length
              ? "No past slates match that team."
              : "No past slates yet. Slates you see under Upcoming show up here once they lock."}
          </p>
        )}

        {tab === "upcoming" &&
          visible.map((slate) => (
            <SlateRow
              key={slate.id}
              slate={slate}
              active={slate.id === selectedId}
              onClick={() => onSelect(slate.id)}
              count={slate.contestCount}
            />
          ))}

        {tab === "history" &&
          slates &&
          visibleHistory.map((slate) => (
            <SlateRow
              key={slate.id}
              slate={slate}
              active={slate.id === selectedId}
              onClick={() => onSelect(slate.id)}
              count={slate.contestIds.length}
            />
          ))}
      </div>
    </aside>
  );
}

function SlateRow({
  slate,
  active,
  onClick,
  count,
}: {
  slate: { id: string; startTime: number; games: Game[] };
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  const matchups = slate.games.map((g) => `${g.away} @ ${g.home}`).join(", ");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors",
        active ? "bg-tg-primary text-tg-on-primary" : "hover:bg-tg-surface",
      )}
    >
      <Avatar
        name="NBA"
        seed={slate.id}
        label={<span className="text-[15px] font-bold">{slate.games.length || "?"}G</span>}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">
            {formatDay(slate.startTime)} · {slate.games.length}-game slate
          </span>
          <span className={cx("ml-auto shrink-0 text-xs", active ? "text-white/80" : "text-tg-muted")}>
            {formatTime(slate.startTime)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cx("truncate text-[15px]", active ? "text-white/85" : "text-tg-muted")}>
            {matchups || "Loading games…"}
          </span>
          <span
            title={`${count} contests`}
            className={cx(
              "ml-auto min-w-6 shrink-0 rounded-full px-1.5 text-center text-xs leading-6 font-medium",
              active ? "bg-white text-tg-primary" : "bg-tg-muted/70 text-white",
            )}
          >
            {count}
          </span>
        </div>
      </div>
    </button>
  );
}
