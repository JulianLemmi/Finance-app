import { Shield } from "lucide-react";
import { LOAN_STATUSES, RISK_LEVELS, TONES } from "../../lib/constants.js";
import type { LoanStatus, RiskLevel } from "../../types";

interface BadgeProps {
  tone?: keyof typeof TONES;
  children?: React.ReactNode;
  className?: string;
}

export const Badge = ({ tone = "neutral", children, className = "" }: BadgeProps) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
      (TONES as Record<string, string>)[tone] || (TONES as Record<string, string>).neutral
    } ${className}`}
  >
    {children}
  </span>
);

export const StatusBadge = ({ status }: { status: LoanStatus }) => {
  const s = (LOAN_STATUSES as Record<string, { label: string; tone: string }>)[status] || LOAN_STATUSES.active;
  return <Badge tone={s.tone as keyof typeof TONES}>{s.label}</Badge>;
};

export const RiskBadge = ({ risk }: { risk: RiskLevel }) => {
  const r = (RISK_LEVELS as Record<string, { label: string; tone: string }>)[risk] || RISK_LEVELS.low;
  return (
    <Badge tone={r.tone as keyof typeof TONES}>
      <Shield className="h-2.5 w-2.5" />
      Riesgo {r.label}
    </Badge>
  );
};
