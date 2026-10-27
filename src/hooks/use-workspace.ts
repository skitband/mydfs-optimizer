"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { OptimizeResponse, OptimizeSettings, Player } from "@/lib/types";

export type Settings = OptimizeSettings & {
  projectionSource: "yahoo" | "fppg";
  excludeInjured: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  lineups: 5,
  minUnique: 2,
  maxExposure: 100,
  maxPerTeam: 6,
  randomness: 0,
  projectionSource: "yahoo",
  excludeInjured: true,
};

export type LineupPlayer = Pick<
  Player,
  "id" | "name" | "team" | "opponent" | "isHome" | "salary" | "positions" | "status"
> & {
  projection: number;
};

export type ChatMessage =
  | { id: string; at: number; kind: "request"; command: string; details: string[] }
  | { id: string; at: number; kind: "result"; response: OptimizeResponse; players: Record<string, LineupPlayer> }
  | { id: string; at: number; kind: "error"; text: string };

export type Workspace = {
  locked: string[];
  excluded: string[];
  overrides: Record<string, number>;
  messages: ChatMessage[];
};

const EMPTY: Workspace = { locked: [], excluded: [], overrides: {}, messages: [] };

let messageSeq = 0;
export const newMessageId = () => `m${Date.now().toString(36)}${(messageSeq++).toString(36)}`;

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Record<string, Workspace>>({});

  const update = useCallback((slateId: string, fn: (ws: Workspace) => Workspace) => {
    setWorkspaces((all) => ({ ...all, [slateId]: fn(all[slateId] ?? EMPTY) }));
  }, []);

  const get = useCallback((slateId: string | undefined) => (slateId && workspaces[slateId]) || EMPTY, [workspaces]);

  return { get, update };
}

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useTheme() {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );
  const setDark = useCallback((value: boolean) => {
    const theme = value ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("tg-theme", theme);
    } catch {}
  }, []);
  return { dark, setDark };
}
