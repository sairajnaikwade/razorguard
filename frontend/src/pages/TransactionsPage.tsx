import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';

import type { TransactionQueryParams } from '../services/api';
import { useTransactionsStore } from '../store/transactionsStore';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import TableSkeleton from '../components/ui/TableSkeleton';
import TransactionsTable from '../components/transactions/TransactionsTable';
import TransactionsFilterBar, {
  type TransactionFilters,
} from '../components/transactions/TransactionsFilterBar';
import Pagination from '../components/transactions/Pagination';

const PAGE_SIZE = 25;

/** URL key <-> filter field mapping (filters are reflected in the URL). */
function filtersFromParams(params: URLSearchParams): TransactionFilters {
  return {
    risk_level: params.get('risk') ?? '',
    decision: params.get('decision') ?? '',
    payment_method: params.get('method') ?? '',
    country: params.get('country') ?? '',
    date_from: params.get('from') ?? '',
    date_to: params.get('to') ?? '',
    min_fraud_probability: params.get('pmin') ?? '',
    max_fraud_probability: params.get('pmax') ?? '',
  };
}

function apiParamsFrom(
  filters: TransactionFilters,
  page: number,
): TransactionQueryParams {
  const numeric = (v: string): number | undefined => {
    const n = Number(v);
    return v !== '' && Number.isFinite(n) ? n : undefined;
  };
  const isoDate = (v: string, endOfDay: boolean): string | undefined => {
    if (!v) return undefined;
    // Date inputs are YYYY-MM-DD; send full-day ISO bounds in UTC.
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return undefined;
    if (endOfDay) d.setUTCHours(23, 59, 59, 999);
    return d.toISOString();
  };

  return {
    page,
    page_size: PAGE_SIZE,
    risk_level: filters.risk_level || undefined,
    decision: filters.decision || undefined,
    payment_method: filters.payment_method || undefined,
    country: filters.country || undefined,
    date_from: isoDate(filters.date_from, false),
    date_to: isoDate(filters.date_to, true),
    min_fraud_probability: numeric(filters.min_fraud_probability),
    max_fraud_probability: numeric(filters.max_fraud_probability),
  };
}

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, fetch } = useTransactionsStore();

  const urlFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  // Draft state for the filter inputs; the URL becomes source of truth on Apply.
  const [draft, setDraft] = useState<TransactionFilters>(urlFilters);
  useEffect(() => {
    setDraft(urlFilters);
  }, [urlFilters]);

  const load = useCallback(() => {
    void fetch(apiParamsFrom(urlFilters, page));
  }, [fetch, urlFilters, page]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleApply = () => {
    // New filters always restart at page 1.
    const next = new URLSearchParams();
    if (draft.risk_level) next.set('risk', draft.risk_level);
    if (draft.decision) next.set('decision', draft.decision);
    if (draft.payment_method) next.set('method', draft.payment_method);
    if (draft.country) next.set('country', draft.country);
    if (draft.date_from) next.set('from', draft.date_from);
    if (draft.date_to) next.set('to', draft.date_to);
    if (draft.min_fraud_probability) next.set('pmin', draft.min_fraud_probability);
    if (draft.max_fraud_probability) next.set('pmax', draft.max_fraud_probability);
    setSearchParams(next);
  };

  const handleReset = () => {
    setSearchParams(new URLSearchParams());
  };

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
    window.scrollTo({ top: 0 });
  };

  const hasActiveFilters = Object.values(urlFilters).some((v) => v !== '');

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <ArrowLeftRight className="text-primary" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Transactions</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Server-side filtered explorer over all scored transactions.
          </p>
        </div>
      </header>

      <Card>
        <TransactionsFilterBar
          filters={draft}
          onChange={setDraft}
          onApply={handleApply}
          onReset={handleReset}
        />

        {hasActiveFilters && (
          <p className="px-4 pb-3 text-xs text-slate-500">
            Active filters are reflected in the URL — refresh-safe and shareable.
          </p>
        )}
      </Card>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : loading && !data ? (
          <TableSkeleton rows={8} columns={8} />
        ) : data ? (
          <>
            <TransactionsTable items={data.items} loading={loading && !data} />
            <Pagination
              pagination={data.pagination}
              onPageChange={handlePageChange}
              loading={loading}
            />
          </>
        ) : null}
      </Card>
    </div>
  );
}
