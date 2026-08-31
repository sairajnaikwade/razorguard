import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react';

import {
  auditApi,
  transactionsApi,
  type AuditEvent,
  type Transaction,
  type TransactionDetail,
} from '../services/api';
import { useAuthStore } from '../store/authStore';
import Badge, { decisionVariant, riskLevelVariant } from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import RiskSignalsList from '../components/transactions/RiskSignalsList';
import AuditTimeline from '../components/transactions/AuditTimeline';
import AiInvestigationPanel from '../components/transactions/AiInvestigationPanel';

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmtMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}

function fmtTimestamp(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function capitalize(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function probColour(p: number | null | undefined): string {
  if (p === null || p === undefined) return 'text-slate-400';
  if (p >= 0.7) return 'text-risk-critical';
  if (p >= 0.5) return 'text-risk-high';
  if (p >= 0.3) return 'text-risk-medium';
  return 'text-risk-low';
}

// ─── Shared section header ────────────────────────────────────────────────────
function SectionHeader({
  title, right, className = '',
}: { title: string; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#142238] ${className}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ─── Fact row (label + value) ─────────────────────────────────────────────────
function FactRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-[#142238] last:border-0">
      <dt className="text-xs text-slate-500 shrink-0 w-28">{label}</dt>
      <dd
        className={`text-right truncate min-w-0 ${mono ? 'mono-id text-slate-300' : 'text-sm text-slate-200'}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Back link ────────────────────────────────────────────────────────────────
function BackLink() {
  return (
    <Link
      to="/transactions"
      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
    >
      <ArrowLeft size={13} />
      Back to Transactions
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TransactionInvestigationPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const { user } = useAuthStore();
  const canGenerate = user?.role === 'ADMIN' || user?.role === 'ANALYST';

  const [txn, setTxn]                   = useState<TransactionDetail | null>(null);
  const [history, setHistory]           = useState<Transaction[] | null>(null);
  const [auditEvents, setAuditEvents]   = useState<AuditEvent[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [notFound, setNotFound]         = useState(false);

  const loadTxn = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true); setError(null); setNotFound(false); setHistory(null);
    try {
      const detail = await transactionsApi.detail(transactionId);
      setTxn(detail);
      try {
        const res = await transactionsApi.list({
          customer_id: detail.customer_id, page: 1, page_size: 10,
          sort_by: 'created_at', sort_order: 'desc',
        });
        setHistory(res.items.filter((t) => t.transaction_id !== detail.transaction_id));
      } catch { setHistory([]); }
    } catch (err: unknown) {
      interface ApiErr { response?: { status?: number } }
      if ((err as ApiErr).response?.status === 404) setNotFound(true);
      else setError('Unable to load this transaction.');
    } finally { setLoading(false); }
  }, [transactionId]);

  useEffect(() => { void loadTxn(); window.scrollTo({ top: 0 }); }, [loadTxn]);

  useEffect(() => {
    let cancelled = false;
    if (!transactionId) return;
    setAuditLoading(true);
    auditApi.listByTransaction(transactionId)
      .then((ev) => { if (!cancelled) setAuditEvents(ev); })
      .catch(() => { if (!cancelled) setAuditEvents([]); })
      .finally(() => { if (!cancelled) setAuditLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId]);

  // ── Guards ───────────────────────────────────────────────────────────────
  if (notFound) return (
    <div className="space-y-4 max-w-2xl">
      <BackLink />
      <div className="bg-[#0B1728] border border-[#142238] rounded p-6">
        <EmptyState title="Transaction not found." description="No scored transaction with this ID." />
      </div>
    </div>
  );

  if (error) return (
    <div className="space-y-4 max-w-2xl">
      <BackLink />
      <ErrorState message={error} onRetry={loadTxn} />
    </div>
  );

  if (loading || !txn) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Spinner size={28} />
      <p className="text-slate-500 text-sm">Loading transaction…</p>
    </div>
  );

  const isCritical = txn.risk_level === 'CRITICAL';
  const isHigh     = txn.risk_level === 'HIGH';
  const prob       = txn.fraud_probability;

  return (
    <div className="space-y-4 animate-fade-in">
      <BackLink />

      {/* ── Transaction header ─────────────────────────────────────────── */}
      <div className={`bg-[#0B1728] border rounded ${
        isCritical ? 'border-l-2 border-risk-critical' :
        isHigh     ? 'border-l-2 border-risk-high'     :
                     'border-[#142238]'
      }`}>
        <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
          {/* Left: ID + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono-id text-white text-sm break-all">{txn.transaction_id}</span>
              {(isCritical || isHigh) && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  isCritical ? 'text-risk-critical' : 'text-risk-high'
                }`}>
                  <ShieldAlert size={12} />
                  {isCritical ? 'Immediate review required' : 'Review recommended'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Customer: <span className="mono-id">{txn.customer_id}</span>
              {' · '}Scored by RazorGuard ML
              {txn.model_version && (
                <>{' · '}<span className="mono-id">{txn.model_version}</span></>
              )}
            </p>
          </div>
          {/* Right: amount + probability + badges */}
          <div className="flex items-center gap-4 shrink-0 flex-wrap">
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Amount</p>
              <p className="text-lg font-bold tabular-nums text-white leading-tight">
                {fmtMoney(txn.amount, txn.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Fraud Prob.</p>
              <p className={`text-xl font-bold tabular-nums leading-tight ${probColour(prob)}`}>
                {prob !== null && prob !== undefined ? `${(prob * 100).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={riskLevelVariant(txn.risk_level)} className="text-xs">
                {txn.risk_level ?? 'UNSCORED'}
              </Badge>
              <Badge variant={decisionVariant(txn.decision)} className="text-xs">
                {txn.decision ?? '—'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main grid: left + right sidebar ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] gap-4 items-start">

        {/* ════ LEFT COLUMN ════ */}
        <div className="space-y-4 min-w-0 order-2 lg:order-1">

          {/* Transaction Facts */}
          <div className="bg-[#0B1728] border border-[#142238] rounded">
            <SectionHeader title="Transaction Details" />
            <div className="px-4 pt-1 pb-2">
              <dl>
                <FactRow label="Merchant"        value={txn.merchant_id}                mono />
                <FactRow label="Payment Method"  value={capitalize(txn.payment_method)} />
                <FactRow label="Country"         value={txn.country ?? '—'} />
                <FactRow label="Device ID"       value={txn.device_id ?? '—'}           mono />
                <FactRow label="Model Version"   value={txn.model_version ?? '—'}       mono />
                <FactRow label="Scored At"       value={fmtTimestamp(txn.scored_at ?? txn.created_at)} />
              </dl>
            </div>
          </div>

          {/* Customer History */}
          <div className="bg-[#0B1728] border border-[#142238] rounded">
            <SectionHeader
              title="Customer History"
              right={
                history && history.length > 0 ? (
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    {history.length} prior record{history.length !== 1 ? 's' : ''}
                  </span>
                ) : undefined
              }
            />
            <div>
              {!history ? (
                <div className="px-4 py-6">
                  <div className="flex gap-3 border border-[#142238] rounded overflow-hidden">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex gap-4 px-4 py-3 border-b border-[#142238] flex-1">
                        <div className="h-3 skeleton rounded flex-1" />
                        <div className="h-3 skeleton rounded w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : history.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-slate-500 text-sm">No prior transactions for this customer.</p>
                </div>
              ) : (
                /* Table-style history */
                <div>
                  <div className="hidden sm:grid grid-cols-[2fr_1fr_0.8fr_0.8fr_0.7fr] px-4 py-2 border-b border-[#142238] gap-3">
                    {['Transaction ID','Amount','Risk','Decision','Scored At'].map(h => (
                      <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</span>
                    ))}
                  </div>
                  <div className="divide-y divide-[#142238]">
                    {history.map((t) => (
                      <Link
                        key={t.id}
                        to={`/transactions/${encodeURIComponent(t.transaction_id)}`}
                        className="group block hover:bg-white/[0.025] transition-colors"
                      >
                        {/* Desktop row */}
                        <div className="hidden sm:grid grid-cols-[2fr_1fr_0.8fr_0.8fr_0.7fr] px-4 py-2.5 gap-3 items-center">
                          <span className="mono-id text-slate-300 group-hover:text-white transition-colors truncate">
                            {t.transaction_id}
                          </span>
                          <span className="text-sm tabular-nums font-semibold text-slate-200">
                            {fmtMoney(t.amount, t.currency)}
                          </span>
                          <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-1.5 py-0 w-fit">
                            {t.risk_level}
                          </Badge>
                          <Badge variant={decisionVariant(t.decision)} className="text-[10px] px-1.5 py-0 w-fit">
                            {t.decision ?? '—'}
                          </Badge>
                          <span className="text-xs text-slate-500 tabular-nums">
                            {fmtTimestamp(t.scored_at ?? t.created_at).split(',')[0]}
                          </span>
                        </div>
                        {/* Mobile row */}
                        <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="mono-id text-slate-300 truncate">{t.transaction_id}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{fmtTimestamp(t.scored_at ?? t.created_at)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs tabular-nums font-semibold text-slate-300">{fmtMoney(t.amount, t.currency)}</span>
                            <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-1.5 py-0">{t.risk_level}</Badge>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI Investigation Report */}
          {transactionId && (
            <AiInvestigationPanel transactionId={transactionId} canGenerate={canGenerate} />
          )}
        </div>

        {/* ════ RIGHT SIDEBAR ════ */}
        <div className="space-y-4 order-1 lg:order-2">

          {/* Risk Assessment — neutral border; semantics carried by probability value + badge */}
          <div className="bg-[#0B1728] border border-[#142238] rounded">
            <SectionHeader title="Risk Assessment" />
            <div className="px-4 py-3 space-y-3">
              {/* Probability display — numeric, not a gauge widget */}
              <div className="flex items-center justify-between py-2 border-b border-[#142238]">
                <span className="text-xs text-slate-500">Fraud Probability</span>
                <span className={`text-2xl font-bold tabular-nums ${probColour(prob)}`}>
                  {prob !== null && prob !== undefined ? `${(prob * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-500">Risk Level</span>
                <Badge variant={riskLevelVariant(txn.risk_level)}>{txn.risk_level ?? '—'}</Badge>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-500">Decision</span>
                <Badge variant={decisionVariant(txn.decision)}>{txn.decision ?? '—'}</Badge>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-500">Model</span>
                <span className="mono-id text-slate-300 text-right max-w-[160px] truncate" title={txn.model_version ?? ''}>
                  {txn.model_version ?? '—'}
                </span>
              </div>
              {/* Inline probability bar */}
              {prob !== null && prob !== undefined && (
                <div className="pt-1">
                  <div className="h-1.5 w-full bg-[#142238] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        prob >= 0.7 ? 'bg-risk-critical' :
                        prob >= 0.5 ? 'bg-risk-high' :
                        prob >= 0.3 ? 'bg-risk-medium' : 'bg-risk-low'
                      }`}
                      style={{ width: `${(prob * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Risk Signals */}
          <div className="bg-[#0B1728] border border-[#142238] rounded">
            <SectionHeader
              title="Risk Signals"
              right={
                txn.risk_signals.length > 0 ? (
                  <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded border ${
                    txn.risk_signals.length >= 3
                      ? 'text-risk-critical bg-risk-critical/10 border-risk-critical/30'
                      : 'text-risk-high bg-risk-high/10 border-risk-high/30'
                  }`}>
                    {txn.risk_signals.length}
                  </span>
                ) : undefined
              }
            />
            <div className="px-4 py-3">
              <RiskSignalsList signals={txn.risk_signals} />
              {txn.risk_signals.length > 0 && (
                <p className="text-[10px] text-slate-600 mt-3 pt-3 border-t border-[#142238] leading-relaxed">
                  Signals captured at scoring time — feature observations, not model explanations.
                </p>
              )}
            </div>
          </div>

          {/* Audit Timeline */}
          <div className="bg-[#0B1728] border border-[#142238] rounded">
            <SectionHeader title="Audit Trail" />
            <div className="px-4 py-3">
              <AuditTimeline events={auditEvents} loading={auditLoading} />
            </div>
          </div>

        </div>
        {/* end right sidebar */}
      </div>
    </div>
  );
}
