import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface DeltaPillProps {
  value: number;
  label?: string;
}

export const DeltaPill = ({ value, label }: DeltaPillProps) => {
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
