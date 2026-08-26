interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

const VARIANTS = {
  primary: 'bg-primary hover:bg-primary/90 text-white border-transparent',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700',
  danger: 'bg-risk-critical/90 hover:bg-risk-critical text-white border-transparent',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 border-transparent',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm';
  return (
    <button
      className={`${base} ${sizing} ${VARIANTS[variant]} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
