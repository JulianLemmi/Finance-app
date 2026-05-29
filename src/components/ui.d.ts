import type { ComponentType, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, ForwardRefExoticComponent, RefAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import type { LoanStatus, RiskLevel } from "../types";

// ── Badge ─────────────────────────────────────────────────────────────────────
export declare const Badge: ComponentType<{
  tone?: "neutral" | "success" | "danger" | "warning" | "bronze" | "info" | "purple";
  children?: ReactNode;
  className?: string;
}>;

export declare const StatusBadge: ComponentType<{ status: LoanStatus }>;
export declare const RiskBadge: ComponentType<{ risk: RiskLevel }>;

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "bronze" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export declare const Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  Icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
}>;

export declare const IconButton: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & {
  Icon: LucideIcon;
  "aria-label": string;
  className?: string;
}>;

// ── Form ──────────────────────────────────────────────────────────────────────
export declare const Input: ForwardRefExoticComponent<
  InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    hint?: string;
    error?: string | null;
    Icon?: LucideIcon;
    id?: string;
    className?: string;
  } & RefAttributes<HTMLInputElement>
>;

export declare const Select: ComponentType<{
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  Icon?: LucideIcon;
  id?: string;
}>;

export declare const Textarea: ComponentType<TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  id?: string;
}>;

export declare const Toggle: ComponentType<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  hint?: string;
}>;

// ── Card ──────────────────────────────────────────────────────────────────────
export declare const Card: ComponentType<{
  children?: ReactNode;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}>;

export declare const SectionTitle: ComponentType<{
  children?: ReactNode;
  action?: ReactNode;
}>;

export declare const EmptyState: ComponentType<{
  Icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}>;

export declare const Money: ComponentType<{
  value: number | string;
  hide?: boolean;
  currency?: string;
  className?: string;
}>;

export declare const ProgressBar: ComponentType<{
  value: number;
  tone?: string;
}>;

export declare const StatCard: ComponentType<{
  label: string;
  value: ReactNode;
  hint?: string;
  Icon?: LucideIcon;
  tone?: string;
  delta?: number;
}>;

export declare const Skeleton: ComponentType<{ className?: string }>;

// ── Sheet ─────────────────────────────────────────────────────────────────────
export declare const Sheet: ComponentType<{
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
}>;

// ── Chart ─────────────────────────────────────────────────────────────────────
export declare const ChartTooltip: ComponentType<Record<string, unknown>>;
export declare const ChartContainer: ComponentType<{ children?: ReactNode; className?: string }>;

// ── Delta ─────────────────────────────────────────────────────────────────────
export declare const DeltaPill: ComponentType<{ value: number; suffix?: string }>;
