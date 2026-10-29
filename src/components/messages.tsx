"use client";

import { useState, type ReactNode } from "react";
import type { Game, Lineup } from "@/lib/types";
import { SALARY_CAP } from "@/lib/types";
import { downloadFile, formatPts, formatTime } from "@/lib/format";
import type { ChatMessage, LineupPlayer } from "@/hooks/use-workspace";
import { StatusBadge, cx } from "./ui";
import { ChecksIcon, CopyIcon, DownloadIcon, SlidersIcon, UsersIcon } from "./icons";

export const BOT_NAME = "Lineup Bot";

export function DatePill({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-2 z-10 my-2 flex justify-center">
      <span className="rounded-full bg-tg-date-pill px-2.5 py-0.5 text-[13px] font-medium text-white backdrop-blur-sm">
        {children}
      </span>
    </div>
  );
}

function Meta({ at, out }: { at: number; out?: boolean }) {
  return (
    <span
      className={cx(
        "float-right mt-1.5 ml-3 flex translate-y-1 items-center gap-1 text-xs select-none",
        out ? "text-tg-bubble-out-meta" : "text-tg-muted",
      )}
    >
      {formatTime(at)}
      {out && <ChecksIcon size={16} />}
    </span>
  );
}

export function Bubble({
  out,
  at,
  tail = true,
  sender,
  keyboard,
  children,
  className,
}: {
  out?: boolean;
  at?: number;
  tail?: boolean;
  sender?: string;
  keyboard?: KeyboardButton[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("tg-pop flex", out ? "justify-end" : "justify-start")}>
      <div className="flex max-w-[min(480px,88%)] flex-col">
        <div
          className={cx(
            "px-3 py-1.5 text-[15px] leading-[1.35] shadow-tg",
            out ? "rounded-2xl bg-tg-bubble-out text-tg-bubble-out-text" : "rounded-2xl bg-tg-bubble-in text-tg-text",
            tail && !keyboard && (out ? "tg-bubble-out-tail rounded-br-none" : "tg-bubble-in-tail rounded-bl-none"),
            className,
          )}
        >
          {sender && <div className="mb-0.5 text-sm font-medium text-tg-primary">{sender}</div>}
          {children}
          {at !== undefined && <Meta at={at} out={out} />}
          <div className="clear-both" />
        </div>
        {keyboard && <InlineKeyboard buttons={keyboard} />}
      </div>
    </div>
  );
}

type KeyboardButton = { label: ReactNode; onClick: () => void };

