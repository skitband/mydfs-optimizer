import type { ButtonHTMLAttributes, ReactNode } from "react";
import { avatarGradient, initials } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Avatar({
  name,
  seed,
  size = 54,
  label,
  className,
}: {
  name: string;
  seed?: string;
  size?: number;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white select-none",
        className,
      )}
      style={{ width: size, height: size, background: avatarGradient(seed ?? name), fontSize: size * 0.36 }}
    >
      {label ?? initials(name)}
    </div>
  );
}

export function IconButton({
  children,
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        active ? "bg-tg-primary/12 text-tg-primary" : "text-tg-muted hover:bg-tg-surface",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label: string;
}) {
  const track = cx(
    "relative block h-[14px] w-8 shrink-0 rounded-full transition-colors",
    checked ? "bg-tg-primary" : "bg-tg-muted/40",
  );
  const knob = (
    <span
      className={cx(
        "absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 bg-tg-elevated transition-all",
        checked ? "left-[14px] border-tg-primary" : "left-0 border-tg-muted/70",
      )}
    />
  );
  if (!onChange) {
    return (
      <span aria-hidden className={track}>
        {knob}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={track}
    >
      {knob}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (!status) return null;
  const danger = ["O", "INJ", "SUSP", "D"].includes(status.toUpperCase());
  return (
    <span
      className={cx(
        "rounded px-1 py-px text-[10px] font-bold leading-none",
        danger ? "bg-tg-danger/15 text-tg-danger" : "bg-tg-warning/20 text-tg-warning",
      )}
    >
      {status}
    </span>
  );
}
