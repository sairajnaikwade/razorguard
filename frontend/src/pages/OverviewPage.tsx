import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Clock,
  Cpu,
  Database,
  Eye,
  IndianRupee,
  Percent,
  Server,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';

import {
  transactionsApi,
  healthApi,
  type HealthStatus,
  type Transaction,
  type TransactionSummary,
} from '../services/api';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import Badge, { riskLevelVariant } from '../components/ui/Badge';
import RiskDistributionBar from '../components/charts/RiskDistributionBar';

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmtMoney(value: number | null, currency: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(value);
}

function fmtTimestampShort(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ─── Live date/time header widget ─────────────────────────────────────────────
function LiveDateTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const date = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return (
    <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
      <span className="flex items-center gap-1.5">
        <CalendarDays size={12} className="text-slate-600" />
        {date}
      </span>
      <span className="flex items-center gap-1.5">
        <Clock size={12} className="text-slate-600" />
        {time}
      </span>
    </div>
  );
}

// ─── KPI strip item ───────────────────────────────────────────────────────────
interface KpiProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClass?: string;
  sub?: string;
  loading?: boolean;
}

function KpiItem({ label, value, icon, valueClass = 'text-white', sub, loading }: KpiProps) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 min-w-0 flex-1 border-r border-[#142238] last:border-r-0">
      {/* icon + label row */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-slate-500 shrink-0">{icon}</span>
        <span className="text-[11px] font-medium text-slate-400 leading-tight whitespace-nowrap">
          {label}
        </span>
      </div>
      {/* value */}
      <p className={`text-xl font-bold tabular-nums leading-tight ${valueClass} ${loading ? 'opacity-30' : ''}`}>
        {loading ? '—' : value}
      </p>
      {/* sub-label */}
      {sub && (
        <p className="text-[10px] text-slate-500 leading-tight">{sub}</p>
      )}
    </div>
  );
}

