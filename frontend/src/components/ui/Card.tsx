interface CardProps {
  children: React.ReactNode;
  className?: string;
  flat?: boolean;
}

export default function Card({ children, className = '', flat = false }: CardProps) {
  if (flat) {
    return (
      <div className={`border border-[#142238] bg-transparent rounded ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <div className={`bg-[#0B1728] border border-[#142238] rounded ${className}`}>
      {children}
    </div>
  );
}
