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
