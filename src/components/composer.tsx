"use client";

import type { Settings } from "@/hooks/use-workspace";
import { Toggle, cx } from "./ui";
import { SendIcon, SlidersIcon } from "./icons";

type NumericKey = "lineups" | "minUnique" | "maxExposure" | "maxPerTeam" | "randomness";

const RANGES: {
  key: NumericKey;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}[] = [
  { key: "lineups", label: "Lineups", hint: "How many lineups to generate", min: 1, max: 50, step: 1 },
  {
    key: "minUnique",
    label: "Min unique players",
    hint: "Players that must differ between any two lineups",
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: "maxExposure",
    label: "Max exposure",
    hint: "Max share of lineups any unlocked player appears in",
    min: 10,
    max: 100,
    step: 5,
    suffix: "%",
  },
  {
    key: "maxPerTeam",
    label: "Max per team",
    hint: "Yahoo allows up to 6 players from one team",
    min: 2,
    max: 6,
    step: 1,
  },
  {
    key: "randomness",
    label: "Randomness",
    hint: "Jitter projections ±% per lineup for GPP variety",
    min: 0,
    max: 30,
    step: 5,
    suffix: "%",
  },
];

type Props = {
  settings: Settings;
  onChange: (s: Settings) => void;
  onSend: () => void;
  disabled: boolean;
  pending: boolean;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  lockedCount: number;
};

export function Composer({
  settings,
  onChange,
  onSend,
  disabled,
  pending,
  settingsOpen,
  onSettingsOpenChange,
  lockedCount,
}: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  const summary = [
    `${settings.minUnique} unique`,
    settings.maxExposure < 100 && `≤${settings.maxExposure}% exp`,
    settings.randomness > 0 && `±${settings.randomness}%`,
    settings.projectionSource === "fppg" && "FPPG",
    lockedCount > 0 && `🔒${lockedCount}`,
  ].filter(Boolean);

  return (
    <div className="relative mx-auto flex w-full max-w-[728px] items-end gap-2 px-2 pb-3 sm:px-4 sm:pb-5">
      {settingsOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => onSettingsOpenChange(false)} />
          <div className="tg-pop absolute bottom-[76px] left-2 z-30 w-[min(340px,calc(100vw-1rem))] rounded-2xl bg-tg-elevated/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur-md sm:left-4">
            <h3 className="mb-3 font-medium">Optimizer settings</h3>
            <div className="space-y-3.5">
              {RANGES.map((r) => (
                <label key={r.key} className="block">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="font-medium text-tg-primary tabular-nums">
                      {settings[r.key]}
                      {r.suffix}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={settings[r.key]}
                    onChange={(e) => set(r.key, Number(e.target.value))}
                    className="mt-1 w-full accent-tg-primary"
                  />
                  <div className="text-xs text-tg-muted">{r.hint}</div>
                </label>
              ))}

              <div>
                <div className="mb-1 text-sm font-medium">Projection source</div>
                <div className="flex rounded-lg bg-tg-surface p-0.5 text-sm">
                  {(
                    [
                      ["yahoo", "Yahoo projection"],
                      ["fppg", "Season FPPG"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set("projectionSource", value)}
                      className={cx(
                        "flex-1 rounded-md py-1.5 font-medium transition-colors",
                        settings.projectionSource === value
                          ? "bg-tg-primary text-tg-on-primary shadow"
                          : "text-tg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.excludeInjured}
                onClick={() => set("excludeInjured", !settings.excludeInjured)}
                className="flex w-full items-center justify-between text-left text-sm"
              >
                <span>
                  <span className="block font-medium">Skip injured players</span>
                  <span className="text-xs text-tg-muted">Auto-exclude O / INJ statuses unless locked</span>
                </span>
                <Toggle checked={settings.excludeInjured} label="Skip injured players" />
              </button>
            </div>
          </div>
        </>
      )}

      <div className="tg-bubble-out-tail flex h-14 min-w-0 flex-1 items-center gap-1 rounded-2xl rounded-br-none bg-tg-bubble-in pr-3 pl-1 shadow-tg">
        <button
          type="button"
          aria-label="Optimizer settings"
          aria-expanded={settingsOpen}
          onClick={() => onSettingsOpenChange(!settingsOpen)}
          className={cx(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            settingsOpen ? "text-tg-primary" : "text-tg-muted hover:text-tg-primary",
          )}
        >
          <SlidersIcon />
        </button>

        <div className="flex shrink-0 items-center gap-1 text-[15px]">
          <span className="hidden text-tg-muted sm:inline">Generate</span>
          <button
            type="button"
            aria-label="Fewer lineups"
            onClick={() => set("lineups", Math.max(1, settings.lineups - 1))}
            className="flex size-7 items-center justify-center rounded-full bg-tg-surface text-lg leading-none text-tg-muted hover:text-tg-primary"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={50}
            value={settings.lineups}
            aria-label="Number of lineups"
            onChange={(e) => set("lineups", Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
            onKeyDown={(e) => e.key === "Enter" && !disabled && onSend()}
            className="w-9 bg-transparent text-center font-medium tabular-nums outline-none"
          />
          <button
            type="button"
            aria-label="More lineups"
            onClick={() => set("lineups", Math.min(50, settings.lineups + 1))}
            className="flex size-7 items-center justify-center rounded-full bg-tg-surface text-lg leading-none text-tg-muted hover:text-tg-primary"
          >
            +
          </button>
          <span className="text-tg-muted">lineup{settings.lineups === 1 ? "" : "s"}</span>
        </div>

        <button
          type="button"
          onClick={() => onSettingsOpenChange(true)}
          className="ml-auto min-w-0 truncate pl-2 text-right text-sm text-tg-muted hover:text-tg-primary"
        >
          {summary.join(" · ")}
        </button>
      </div>

      <button
        type="button"
        aria-label="Optimize lineups"
        onClick={onSend}
        disabled={disabled}
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-tg-primary text-tg-on-primary shadow-tg transition-all hover:bg-tg-primary-hover active:scale-95 disabled:opacity-50"
      >
        {pending ? (
          <span className="size-6 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
        ) : (
          <SendIcon size={26} className="translate-x-0.5" />
        )}
      </button>
    </div>
  );
}
