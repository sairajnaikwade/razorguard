import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { PaginationMeta } from '../../services/api';
import Button from '../ui/Button';

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export default function Pagination({ pagination, onPageChange, loading }: PaginationProps) {
  const { page, total_pages, total_items, page_size } = pagination;
  const from = total_items === 0 ? 0 : (page - 1) * page_size + 1;
  const to = Math.min(page * page_size, total_items);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-800">
      <p className="text-xs text-slate-500 tabular-nums">
        {from}–{to} of {total_items.toLocaleString('en-IN')} transactions
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} /> Prev
        </Button>
        <span className="text-sm text-slate-300 tabular-nums px-2">
          Page {page} / {total_pages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= total_pages || loading}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
