interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export default function TableSkeleton({ rows = 8, columns = 5 }: TableSkeletonProps) {
  return (
    <div role="status" aria-label="Loading table">
      {/* Header placeholder */}
      <div className="h-9 bg-white/[0.02] border-b border-[#142238]" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-5 py-3 border-b border-[#142238]">
          {Array.from({ length: columns }).map((__, c) => (
            <div
              key={c}
              className="h-3.5 skeleton rounded flex-1"
              style={{ maxWidth: `${18 + ((r + c) % 4) * 14}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
