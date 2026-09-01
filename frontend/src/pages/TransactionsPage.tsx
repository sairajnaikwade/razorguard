import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { TransactionQueryParams } from '../services/api';
import { useTransactionsStore } from '../store/transactionsStore';
import ErrorState from '../components/ui/ErrorState';
import TableSkeleton from '../components/ui/TableSkeleton';
import TransactionsTable from '../components/transactions/TransactionsTable';
import TransactionsFilterBar, {
  type TransactionFilters,
} from '../components/transactions/TransactionsFilterBar';
import Pagination from '../components/transactions/Pagination';

const PAGE_SIZE = 25;

function filtersFromParams(params: URLSearchParams): TransactionFilters {
  return {
    risk_level:             params.get('risk')     ?? '',
    decision:               params.get('decision') ?? '',
    payment_method:         params.get('method')   ?? '',
    country:                params.get('country')  ?? '',
    date_from:              params.get('from')     ?? '',
    date_to:                params.get('to')       ?? '',
    min_fraud_probability:  params.get('pmin')     ?? '',
    max_fraud_probability:  params.get('pmax')     ?? '',
  };
}

function apiParamsFrom(filters: TransactionFilters, page: number): TransactionQueryParams {
  const numeric = (v: string): number | undefined => {
    const n = Number(v);
    return v !== '' && Number.isFinite(n) ? n : undefined;
  };
  const isoDate = (v: string, endOfDay: boolean): string | undefined => {
    if (!v) return undefined;
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return undefined;
    if (endOfDay) d.setUTCHours(23, 59, 59, 999);
    return d.toISOString();
  };
  return {
    page,
    page_size: PAGE_SIZE,
    risk_level:            filters.risk_level       || undefined,
    decision:              filters.decision         || undefined,
    payment_method:        filters.payment_method   || undefined,
    country:               filters.country          || undefined,
    date_from:             isoDate(filters.date_from, false),
    date_to:               isoDate(filters.date_to,   true),
    min_fraud_probability: numeric(filters.min_fraud_probability),
    max_fraud_probability: numeric(filters.max_fraud_probability),
  };
}

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, fetch } = useTransactionsStore();

  const urlFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const [draft, setDraft] = useState<TransactionFilters>(urlFilters);
  useEffect(() => { setDraft(urlFilters); }, [urlFilters]);

  const load = useCallback(() => {
    void fetch(apiParamsFrom(urlFilters, page));
  }, [fetch, urlFilters, page]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleApply = () => {
    const next = new URLSearchParams();
    if (draft.risk_level)            next.set('risk',     draft.risk_level);
    if (draft.decision)              next.set('decision', draft.decision);
    if (draft.payment_method)        next.set('method',   draft.payment_method);
    if (draft.country)               next.set('country',  draft.country);
    if (draft.date_from)             next.set('from',     draft.date_from);
    if (draft.date_to)               next.set('to',       draft.date_to);
    if (draft.min_fraud_probability) next.set('pmin',     draft.min_fraud_probability);
    if (draft.max_fraud_probability) next.set('pmax',     draft.max_fraud_probability);
    setSearchParams(next);
  };

  const handleReset = () => setSearchParams(new URLSearchParams());

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
    window.scrollTo({ top: 0 });
  };

  const hasActiveFilters = Object.values(urlFilters).some((v) => v !== '');

  return (
    <div className="space-y-5 animate-fade-in pb-4">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 flex-wrap bg-[#0A1628]/60 border border-[#162A45]/60 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Transaction Explorer</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Live Scored Registry
            </span>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">
            Server-side filtered fraud evaluation registry &amp; audit history
          </p>
        </div>

        {data && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#081220] border border-[#162A45] text-xs font-semibold text-slate-300">
            <span className="text-slate-500">Total Scored:</span>
            <span className="text-white font-bold tabular-nums">{data.pagination.total_items.toLocaleString('en-IN')}</span>
          </div>
        )}
      </header>

      {/* ── Filter toolbar ─────────────────────────────────────────── */}
      <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl p-4 sm:p-5 shadow-lg">
        <TransactionsFilterBar
          filters={draft}
          onChange={setDraft}
          onApply={handleApply}
          onReset={handleReset}
        />
      </div>

      {/* ── Results panel ──────────────────────────────────────────── */}
      <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg">

        {/* Result count bar */}
        <div className="px-5 py-3 border-b border-[#162A45]/80 bg-[#081220]/60 flex items-center justify-between gap-3 min-h-[44px]">
          {data && !error ? (
            <span className="text-xs text-slate-400 font-medium tabular-nums flex items-center gap-2">
              <span className="text-white font-bold text-sm">
                {data.pagination.total_items.toLocaleString('en-IN')}
              </span>
              <span>record{data.pagination.total_items !== 1 ? 's' : ''} found</span>
              {hasActiveFilters && (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  Filters Active
                </span>
              )}
            </span>
          ) : (
            <span />
          )}
          {loading && data && (
            <span className="text-xs font-semibold text-blue-400 animate-pulse">Filtering records…</span>
          )}
        </div>

        {/* Content */}
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading && !data ? (
          <TableSkeleton rows={10} columns={9} />
        ) : data ? (
          <>
            <TransactionsTable items={data.items} loading={false} />
            <Pagination
              pagination={data.pagination}
              onPageChange={handlePageChange}
              loading={loading}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
