interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export default function TableSkeleton({ rows = 8, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading table">
      <div className="h-10 bg-slate-800/70 rounded-t-lg" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 border-b border-slate-800/60">
          {Array.from({ length: columns }).map((__, c) => (
            <div
              key={c}
              className="h-4 bg-slate-800 rounded flex-1"
              style={{ maxWidth: `${20 + ((r + c) % 3) * 15}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
