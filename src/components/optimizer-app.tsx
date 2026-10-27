"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "@/lib/types";
import { formatDay, isOut } from "@/lib/format";
import { usePlayers, useOptimize, useSlates } from "@/hooks/queries";
import { useEscape } from "@/hooks/use-escape";
import {
  DEFAULT_SETTINGS,
  newMessageId,
  useWorkspaces,
  type ChatMessage,
  type LineupPlayer,
  type Settings,
} from "@/hooks/use-workspace";
import { Sidebar } from "./sidebar";
import { PlayerPool } from "./player-pool";
import { Composer } from "./composer";
import { DatePill, MessageView, TypingBubble, WelcomeMessage } from "./messages";
import { Avatar, IconButton, cx } from "./ui";
import { BackIcon, RefreshIcon, TrashIcon, UsersIcon } from "./icons";

const isXl = () => window.matchMedia("(min-width: 1280px)").matches;

export function OptimizerApp() {
  const slatesQuery = useSlates();
  const [selectedId, setSelectedId] = useState<string>();
  const [mobileChat, setMobileChat] = useState(false);
  const [poolOpen, setPoolOpen] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pendingSlate, setPendingSlate] = useState<string>();
  const workspaces = useWorkspaces();
  const optimizer = useOptimize();

  const slates = slatesQuery.data;
  const slate = slates?.find((s) => s.id === selectedId) ?? slates?.[0];
  const playersQuery = usePlayers(slate?.contestId);
  const players = useMemo(() => playersQuery.data?.players ?? [], [playersQuery.data]);
  const games = playersQuery.data?.games ?? slate?.games ?? [];

  const ws = workspaces.get(slate?.id);
  const locked = useMemo(() => new Set(ws.locked), [ws.locked]);
  const excluded = useMemo(() => new Set(ws.excluded), [ws.excluded]);

  const baseProjectionOf = useCallback(
    (p: Player) => (settings.projectionSource === "fppg" ? p.fppg : p.projection),
    [settings.projectionSource],
  );
  const projectionOf = useCallback(
    (p: Player) => ws.overrides[p.id] ?? baseProjectionOf(p),
    [ws.overrides, baseProjectionOf],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const isPending = pendingSlate !== undefined && pendingSlate === slate?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [ws.messages.length, isPending, slate?.id]);

  const updateSets = (fn: (sets: { locked: Set<string>; excluded: Set<string> }) => void) => {
    if (!slate) return;
    workspaces.update(slate.id, (w) => {
      const sets = { locked: new Set(w.locked), excluded: new Set(w.excluded) };
      fn(sets);
      return { ...w, locked: [...sets.locked], excluded: [...sets.excluded] };
    });
  };

  const toggleLock = (id: string) =>
    updateSets(({ locked, excluded }) => {
      if (locked.has(id)) locked.delete(id);
      else {
        locked.add(id);
        excluded.delete(id);
      }
    });

  const toggleExclude = (id: string) =>
    updateSets(({ locked, excluded }) => {
      if (excluded.has(id)) excluded.delete(id);
      else {
        excluded.add(id);
        locked.delete(id);
      }
    });

  const setOverride = (id: string, value: number | null) => {
    if (!slate) return;
    workspaces.update(slate.id, (w) => {
      const overrides = { ...w.overrides };
      if (value === null) delete overrides[id];
      else overrides[id] = value;
      return { ...w, overrides };
    });
  };

  const resetPool = () =>
    slate && workspaces.update(slate.id, (w) => ({ ...w, locked: [], excluded: [], overrides: {} }));
  const clearChat = () => slate && workspaces.update(slate.id, (w) => ({ ...w, messages: [] }));

  const append = (slateId: string, message: ChatMessage) =>
    workspaces.update(slateId, (w) => ({ ...w, messages: [...w.messages, message] }));

  const send = async () => {
    if (!slate || !players.length || pendingSlate) return;
    const slateId = slate.id;
    const pool = players.filter(
      (p) => locked.has(p.id) || (!excluded.has(p.id) && !(settings.excludeInjured && isOut(p.status))),
    );
    const overrideCount = Object.keys(ws.overrides).length;

    setSettingsOpen(false);
    append(slateId, {
      id: newMessageId(),
      at: Date.now(),
      kind: "request",
      command: `/optimize ${settings.lineups}`,
      details: [
        `min ${settings.minUnique} unique`,
        settings.maxExposure < 100 ? `≤${settings.maxExposure}% exposure` : "",
        settings.maxPerTeam < 6 ? `≤${settings.maxPerTeam} per team` : "",
        settings.randomness > 0 ? `±${settings.randomness}% random` : "",
        settings.projectionSource === "fppg" ? "FPPG" : "",
        locked.size ? `🔒 ${locked.size}` : "",
        excluded.size ? `🚫 ${excluded.size}` : "",
        overrideCount ? `✎ ${overrideCount}` : "",
      ].filter(Boolean),
    });

    setPendingSlate(slateId);
    try {
      const response = await optimizer.mutateAsync({
        players: pool.map((p) => ({
          id: p.id,
          team: p.team,
          salary: p.salary,
          positions: p.positions,
          projection: projectionOf(p),
        })),
        locked: [...locked],
        salaryCap: slate.salaryCap,
        settings: {
          lineups: settings.lineups,
          minUnique: settings.minUnique,
          maxExposure: settings.maxExposure,
          maxPerTeam: settings.maxPerTeam,
          randomness: settings.randomness,
        },
      });
      const used = new Set(response.lineups.flatMap((l) => l.spots.map((s) => s.playerId)));
      const snapshot: Record<string, LineupPlayer> = {};
      for (const p of pool) {
        if (!used.has(p.id)) continue;
        snapshot[p.id] = {
          id: p.id,
          name: p.name,
          team: p.team,
          opponent: p.opponent,
          isHome: p.isHome,
          salary: p.salary,
          positions: p.positions,
          status: p.status,
          projection: projectionOf(p),
        };
      }
      append(slateId, { id: newMessageId(), at: Date.now(), kind: "result", response, players: snapshot });
    } catch (err) {
      append(slateId, {
        id: newMessageId(),
        at: Date.now(),
        kind: "error",
        text: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setPendingSlate(undefined);
    }
  };

  const openPool = () => setPoolOpen(true);
  const togglePool = () => setPoolOpen((o) => !(o ?? isXl()));
  const closeOverlays = useCallback(() => {
    if (settingsOpen) setSettingsOpen(false);
    else setPoolOpen((o) => (o && !isXl() ? false : o));
  }, [settingsOpen]);
  useEscape(settingsOpen || poolOpen === true, closeOverlays);

  return (
    <div className="relative flex h-dvh overflow-hidden">
      <Sidebar
        slates={slates}
        isLoading={slatesQuery.isPending}
        error={slatesQuery.error}
        selectedId={slate?.id}
        onSelect={(id) => {
          setSelectedId(id);
          setMobileChat(true);
          setSettingsOpen(false);
        }}
        onRefresh={() => slatesQuery.refetch()}
        className={cx("w-full shrink-0 md:w-[320px] lg:w-[380px]", mobileChat ? "hidden md:flex" : "flex")}
      />

      <main className={cx("tg-wallpaper min-w-0 flex-1 flex-col", mobileChat ? "flex" : "hidden md:flex")}>
        {slate ? (
          <>
            <header className="z-10 flex h-14 shrink-0 items-center gap-2 border-b border-tg-border bg-tg-bg px-2 sm:px-4">
              <IconButton aria-label="Back to slates" className="md:hidden" onClick={() => setMobileChat(false)}>
                <BackIcon />
              </IconButton>
              <Avatar
                name="NBA"
                seed={slate.id}
                size={42}
                label={<span className="text-[13px] font-bold">{games.length}G</span>}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate font-medium">
                  {formatDay(slate.startTime)} · {games.length}-game slate
                </div>
                <div className={cx("truncate text-sm", isPending ? "text-tg-primary" : "text-tg-muted")}>
                  {isPending
                    ? "Lineup Bot is optimizing…"
                    : playersQuery.isPending
                      ? "loading players…"
                      : `${players.length} players · ${slate.contestCount} contests · $${slate.salaryCap} cap`}
                </div>
              </div>
              <IconButton
                aria-label="Reload players"
                onClick={() => playersQuery.refetch()}
                disabled={playersQuery.isFetching}
              >
                <RefreshIcon size={22} className={cx(playersQuery.isFetching && "animate-spin")} />
              </IconButton>
              <IconButton aria-label="Clear chat" onClick={clearChat} disabled={!ws.messages.length}>
                <TrashIcon size={22} />
              </IconButton>
              <IconButton aria-label="Toggle player pool" onClick={togglePool} active={poolOpen ?? undefined}>
                <UsersIcon size={22} />
              </IconButton>
            </header>

            <div ref={scrollRef} className="tg-scroll min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex max-w-[728px] flex-col gap-2 px-3 pt-2 pb-4 sm:px-5">
                <DatePill>{formatDay(slate.startTime)}</DatePill>
                {playersQuery.error ? (
                  <div className="self-center rounded-xl bg-tg-bg p-3 text-sm text-tg-danger shadow-tg">
                    {playersQuery.error.message}
                  </div>
                ) : playersQuery.data ? (
                  <WelcomeMessage
                    games={games}
                    playerCount={players.length}
                    at={playersQuery.dataUpdatedAt}
                    onOpenPool={openPool}
                    onOpenSettings={() => setSettingsOpen(true)}
                  />
                ) : (
                  <TypingBubble />
                )}
                {ws.messages.map((m) => (
                  <MessageView key={m.id} message={m} />
                ))}
                {isPending && <TypingBubble />}
              </div>
            </div>

            <Composer
              settings={settings}
              onChange={setSettings}
              onSend={send}
              disabled={!players.length || !!pendingSlate}
              pending={isPending}
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
              lockedCount={locked.size}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <span className="rounded-full bg-tg-date-pill px-3 py-1 text-sm font-medium text-white">
              {slatesQuery.isPending ? "Loading slates…" : "Select a slate to start optimizing"}
            </span>
          </div>
        )}
      </main>

      {slate && (
        <PlayerPool
          players={players}
          isLoading={playersQuery.isPending}
          projectionOf={projectionOf}
          baseProjectionOf={baseProjectionOf}
          locked={locked}
          excluded={excluded}
          excludeInjured={settings.excludeInjured}
          onToggleLock={toggleLock}
          onToggleExclude={toggleExclude}
          onOverride={setOverride}
          onReset={resetPool}
          onClose={() => setPoolOpen(false)}
          className={cx(
            "fixed inset-0 z-40 md:absolute md:inset-y-0 md:right-0 md:left-auto md:w-[400px] md:shadow-2xl",
            "xl:static xl:z-auto xl:w-[400px] xl:shrink-0 xl:border-l xl:border-tg-border xl:shadow-none",
            poolOpen === null ? "hidden xl:flex" : poolOpen ? "flex" : "hidden",
          )}
        />
      )}
    </div>
  );
}
