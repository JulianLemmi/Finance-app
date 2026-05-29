import React, { useId } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  Icon?: LucideIcon;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, Icon, id, className = "", ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className="block">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </label>
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
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
          className={`w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none ${className}`}
        />
      </div>
      {hint && !error && <div id={`${inputId}-hint`} className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
      {error && <div id={`${inputId}-error`} className="mt-1 text-[11px] text-rose-400">{error}</div>}
    </div>
  );
});

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  Icon?: LucideIcon;
  id?: string;
}

export const Select = ({ label, value, onChange, options, Icon, id }: SelectProps) => {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className="block">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </label>
      )}
      <div className="relative flex items-center rounded-xl border border-zinc-800 bg-zinc-900/60 transition-colors focus-within:border-zinc-600 focus-within:bg-zinc-900">
        {Icon && <Icon className="ml-3 h-4 w-4 shrink-0 text-zinc-500" />}
        <select
          id={selectId}
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
    </div>
  );
};

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const Textarea = ({ label, id, ...rest }: TextareaProps) => {
  const autoId = useId();
  const textareaId = id || autoId;
  return (
    <div className="block">
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        {...rest}
        className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:bg-zinc-900 focus:outline-none"
      />
    </div>
  );
};

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  hint?: string;
}

export const Toggle = ({ checked, onChange, label, hint }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-left transition-colors hover:bg-zinc-900"
  >
    <div>
      {label && <div className="text-sm font-medium text-zinc-100">{label}</div>}
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
    <div
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
        checked ? "border-amber-600 bg-amber-600" : "border-zinc-700 bg-zinc-800"
      }`}
    >
      <div
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </div>
  </button>
);
