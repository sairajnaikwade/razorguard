interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-slate-900/70 border border-slate-800 rounded-xl shadow-lg shadow-black/20 ${className}`}
    >
      {children}
    </div>
  );
}
