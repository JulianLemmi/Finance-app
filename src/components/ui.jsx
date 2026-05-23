import React, { useEffect, useState, useRef } from "react";
import {
  Shield, ChevronDown, X, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { LOAN_STATUSES, RISK_LEVELS, TONES } from "../lib/constants.js";
import { formatMoney } from "../lib/utils.js";

export const Badge = ({ tone = "neutral", children, className = "" }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
      TONES[tone] || TONES.neutral
    } ${className}`}
  >
    {children}
  </span>
);

export const StatusBadge = ({ status }) => {
  const s = LOAN_STATUSES[status] || LOAN_STATUSES.active;
  return <Badge tone={s.tone}>{s.label}</Badge>;
};

export const RiskBadge = ({ risk }) => {
  const r = RISK_LEVELS[risk] || RISK_LEVELS.low;
  return (
    <Badge tone={r.tone}>
      <Shield className="h-2.5 w-2.5" />
      Riesgo {r.label}
    </Badge>
  );
};

export const Button = ({ variant = "primary", size = "md", Icon, children, className = "", ...rest }) => {
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-sm" };
  const variants = {
    primary: "bg-white text-zinc-950 hover:bg-zinc-100 active:bg-zinc-200 active:scale-[0.985] shadow-[0_2px_12px_rgba(255,255,255,0.1)]",
    secondary: "border border-zinc-700/60 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800/80 hover:border-zinc-600/60 active:scale-[0.985] backdrop-blur-sm",
    ghost: "text-zinc-300 hover:bg-zinc-800/60 hover:text-white active:scale-[0.985]",
    bronze: "btn-shine bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 hover:from-amber-500 hover:to-amber-700 active:scale-[0.985] shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset,0_4px_20px_rgba(180,83,9,0.45)] hover:shadow-[0_4px_28px_rgba(180,83,9,0.65)] transition-shadow",
    danger: "bg-rose-600/10 text-rose-400 border border-rose-600/30 hover:bg-rose-600/20 active:scale-[0.985]",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
};

export const IconButton = ({ Icon, "aria-label": ariaLabel, className = "", ...rest }) => (
  <button
    {...rest}
    aria-label={ariaLabel}
    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800/70 bg-zinc-900/70 text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-95 ${className}`}
  >
    <Icon className="h-4 w-4" />
  </button>
);

export const Input = React.forwardRef(function Input({ label, hint, error, Icon, className = "", ...rest }, ref) {
  return (
    <label className="block">
      {label && (
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      )}
      <div
        className={`relative flex items-center rounded-xl border transition-colors ${
          error
            ? "border-rose-700/60 bg-rose-950/20"
            : "border-zinc-800 bg-zinc-900/60 focus-within:border-zinc-600 focus-within:bg-zinc-900"
        }`}
      >
        {Icon && <Icon className="ml-3 h-4 w-4 shrink-0 text-zinc-500" />}
        <input
          ref={ref}
          {...rest}
          className={`w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none ${className}`}
        />
      </div>
      {hint && !error && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
      {error && <div className="mt-1 text-[11px] text-rose-400">{error}</div>}
    </label>
  );
});

export const Select = ({ label, value, onChange, options, Icon }) => (
  <label className="block">
    {label && (
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
    )}
    <div className="relative flex items-center rounded-xl border border-zinc-800 bg-zinc-900/60 transition-colors focus-within:border-zinc-600 focus-within:bg-zinc-900">
      {Icon && <Icon className="ml-3 h-4 w-4 shrink-0 text-zinc-500" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-transparent px-3 py-2.5 pr-9 text-sm text-zinc-100 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-500" />
    </div>
  </label>
);

export const Textarea = ({ label, ...rest }) => (
  <label className="block">
    {label && (
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
    )}
    <textarea
      {...rest}
      className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
    />
  </label>
);

export const Toggle = ({ checked, onChange, label, hint }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between rounded-2xl border border-zinc-800/70 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
  >
    <div className="min-w-0">
      <div className="text-sm font-medium text-zinc-100">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </span>
  </button>
);

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

export const DeltaPill = ({ value, label }) => {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
      }`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {label}
    </span>
  );
};

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
        {delta !== undefined && <DeltaPill value={delta.value} label={delta.label} />}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </Card>
  );
};

export const ChartTooltip = ({ active, payload, label, hide, currency = "$" }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      {label !== undefined && <div className="mb-1.5 font-medium text-zinc-300">{label}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
            <span className="text-zinc-500">{p.name}:</span>
            <span className="font-medium tabular-nums text-zinc-100">{formatMoney(p.value, hide, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function Sheet({ open, onClose, title, subtitle, footer, children, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ animation: "fa-fade 180ms ease-out" }}>
      <button aria-label="cerrar" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative flex h-[92vh] w-full flex-col rounded-t-3xl border border-zinc-800/80 bg-zinc-950 shadow-2xl sm:h-auto sm:max-h-[88vh] sm:rounded-3xl ${widths[size]}`}
        style={{ animation: "fa-sheet 220ms cubic-bezier(.22,1,.36,1)" }}
      >
        <div className="flex items-start justify-between border-b border-zinc-900/80 px-5 py-4">
          <div className="flex-1 pr-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-800 sm:hidden" />
            <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <IconButton Icon={X} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="border-t border-zinc-900/80 bg-zinc-950/95 px-5 py-3 backdrop-blur">{footer}</div>
        )}
      </div>
    </div>
  );
}

// Measures its own dimensions via ResizeObserver and passes them to children as render prop.
// Bypasses ResponsiveContainer entirely — Recharts never sees width/height -1.
export function ChartContainer({ className, children }) {
  const ref = useRef(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {size ? children(size) : null}
    </div>
  );
}
