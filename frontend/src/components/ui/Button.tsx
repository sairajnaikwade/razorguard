interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

const VARIANTS = {
  primary:   'bg-primary hover:bg-primary/90 active:bg-primary/80 text-white border-transparent',
  secondary: 'bg-transparent hover:bg-white/5 text-slate-300 border-[#142238] hover:border-[#1E3A5F] hover:text-white',
  danger:    'bg-risk-critical hover:bg-risk-critical/90 text-white border-transparent',
  ghost:     'bg-transparent hover:bg-white/5 text-slate-400 hover:text-white border-transparent',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors border ' +
    'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1 focus:ring-offset-[#06101F] ' +
    'disabled:opacity-40 disabled:cursor-not-allowed select-none';
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs h-8' : 'px-4 py-2 text-sm';
  return (
    <button
      className={`${base} ${sizing} ${VARIANTS[variant]} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
