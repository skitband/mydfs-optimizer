"use client";

import { useSyncExternalStore } from "react";
import type { Slate } from "@/lib/types";

export type HistorySlate = Pick<Slate, "id" | "startTime" | "salaryCap" | "games" | "contestIds">;

const KEY = "dfs-slate-history";
const MAX_SLATES = 60;
const EMPTY: HistorySlate[] = [];

let snapshot: HistorySlate[] | null = null;
const listeners = new Set<() => void>();

function read(): HistorySlate[] {
  if (snapshot) return snapshot;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    snapshot = Array.isArray(parsed)
      ? parsed.filter(
          (s): s is HistorySlate =>
            typeof s?.id === "string" && Array.isArray(s.contestIds) && Array.isArray(s.games),
        )
      : [];
  } catch {
    snapshot = [];
  }
  return snapshot;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Yahoo has no public "past contests" listing, so slates are remembered locally while they're upcoming. */
export function rememberSlates(slates: Slate[]) {
  const byId = new Map(read().map((s) => [s.id, s]));
  let changed = false;
  for (const s of slates) {
    const prev = byId.get(s.id);
    const contestIds = [...new Set([...(prev?.contestIds ?? []), ...s.contestIds])];
    if (prev && contestIds.length === prev.contestIds.length && prev.games.length === s.games.length) continue;
    byId.set(s.id, { id: s.id, startTime: s.startTime, salaryCap: s.salaryCap, games: s.games, contestIds });
    changed = true;
  }
  if (!changed) return;

  snapshot = [...byId.values()].sort((a, b) => b.startTime - a.startTime).slice(0, MAX_SLATES);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {}
  listeners.forEach((l) => l());
}

export function useSlateHistory() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
