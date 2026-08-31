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
    <div className="space-y-4 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <header>
        <h1 className="text-xl font-bold text-white tracking-tight leading-tight">Transactions</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Server-side filtered explorer · all scored transactions
        </p>
      </header>

      {/* ── Filter toolbar ─────────────────────────────────────────── */}
      <div className="bg-[#0B1728] border border-[#142238] rounded">
        <TransactionsFilterBar
          filters={draft}
          onChange={setDraft}
          onApply={handleApply}
          onReset={handleReset}
        />
      </div>

      {/* ── Results panel ──────────────────────────────────────────── */}
      <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">

        {/* Result count bar */}
        <div className="px-4 py-2.5 border-b border-[#142238] flex items-center justify-between gap-3 min-h-[40px]">
          {data && !error ? (
            <span className="text-xs text-slate-500 tabular-nums">
              <span className="text-slate-300 font-semibold">
                {data.pagination.total_items.toLocaleString('en-IN')}
              </span>
              {' '}transaction{data.pagination.total_items !== 1 ? 's' : ''}
              {hasActiveFilters ? ' matching filters' : ''}
            </span>
          ) : (
            <span />
          )}
          {loading && data && (
            <span className="text-[11px] text-slate-600">Refreshing…</span>
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
