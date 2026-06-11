import { useEffect, useState } from "react";
import type { ReactNode, ElementType } from "react";
import type { LucideIcon } from "lucide-react";
import { formatMoney } from "../../lib/utils.js";

interface CardProps {
  children?: ReactNode;
  className?: string;
  as?: ElementType;
  [key: string]: unknown;
}

export const Card = ({ children, className = "", as: Tag = "div", ...rest }: CardProps) => (
  <Tag
    className={`rounded-2xl border border-zinc-800/70 bg-zinc-900/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-300 ${className}`}
    {...rest}
  >
    {children}
  </Tag>
);

interface SectionTitleProps {
  children?: ReactNode;
  action?: ReactNode;
}

export const SectionTitle = ({ children, action }: SectionTitleProps) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</h2>
    {action && <div>{action}</div>}
  </div>
);

interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}

export const EmptyState = ({ Icon, title, hint, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-900/30 px-6 py-12 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60">
      <Icon className="h-5 w-5 text-zinc-500" />
    </div>
    <div className="text-sm font-medium text-zinc-300">{title}</div>
    {hint && <div className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">{hint}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

interface MoneyProps {
  value: number | string;
  hide?: boolean;
  currency?: string;
  className?: string;
}

export const Money = ({ value, hide, currency = "$", className = "" }: MoneyProps) => (
  <span className={`tabular-nums ${className}`}>{formatMoney(value, hide, currency)}</span>
);

interface ProgressBarProps {
  value: number;
  tone?: string;
}

export const ProgressBar = ({ value, tone = "bronze" }: ProgressBarProps) => {
  const colors: Record<string, string> = {
    bronze: "bg-gradient-to-r from-amber-700 to-amber-500",
    rose: "bg-rose-500",
    emerald: "bg-emerald-500",
  };
  const bar = colors[tone] ?? colors.bronze;
  const pct = Math.max(0, Math.min(100, Number(value || 0) * 100));
  // Arranca en 0 y se llena al montar para que el progreso "entre" animado.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className={`fa-bar-shine h-full rounded-full ${bar}`}
        style={{ width: `${mounted ? pct : 0}%`, transition: "width 800ms cubic-bezier(.22,1,.36,1)" }}
      />
    </div>
  );
};

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-zinc-800/70 ${className}`} />
);

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  Icon?: LucideIcon;
  tone?: string;
  delta?: number;
}

export const StatCard = ({ label, value, hint, Icon, tone }: StatCardProps) => {
  const toneColors: Record<string, string> = {
    success: "text-emerald-400",
    danger: "text-rose-400",
    warning: "text-amber-400",
  };
  const valueColor = tone ? (toneColors[tone] ?? "text-zinc-100") : "text-zinc-100";
  return (
    <Card className="group p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700/70 hover:bg-zinc-900/70">
      {Icon && (
        <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${tone === "success" ? "bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.12)]" : tone === "danger" ? "bg-rose-500/10 shadow-[0_0_12px_rgba(244,63,94,0.12)]" : "bg-zinc-800/70"}`}>
          <Icon className={`h-3.5 w-3.5 ${tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-rose-400" : "text-zinc-400"}`} />
        </div>
      )}
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-zinc-600">{hint}</div>}
    </Card>
  );
};
