import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Fingerprint, History, ShieldAlert } from 'lucide-react';

import {
  auditApi,
  transactionsApi,
  type AuditEvent,
  type Transaction,
  type TransactionDetail,
} from '../services/api';
import Card from '../components/ui/Card';
import Badge, { decisionVariant, riskLevelVariant } from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import TableSkeleton from '../components/ui/TableSkeleton';
import ProbabilityGauge from '../components/charts/ProbabilityGauge';
import RiskSignalsList from '../components/transactions/RiskSignalsList';
import AuditTimeline from '../components/transactions/AuditTimeline';

function fmtMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}

function fmtTimestamp(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
}

export default function TransactionInvestigationPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [txn, setTxn] = useState<TransactionDetail | null>(null);
  const [history, setHistory] = useState<Transaction[] | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const loadTxn = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setHistory(null);
    try {
      const detail = await transactionsApi.detail(transactionId);
      setTxn(detail);

      // Customer history reuses the list endpoint filtered by customer_id.
      try {
        const res = await transactionsApi.list({
          customer_id: detail.customer_id,
          page: 1,
          page_size: 10,
          sort_by: 'created_at',
          sort_order: 'desc',
        });
        setHistory(res.items.filter((t) => t.transaction_id !== detail.transaction_id));
      } catch {
        setHistory([]);
      }
    } catch (err: unknown) {
      interface ApiErrorDetail {
        response?: { status?: number };
      }
      if ((err as ApiErrorDetail).response?.status === 404) {
        setNotFound(true);
      } else {
        setError('Unable to load this transaction.');
      }
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    void loadTxn();
    window.scrollTo({ top: 0 });
  }, [loadTxn]);

  // Independent fetch so audit failures never block the transaction view.
  useEffect(() => {
    let cancelled = false;
    if (!transactionId) return;
    setAuditLoading(true);
    auditApi
      .listByTransaction(transactionId)
      .then((events) => !cancelled && setAuditEvents(events))
      .catch(() => !cancelled && setAuditEvents([]))
      .finally(() => !cancelled && setAuditLoading(false));
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  if (notFound) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackLink />
        <Card>
          <EmptyState
            title="Transaction not found."
            description="No scored transaction exists with this ID. Nothing was fabricated — check the ID or score it first."
          />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-3xl">
        <BackLink />
        <ErrorState message={error} onRetry={loadTxn} />
      </div>
    );
  }

  if (loading || !txn) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white tracking-tight font-mono">
            <Fingerprint size={20} className="text-primary" /> {txn.transaction_id}
          </h1>
          <p className="text-slate-400 text-sm mt-1">Investigation view · scored by RazorGuard ML</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={riskLevelVariant(txn.risk_level)}>{txn.risk_level ?? 'UNSCORED'}</Badge>
          <Badge variant={decisionVariant(txn.decision)}>{txn.decision ?? '—'}</Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column: facts + customer history */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Transaction Facts</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
              <Fact label="Amount" value={`${fmtMoney(txn.amount, txn.currency)}`} strong />
              <Fact label="Customer" value={txn.customer_id} mono />
              <Fact label="Merchant" value={txn.merchant_id} mono />
              <Fact label="Payment Method" value={capitalize(txn.payment_method)} />
              <Fact label="Country" value={txn.country ?? '—'} />
              <Fact label="Device" value={txn.device_id ?? '—'} mono />
              <Fact
                label="Timestamp"
                value={fmtTimestamp(txn.scored_at ?? txn.created_at)}
                wide
              />
              <Fact label="Model Version" value={txn.model_version ?? '—'} mono wide />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white mb-1">
              Customer History — {txn.customer_id}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Previous transactions for this customer (newest first, server-side query)
            </p>
            {!history ? (
              <TableSkeleton rows={3} columns={5} />
            ) : history.length === 0 ? (
              <EmptyState title="No previous transactions for this customer." />
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {history.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/transactions/${encodeURIComponent(t.transaction_id)}`}
                      className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-slate-300 truncate">{t.transaction_id}</p>
                        <p className="text-[11px] text-slate-500">{fmtTimestamp(t.scored_at ?? t.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs tabular-nums text-slate-300">
                          {fmtMoney(t.amount, t.currency)}
                        </span>
                        <Badge variant={riskLevelVariant(t.risk_level)}>{t.risk_level}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right column: risk panel + signals + audit */}
        <div className="space-y-6">
          <Card className="p-5 border-primary/20">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
              <ShieldAlert size={15} className="text-primary" /> Risk Assessment
            </h2>
            <ProbabilityGauge probability={txn.fraud_probability} riskLevel={txn.risk_level} />
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Risk Level">
                <Badge variant={riskLevelVariant(txn.risk_level)}>{txn.risk_level ?? '—'}</Badge>
              </Row>
              <Row label="Decision">
                <Badge variant={decisionVariant(txn.decision)}>{txn.decision ?? '—'}</Badge>
              </Row>
              <Row label="Model Version">
                <span className="font-mono text-xs text-slate-300 break-all">
                  {txn.model_version ?? '—'}
                </span>
              </Row>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Risk Signals</h2>
            <RiskSignalsList signals={txn.risk_signals} />
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Signals persisted at scoring time; independent feature observations, not model
              explanations. Older rows may have none stored.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-4">
              <History size={15} className="text-primary" /> Audit Timeline
            </h2>
            <AuditTimeline events={auditEvents} loading={auditLoading} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/transactions"
      className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
    >
      <ArrowLeft size={15} /> Back to Transactions
    </Link>
  );
}

function Fact({
  label,
  value,
  mono,
  wide,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2 md:col-span-3 min-w-0' : 'min-w-0'}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd
        className={`mt-1 truncate ${mono ? 'font-mono text-xs' : 'text-sm'} ${
          strong ? 'text-white text-base font-bold tabular-nums' : 'text-slate-200'
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400 text-xs">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function capitalize(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
