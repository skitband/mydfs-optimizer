"use client";

import type { ReactNode } from "react";
import type { ResultLineup, ResultPlayer, SlateResult } from "@/lib/types";
import { formatDay, formatPts } from "@/lib/format";
import { useSlateResult } from "@/hooks/queries";
import type { HistorySlate } from "@/hooks/use-history";
import { BOT_NAME, Bubble, DatePill, TypingBubble } from "./messages";
import { Avatar, IconButton, cx } from "./ui";
import { BackIcon, RefreshIcon } from "./icons";

export function SlateHistory({ slate, onBack }: { slate: HistorySlate; onBack: () => void }) {
  const query = useSlateResult(slate);
  const result = query.data;
  const gameCount = result?.games.length ?? slate.games.length;

  return (
    <>
      <header className="z-10 flex h-14 shrink-0 items-center gap-2 border-b border-tg-border bg-tg-bg px-2 sm:px-4">
        <IconButton aria-label="Back to slates" className="md:hidden" onClick={onBack}>
          <BackIcon />
        </IconButton>
        <Avatar name="NBA" seed={slate.id} size={42} label={<span className="text-[13px] font-bold">{gameCount}G</span>} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-medium">
            {formatDay(slate.startTime)} · {gameCount}-game slate
          </div>
          <div className="truncate text-sm text-tg-muted">
            {query.isPending
              ? "loading results…"
              : result
                ? `${result.final ? "Final" : "Live"} · ${result.contestsChecked} contests tracked · $${result.salaryCap} cap`
                : "results unavailable"}
          </div>
        </div>
        <IconButton aria-label="Reload results" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshIcon size={22} className={cx(query.isFetching && "animate-spin")} />
        </IconButton>
      </header>

      <div className="tg-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[728px] flex-col gap-2 px-3 pt-2 pb-4 sm:px-5">
          <DatePill>{formatDay(slate.startTime)}</DatePill>
          {query.error ? (
            <div className="self-center rounded-xl bg-tg-bg p-3 text-sm text-tg-danger shadow-tg">
              {query.error.message}
            </div>
          ) : result ? (
            <Results result={result} at={query.dataUpdatedAt} />
          ) : (
            <TypingBubble />
          )}
        </div>
      </div>
    </>
  );
}

function Results({ result, at }: { result: SlateResult; at: number }) {
  const { perfect, best, players, salaryCap } = result;
  const overlap = perfect && best ? best.spots.filter((s) => perfect.spots.some((p) => p.playerId === s.playerId)).length : 0;

  return (
    <>
      <Bubble sender={BOT_NAME} at={at}>
        <p>{result.final ? "🏁 Final scores" : "🔴 Slate in progress — points are still updating"}</p>
        <ul className="my-2 space-y-0.5 text-sm">
          {result.games.map((g) => (
            <li key={g.code} className="flex gap-2 whitespace-nowrap tabular-nums">
              <span className="w-[4.5rem] font-medium">
                {g.away} {g.awayScore ?? "–"}
              </span>
              <span className="text-tg-muted">@</span>
              <span className="w-[4.5rem] font-medium">
                {g.home} {g.homeScore ?? "–"}
              </span>
              <span className="ml-auto text-tg-muted">{g.status}</span>
            </li>
          ))}
        </ul>
      </Bubble>

      {perfect && (
        <ResultCard
          title="💯 Perfect lineup"
          subtitle="Highest possible score under the cap, in hindsight"
          lineup={perfect}
          players={players}
          salaryCap={salaryCap}
          at={at}
        />
      )}

      {best && (
        <ResultCard
          title="🏆 Best submitted lineup"
          subtitle={`${best.user} · #${best.rank} of ${best.entryCount} · ${best.contestTitle}`}
          lineup={best}
          players={players}
          salaryCap={salaryCap}
          at={at}
        />
      )}

      <Bubble sender={BOT_NAME} at={at}>
        {best && perfect && perfect.points > 0 ? (
          <p>
            The top entry scored <b>{formatPts(best.points)}</b>, {Math.round((best.points / perfect.points) * 100)}% of
            perfect ({formatPts(perfect.points - best.points)} pts short) with <b>{overlap}/8</b> perfect-lineup players.
          </p>
        ) : (
          <p>
            No scored entries found in the {result.contestsChecked} contest{result.contestsChecked === 1 ? "" : "s"}{" "}
            tracked for this slate.
          </p>
        )}
      </Bubble>
    </>
  );
}

function ResultCard({
  title,
  subtitle,
  lineup,
  players,
  salaryCap,
  at,
}: {
  title: ReactNode;
  subtitle: string;
  lineup: ResultLineup;
  players: Record<string, ResultPlayer>;
  salaryCap: number;
  at: number;
}) {
  const picked = lineup.spots.map((s) => players[s.playerId]);
  const teams = new Set(picked.map((p) => p?.team)).size;
  const projected = picked.reduce((sum, p) => sum + (p?.projection ?? 0), 0);

  return (
    <Bubble at={at} className="w-[min(420px,88vw)]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="rounded-full bg-tg-primary/12 px-2 py-0.5 text-sm font-bold text-tg-primary tabular-nums">
          {formatPts(lineup.points)} pts
        </span>
      </div>
      <div className="mb-1.5 truncate text-xs text-tg-muted">{subtitle}</div>
      <div className="flex gap-2 text-[10px] font-medium tracking-wide text-tg-muted uppercase">
        <span className="flex-1" />
        <span className="w-9 text-right">Sal</span>
        <span className="w-10 text-right">Proj</span>
        <span className="w-11 text-right">Pts</span>
      </div>
      <div className="divide-y divide-tg-border/60">
        {lineup.spots.map(({ slot, playerId }) => {
          const p = players[playerId];
          return (
            <div key={slot} className="flex items-center gap-2 py-1">
              <span className="w-10 shrink-0 rounded-md bg-tg-chip py-0.5 text-center text-[11px] font-bold text-tg-muted">
                {slot}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p?.name ?? playerId}</div>
                {p && (
                  <div className="text-xs text-tg-muted">
                    {p.positions.join("/")} · {p.team} {p.isHome ? "vs" : "@"} {p.opponent}
                  </div>
                )}
              </div>
              <span className="w-9 text-right text-sm tabular-nums">{p ? `$${p.salary}` : ""}</span>
              <span className="w-10 text-right text-xs text-tg-muted tabular-nums">{p ? formatPts(p.projection) : ""}</span>
              <span className="w-11 text-right text-sm font-medium tabular-nums">{p ? formatPts(p.points) : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-xs text-tg-muted">
        ${lineup.salary} / ${salaryCap} · {teams} teams · projected {formatPts(projected)}
      </div>
    </Bubble>
  );
}
