import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { PaginationMeta } from '../../services/api';

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export default function Pagination({ pagination, onPageChange, loading }: PaginationProps) {
  const { page, total_pages, total_items, page_size } = pagination;
  const from = total_items === 0 ? 0 : (page - 1) * page_size + 1;
  const to   = Math.min(page * page_size, total_items);

  // Page window
  const pages: (number | '…')[] = [];
  if (total_pages <= 7) {
    for (let i = 1; i <= total_pages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page - 2 > 2) pages.push('…');
    for (let i = Math.max(2, page - 2); i <= Math.min(total_pages - 1, page + 2); i++) pages.push(i);
    if (page + 2 < total_pages - 1) pages.push('…');
    pages.push(total_pages);
  }

  const navBtn = (
    label: string,
    onClick: () => void,
    disabled: boolean,
    icon: React.ReactNode,
  ) => (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      className="w-7 h-7 flex items-center justify-center rounded border border-[#142238] text-slate-500
        hover:text-slate-200 hover:border-[#1E3A5F] hover:bg-white/[0.04]
        disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#142238]">
      {/* Range info */}
      <p className="text-xs text-slate-500 tabular-nums">
        <span className="text-slate-300 font-medium">{from}–{to}</span>
        {' '}of{' '}
        <span className="text-slate-300 font-medium">{total_items.toLocaleString('en-IN')}</span>
        {' '}transactions
      </p>

      {/* Page controls */}
      <div className="flex items-center gap-1">
        {navBtn('First page',    () => onPageChange(1),              page <= 1,             <ChevronsLeft  size={12} />)}
        {navBtn('Previous page', () => onPageChange(page - 1),       page <= 1,             <ChevronLeft   size={12} />)}

        <div className="flex items-center gap-1 mx-1">
          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e-${i}`} className="w-7 text-center text-slate-600 text-xs select-none">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                disabled={loading}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors border ${
                  p === page
                    ? 'bg-primary text-white border-primary/50'
                    : 'border-[#142238] text-slate-400 hover:text-white hover:border-[#1E3A5F] hover:bg-white/[0.04]'
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>

        {navBtn('Next page',  () => onPageChange(page + 1),       page >= total_pages,   <ChevronRight  size={12} />)}
        {navBtn('Last page',  () => onPageChange(total_pages),    page >= total_pages,   <ChevronsRight size={12} />)}
      </div>
    </div>
  );
}
