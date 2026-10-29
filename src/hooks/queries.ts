"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Game, OptimizeRequest, OptimizeResponse, Player, Slate, SlateResult } from "@/lib/types";
import type { HistorySlate } from "./use-history";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const queryKeys = {
  slates: ["slates"] as const,
  players: (contestId: number) => ["players", contestId] as const,
  result: (slate: HistorySlate | undefined) => ["result", slate?.id, slate?.contestIds.length] as const,
};

export function useSlates() {
  return useQuery({
    queryKey: queryKeys.slates,
    queryFn: () => request<Slate[]>("/api/slates"),
  });
}

export function usePlayers(contestId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.players(contestId ?? 0),
    queryFn: () => request<{ players: Player[]; games: Game[] }>(`/api/slates/${contestId}/players`),
    enabled: !!contestId,
  });
}

export function useSlateResult(slate: HistorySlate | undefined) {
  return useQuery({
    queryKey: queryKeys.result(slate),
    queryFn: () => request<SlateResult>(`/api/history/${slate?.id}?contests=${slate?.contestIds.join(",")}`),
    enabled: !!slate?.contestIds.length,
    staleTime: (query) => (query.state.data?.final ? Infinity : 60_000),
  });
}

export function useOptimize() {
  return useMutation({
    mutationFn: (body: OptimizeRequest) =>
      request<OptimizeResponse>("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  });
}