// ─── Service status tile ───────────────────────────────────────────────────────
function ServiceTile({
  icon, name, status,
}: {
  icon: React.ReactNode;
  name: string;
  status: string | null | undefined;
}) {
  const ok = status === 'healthy';
  return (
    <div className="flex items-center gap-3 px-5 py-4 flex-1 border-r border-[#142238] last:border-r-0 min-w-0">
      <span className={ok ? 'text-risk-low' : 'text-slate-600'}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200 leading-tight">{name}</p>
        <p className={`text-xs font-semibold uppercase tracking-wide mt-0.5 ${ok ? 'text-risk-low' : 'text-slate-500'}`}>
          {status ? (
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${ok ? 'bg-risk-low' : 'bg-risk-critical'}`} />
              {status}
            </span>
          ) : '—'}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const [summary, setSummary]   = useState<TransactionSummary | null>(null);
  const [highRisk, setHighRisk] = useState<Transaction[] | null>(null);
  const [health, setHealth]     = useState<HealthStatus | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const feed = await transactionsApi.list({ page: 1, page_size: 1 });
      setSummary(feed.summary);
      try {
        const flagged = await transactionsApi.list({
          page: 1,
          page_size: 8,
          risk_level: 'HIGH,CRITICAL',
          sort_by: 'created_at',
          sort_order: 'desc',
        });
        setHighRisk(flagged.items);
      } catch {
        setHighRisk([]);
      }
    } catch {
      setError('Unable to load dashboard data from the backend.');
    } finally {
      setLoading(false);
    }
    try {
      setHealth(await healthApi.check());
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !summary && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Spinner size={28} />
        <p className="text-slate-500 text-sm">Loading dashboard…</p>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const s = summary;
  const fraudRatePct = s ? (s.predicted_fraud_rate * 100) : null;
  const fraudRateLabel = fraudRatePct !== null
    ? `${fraudRatePct.toFixed(2)}%`
    : '—';
  const fraudRateSub = s
    ? `(${s.predicted_fraud_count} / ${s.total_transactions})`
    : undefined;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight leading-tight">
            Fraud Monitoring Console
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Live risk posture · {s?.total_transactions?.toLocaleString('en-IN') ?? '—'} transactions scored
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <LiveDateTime />
          <Link
            to="/transactions"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/40 rounded px-3 py-1.5 hover:bg-primary/10 transition-colors"
          >
            All Transactions <ArrowRight size={11} />
          </Link>
        </div>
      </header>

      {/* ── KPI Strip ───────────────────────────────────────────────── */}
      {/* Horizontal on md+, 2-col grid on mobile */}
      <div className="bg-[#0B1728] border border-[#142238] rounded">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row">
          <KpiItem
            label="Total Transactions"
            value={(s?.total_transactions ?? 0).toLocaleString('en-IN')}
            icon={<ArrowLeftRight size={13} />}
            valueClass="text-white"
            sub="All scored"
            loading={!s}
          />
          <KpiItem
            label="Predicted Fraud"
            value={(s?.predicted_fraud_count ?? 0).toLocaleString('en-IN')}
            icon={<ShieldAlert size={13} />}
            valueClass="text-risk-critical"
            sub="Score ≥ 0.30"
            loading={!s}
          />
          <KpiItem
            label="High + Critical"
            value={(s?.high_critical_count ?? 0).toLocaleString('en-IN')}
            icon={<TrendingUp size={13} />}
            valueClass={(s?.high_critical_count ?? 0) > 0 ? 'text-risk-high' : 'text-white'}
            sub={s ? `${((s.high_critical_count / Math.max(s.total_transactions, 1)) * 100).toFixed(1)}% of total` : undefined}
            loading={!s}
          />
          <KpiItem
            label="Review Queue"
            value={(s?.review_queue_count ?? 0).toLocaleString('en-IN')}
            icon={<Eye size={13} />}
            valueClass={(s?.review_queue_count ?? 0) > 0 ? 'text-risk-medium' : 'text-white'}
            sub="Decision = REVIEW"
            loading={!s}
          />
          <KpiItem
            label="Fraud Rate"
            value={fraudRateLabel}
            icon={<Percent size={13} />}
            valueClass={
              fraudRatePct !== null && fraudRatePct >= 10 ? 'text-risk-critical' :
              fraudRatePct !== null && fraudRatePct >= 5  ? 'text-risk-high'     :
              'text-white'
            }
            sub={fraudRateSub}
            loading={!s}
          />
          <KpiItem
            label="Expected Loss"
            value={fmtMoney(s?.estimated_expected_loss ?? null, s?.expected_loss_currency ?? 'INR')}
            icon={<IndianRupee size={13} />}
            valueClass="text-white"
            sub="Modeled estimate"
            loading={!s}
          />
        </div>
      </div>

      {/* ── Two-column analytical area ───────────────────────────────── */}
      {/* Mobile: stacked | lg: 1/3 LEFT + 2/3 RIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* LEFT — Risk Distribution */}
        <div className="lg:col-span-1 bg-[#0B1728] border border-[#142238] rounded">
          <div className="px-4 py-3 border-b border-[#142238]">
            <h2 className="text-sm font-semibold text-white">Risk Distribution</h2>
            <p className="text-xs text-slate-500 mt-0.5">All scored transactions</p>
          </div>
          <div className="p-4">
            {s ? (
              <RiskDistributionBar counts={s.risk_level_counts} />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Spinner size={22} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — High-Risk Transactions table */}
        <div className="lg:col-span-2 bg-[#0B1728] border border-[#142238] rounded">
          <div className="px-4 py-3 border-b border-[#142238] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">High-Risk Transactions</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest HIGH and CRITICAL scores
              </p>
            </div>
            <Link
              to="/transactions?risk=HIGH,CRITICAL"
              className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1 shrink-0"
            >
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {/* Table header */}
          {highRisk && highRisk.length > 0 && (
            <div className="hidden sm:grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.7fr_0.9fr_1.1fr] px-4 py-2 border-b border-[#142238] gap-3">
              {['Transaction ID', 'Customer', 'Type', 'Amount', 'Score', 'Risk', 'Time'].map(h => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</span>
              ))}
            </div>
          )}

          {/* Rows */}
          <div>
            {!highRisk ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size={22} />
              </div>
            ) : highRisk.length === 0 ? (
              <div className="py-10 text-center">
                <ShieldAlert size={22} className="mx-auto text-slate-700 mb-2" />
                <p className="text-slate-500 text-sm">No high-risk transactions</p>
              </div>
            ) : (
              <div className="divide-y divide-[#142238]">
                {highRisk.map((t) => {
                  const prob = t.fraud_probability ?? 0;
                  const probPct = (prob * 100).toFixed(1) + '%';
                  const probClass =
                    prob >= 0.7 ? 'text-risk-critical font-bold' :
                    prob >= 0.5 ? 'text-risk-high font-semibold' :
                                  'text-risk-medium';

                  return (
                    <Link
                      key={t.id}
                      to={`/transactions/${encodeURIComponent(t.transaction_id)}`}
                      className="block hover:bg-white/[0.03] transition-colors"
                    >
                      {/* Desktop row */}
                      <div className="hidden sm:grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.7fr_0.9fr_1.1fr] px-4 py-3 gap-3 items-center">
                        <span className="font-mono text-xs text-slate-300 truncate">
                          {t.transaction_id}
                        </span>
                        <span className="font-mono text-xs text-slate-400 truncate">
                          {t.customer_id}
                        </span>
                        <span className="text-xs text-slate-400 capitalize">
                          {t.payment_method ?? '—'}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-slate-200">
                          {new Intl.NumberFormat('en-IN', {
                            style: 'currency', currency: t.currency, maximumFractionDigits: 0,
                          }).format(t.amount)}
                        </span>
                        <span className={`text-sm tabular-nums ${probClass}`}>
                          {probPct}
                        </span>
                        <span>
                          <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-1.5 py-0">
                            {t.risk_level}
                          </Badge>
                        </span>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {fmtTimestampShort(t.scored_at ?? t.created_at)}
                        </span>
                      </div>

                      {/* Mobile card row */}
                      <div className="sm:hidden px-4 py-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-slate-300 truncate flex-1">{t.transaction_id}</span>
                          <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-1.5 py-0 shrink-0">
                            {t.risk_level}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-400 font-mono">{t.customer_id}</span>
                          <span className={`tabular-nums ${probClass}`}>{probPct}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="capitalize">{t.payment_method ?? '—'} · {t.country ?? '—'}</span>
                          <span className="tabular-nums font-semibold text-slate-300">
                            {new Intl.NumberFormat('en-IN', {
                              style: 'currency', currency: t.currency, maximumFractionDigits: 0,
                            }).format(t.amount)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── System Status ────────────────────────────────────────────── */}
      <div className="bg-[#0B1728] border border-[#142238] rounded">
        <div className="px-4 py-2.5 border-b border-[#142238]">
          <h2 className="text-sm font-semibold text-white">System Status</h2>
        </div>
        <div className="grid grid-cols-2 md:flex md:flex-row divide-y divide-[#142238] md:divide-y-0">
          <ServiceTile
            icon={<Activity size={20} />}
            name="API"
            status={health?.status ?? null}
          />
          <ServiceTile
            icon={<Database size={20} />}
            name="Database"
            status={health?.database ?? null}
          />
          <ServiceTile
            icon={<Server size={20} />}
            name="Redis"
            status={health?.redis ?? null}
          />
          <ServiceTile
            icon={<Cpu size={20} />}
            name="ML Model"
            status={health?.ml_model ?? null}
          />
        </div>
      </div>

      {/* ── Footer note ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1">
        <span className="flex items-center gap-1.5">
          <ShieldAlert size={11} className="text-slate-700" />
          Fraud predictions are ML model outputs and require analyst verification.
        </span>
        <span>·</span>
        <span>
          Total risk exposure:{' '}
          <span className="text-slate-500">
            {fmtMoney(s?.estimated_expected_loss ?? null, s?.expected_loss_currency ?? 'INR')}
          </span>
        </span>
      </div>
    </div>
  );
}