function InlineKeyboard({ buttons }: { buttons: KeyboardButton[] }) {
  return (
    <div className="mt-1 flex w-full gap-1">
      {buttons.map((b, i) => (
        <button
          key={i}
          type="button"
          onClick={b.onClick}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-black/25 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/35"
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

export function TypingBubble() {
  return (
    <Bubble sender={BOT_NAME}>
      <div className="flex items-center gap-1 py-1.5" aria-label="Optimizing">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="tg-typing-dot size-2 rounded-full bg-tg-muted"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </Bubble>
  );
}

export function WelcomeMessage({
  games,
  playerCount,
  at,
  onOpenPool,
  onOpenSettings,
}: {
  games: Game[];
  playerCount: number;
  at: number;
  onOpenPool: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <Bubble
      sender={BOT_NAME}
      at={at}
      keyboard={[
        {
          label: (
            <>
              <UsersIcon size={16} /> Player pool
            </>
          ),
          onClick: onOpenPool,
        },
        {
          label: (
            <>
              <SlidersIcon size={16} /> Settings
            </>
          ),
          onClick: onOpenSettings,
        },
      ]}
    >
      <p>
        🏀 Slate loaded: <b>{games.length} games</b>, <b>{playerCount} players</b>, ${SALARY_CAP} cap.
      </p>
      <ul className="my-2 space-y-0.5 text-sm">
        {games.map((g) => (
          <li key={g.code} className="flex gap-2 whitespace-nowrap tabular-nums">
            <span className="w-[5.5rem] font-medium">
              {g.away} @ {g.home}
            </span>
            <span className="text-tg-muted">{formatTime(g.startTime)}</span>
            {g.overUnder != null && <span className="ml-auto text-tg-muted">O/U {g.overUnder}</span>}
            {g.homeSpread != null && (
              <span className="w-16 text-right text-tg-muted">
                {g.home} {g.homeSpread > 0 ? "+" : ""}
                {g.homeSpread}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        Roster: PG · SG · G · SF · PF · F · C · UTIL. 🔒 Lock or 🚫 exclude players in the pool, tweak projections, then
        hit <b>send</b> and I&apos;ll solve for the optimal lineups.
      </p>
    </Bubble>
  );
}

function lineupText(lineup: Lineup, players: Record<string, LineupPlayer>) {
  return [
    ...lineup.spots.map(({ slot, playerId }) => {
      const p = players[playerId];
      return `${slot.padEnd(4)} ${p?.name ?? playerId} (${p?.team}) $${p?.salary} · ${formatPts(p?.projection ?? 0)}`;
    }),
    `Salary $${lineup.salary}/${SALARY_CAP} · Proj ${formatPts(lineup.projection)}`,
  ].join("\n");
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    },
  };
}

function LineupCard({
  index,
  lineup,
  players,
  at,
}: {
  index: number;
  lineup: Lineup;
  players: Record<string, LineupPlayer>;
  at: number;
}) {
  const { copied, copy } = useCopy();
  const teams = new Set(lineup.spots.map((s) => players[s.playerId]?.team)).size;
  return (
    <Bubble
      at={at}
      className="w-[min(420px,88vw)]"
      keyboard={[
        {
          label: (
            <>
              <CopyIcon size={16} /> {copied === "one" ? "Copied!" : "Copy lineup"}
            </>
          ),
          onClick: () => copy("one", lineupText(lineup, players)),
        },
      ]}
    >
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-medium">Lineup #{index + 1}</span>
        <span className="rounded-full bg-tg-primary/12 px-2 py-0.5 text-sm font-bold text-tg-primary tabular-nums">
          {formatPts(lineup.projection)} pts
        </span>
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
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{p?.name ?? playerId}</span>
                  {p && <StatusBadge status={p.status} />}
                </div>
                <div className="text-xs text-tg-muted">
                  {p?.positions.join("/")} · {p?.team} {p?.isHome ? "vs" : "@"} {p?.opponent}
                </div>
              </div>
              <span className="w-9 text-right text-sm tabular-nums">${p?.salary}</span>
              <span className="w-11 text-right text-sm font-medium tabular-nums">{formatPts(p?.projection ?? 0)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-xs text-tg-muted">
        ${lineup.salary} / ${SALARY_CAP} · ${SALARY_CAP - lineup.salary} left · {teams} teams
      </div>
    </Bubble>
  );
}

function exportCsv(lineups: Lineup[], players: Record<string, LineupPlayer>) {
  const slots = lineups[0]?.spots.map((s) => s.slot) ?? [];
  const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const rows = [
    [...slots, "Salary", "Projection"].join(","),
    ...lineups.map((l) =>
      [...l.spots.map((s) => quote(`${players[s.playerId]?.name ?? ""} (${s.playerId})`)), l.salary, l.projection].join(
        ",",
      ),
    ),
  ];
  downloadFile(`yahoo-nba-lineups-${new Date().toISOString().slice(0, 10)}.csv`, rows.join("\n"));
}

export function MessageView({ message }: { message: ChatMessage }) {
  const { copied, copy } = useCopy();

  if (message.kind === "request") {
    return (
      <Bubble out at={message.at}>
        <span className="font-medium text-tg-primary">{message.command}</span>
        {message.details.length > 0 && <div className="text-sm opacity-80">{message.details.join(" · ")}</div>}
      </Bubble>
    );
  }

  if (message.kind === "error") {
    return (
      <Bubble sender={BOT_NAME} at={message.at}>
        <span className="text-tg-danger">⚠️ {message.text}</span>
      </Bubble>
    );
  }

  const { response, players, at } = message;
  const { lineups } = response;
  const exposure = new Map<string, number>();
  lineups.forEach((l) => l.spots.forEach((s) => exposure.set(s.playerId, (exposure.get(s.playerId) ?? 0) + 1)));
  const topExposure = [...exposure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const best = Math.max(...lineups.map((l) => l.projection), 0);

  return (
    <div className="space-y-2">
      {lineups.map((lineup, i) => (
        <LineupCard key={i} index={i} lineup={lineup} players={players} at={at} />
      ))}
      <Bubble
        sender={BOT_NAME}
        at={at}
        keyboard={
          lineups.length > 0
            ? [
                {
                  label: (
                    <>
                      <DownloadIcon size={16} /> Export CSV
                    </>
                  ),
                  onClick: () => exportCsv(lineups, players),
                },
                {
                  label: (
                    <>
                      <CopyIcon size={16} /> {copied === "all" ? "Copied!" : "Copy all"}
                    </>
                  ),
                  onClick: () =>
                    copy("all", lineups.map((l, i) => `Lineup #${i + 1}\n${lineupText(l, players)}`).join("\n\n")),
                },
              ]
            : undefined
        }
      >
        {lineups.length > 0 ? (
          <>
            <p>
              ✅ Built <b>{lineups.length}</b> of {response.requested} lineup{response.requested === 1 ? "" : "s"} in{" "}
              {response.elapsedMs} ms. Best projection <b>{formatPts(best)}</b>.
            </p>
            {lineups.length > 1 && (
              <div className="mt-1.5">
                <div className="text-xs font-medium tracking-wide text-tg-muted uppercase">Top exposure</div>
                {topExposure.map(([id, count]) => (
                  <div key={id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{players[id]?.name ?? id}</span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-tg-chip">
                      <div
                        className="h-full rounded-full bg-tg-primary"
                        style={{ width: `${(count / lineups.length) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs text-tg-muted tabular-nums">
                      {Math.round((count / lineups.length) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
        {response.message && (
          <p className={cx(lineups.length > 0 && "mt-1.5 text-sm text-tg-muted")}>⚠️ {response.message}</p>
        )}
      </Bubble>
    </div>
  );
}
