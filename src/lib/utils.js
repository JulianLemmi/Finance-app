export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDays = (isoDate, days) => {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

export const parseISO = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? null : d;
};

export const daysBetween = (a, b) => {
  const da = typeof a === "string" ? parseISO(a) : a;
  const db = typeof b === "string" ? parseISO(b) : b;
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
};

export const monthKey = (iso) => (iso || "").slice(0, 7);

export const formatMoney = (value, hidden = false, currency = "$") => {
  if (hidden) return "••••••";
  const n = Number(value || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${sign}${currency}${formatted}`;
};

export const formatDate = (iso) => {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatShortDate = (iso) => {
  const d = parseISO(iso);
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};

export const getMonthLabel = (iso) => {
  const d = parseISO(iso + "-01");
  if (!d) return iso;
  return d.toLocaleDateString("es-AR", { month: "short" });
};
