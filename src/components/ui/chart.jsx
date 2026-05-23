import { useEffect, useState, useRef } from "react";
import { formatMoney } from "../../lib/utils.js";

export const ChartTooltip = ({ active, payload, label, hide, currency = "$" }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur">
      {label !== undefined && <div className="mb-1.5 font-medium text-zinc-200">{label}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
            <span className="text-zinc-300">{p.name}:</span>
            <span className="font-medium tabular-nums text-zinc-100">{formatMoney(p.value, hide, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

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
