import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatMoney } from "../../lib/utils.js";
import { DeltaPill as _DeltaPill } from "./delta.jsx";

export const Card = ({ children, className = "", as: Tag = "div", ...rest }) => (
  <Tag
    {...rest}
    className={`rounded-2xl border border-zinc-700/40 bg-zinc-900/60 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600/50 ${className}`}
  >
    {children}
  </Tag>
);

export const SectionTitle = ({ children, action }) => (
  <div className="mb-3 flex items-center justify-between px-1">
    <h3 className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">{children}</h3>
    {action}
  </div>
);

export const EmptyState = ({ Icon, title, hint, action }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800/80 bg-zinc-900/30 px-6 py-12 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60">
      {Icon && <Icon className="h-5 w-5 text-zinc-400" />}
    </div>
    <div className="text-sm font-medium text-zinc-200">{title}</div>
    {hint && <div className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">{hint}</div>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const Skeleton = ({ className = "" }) => (
  <div className={`animate-pulse rounded-xl bg-gradient-to-r from-zinc-900/80 via-zinc-800/60 to-zinc-900/80 ${className}`} />
);

export const Money = ({ value, hide, currency = "$", className = "" }) => (
  <span className={`tabular-nums ${className}`}>{formatMoney(value, hide, currency)}</span>
);

export const ProgressBar = ({ value, tone = "bronze" }) => {
  const colors = {
    bronze: "bg-gradient-to-r from-amber-700 to-amber-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    zinc: "bg-zinc-400",
  };
  const pct = Math.round(Math.max(0, Math.min(100, value * 100)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${colors[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

export const StatCard = ({ label, value, hint, Icon, tone, delta }) => {
  const toneClass = { success: "text-emerald-400", danger: "text-rose-400", warning: "text-amber-400" }[tone] || "text-white";
  const iconGlow =
    { success: "bg-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.2)]", danger: "bg-rose-500/10 shadow-[0_0_12px_rgba(244,63,94,0.2)]", warning: "bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.2)]" }[tone] || "bg-zinc-800/70";
  const iconColor = { success: "text-emerald-400", danger: "text-rose-400", warning: "text-amber-400" }[tone] || "text-zinc-400";
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${iconGlow}`}>
          {Icon && <Icon className={`h-4 w-4 ${iconColor}`} />}
        </div>
        {delta !== undefined && <_DeltaPill value={delta.value} label={delta.label} />}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </Card>
  );
};
