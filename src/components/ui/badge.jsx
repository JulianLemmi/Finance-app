import { Shield } from "lucide-react";
import { LOAN_STATUSES, RISK_LEVELS, TONES } from "../../lib/constants.js";

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
