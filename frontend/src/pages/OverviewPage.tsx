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
  ShieldCheck,
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

// ─── KPI Card item ───────────────────────────────────────────────────────────
interface KpiProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClass?: string;
  sub?: string;
  loading?: boolean;
  accentColor?: string;
  pulseDot?: boolean;
}

function KpiItem({ label, value, icon, valueClass = 'text-white', sub, loading, accentColor = 'from-blue-500/15', pulseDot }: KpiProps) {
  return (
    <div className="relative group bg-[#0A1628]/90 hover:bg-[#0D1D35] border border-[#162A45]/80 hover:border-blue-500/40 rounded-xl p-4 min-w-0 flex-1 transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-blue-950/40 flex flex-col justify-between overflow-hidden">
      {/* Top subtle glow accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accentColor} to-transparent opacity-60 group-hover:opacity-100 transition-opacity`} />
      
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider leading-none truncate">
          {label}
        </span>
        <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-[#11233D] border border-blue-900/40 text-blue-400 group-hover:scale-105 group-hover:border-blue-500/50 transition-all shrink-0">
          {icon}
          {pulseDot && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
          )}
        </div>
      </div>

      <div>
        <p className={`text-2xl font-bold tabular-nums tracking-tight leading-tight ${valueClass} ${loading ? 'opacity-30' : ''}`}>
          {loading ? '—' : value}
        </p>
        {sub && (
          <p className="text-[10px] text-slate-500 mt-1 font-medium leading-tight truncate">{sub}</p>
        )}
      </div>
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
    <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-[#0A1628]/70 hover:bg-[#0D1D35]/90 border border-[#162A45]/70 hover:border-blue-500/30 transition-all duration-200 flex-1 min-w-0">
      <div className={`p-2 rounded-lg ${ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'} shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-200 leading-tight truncate">{name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${ok ? 'text-emerald-400' : 'text-slate-500'}`}>
            {status ? status : '—'}
          </span>
        </div>
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
      <div className="flex flex-col items-center justify-center py-36 gap-3">
        <Spinner size={32} />
        <p className="text-slate-400 text-sm font-medium animate-pulse">Initializing Fraud Monitoring Console…</p>
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
    ? `${s.predicted_fraud_count.toLocaleString('en-IN')} flagged / ${s.total_transactions.toLocaleString('en-IN')} total`
    : undefined;

  return (
    <div className="space-y-5 animate-fade-in pb-4">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 flex-wrap bg-[#0A1628]/60 border border-[#162A45]/60 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Fraud Monitoring Console
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Live System Active
            </span>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">
            Real-time fraud posture analysis · <span className="text-slate-200 font-semibold">{s?.total_transactions?.toLocaleString('en-IN') ?? '—'}</span> transactions evaluated
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <LiveDateTime />
          <Link
            to="/transactions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 border border-blue-500/50 rounded-xl px-3.5 py-2 shadow-md shadow-blue-900/30 hover:shadow-blue-500/20 transition-all duration-150"
          >
            All Transactions <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      {/* ── KPI Grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiItem
          label="Total Transactions"
          value={(s?.total_transactions ?? 0).toLocaleString('en-IN')}
          icon={<ArrowLeftRight size={15} />}
          valueClass="text-slate-100"
          sub="All ML-scored"
          loading={!s}
          accentColor="from-blue-500/40"
        />
        <KpiItem
          label="Predicted Fraud"
          value={(s?.predicted_fraud_count ?? 0).toLocaleString('en-IN')}
          icon={<ShieldAlert size={15} />}
          valueClass="text-red-400 font-extrabold"
          sub="Score ≥ 0.30"
          loading={!s}
          accentColor="from-red-500/50"
          pulseDot={(s?.predicted_fraud_count ?? 0) > 0}
        />
        <KpiItem
          label="High + Critical"
          value={(s?.high_critical_count ?? 0).toLocaleString('en-IN')}
          icon={<TrendingUp size={15} />}
          valueClass={(s?.high_critical_count ?? 0) > 0 ? 'text-orange-400 font-extrabold' : 'text-slate-200'}
          sub={s ? `${((s.high_critical_count / Math.max(s.total_transactions, 1)) * 100).toFixed(1)}% severe risk` : undefined}
          loading={!s}
          accentColor="from-orange-500/50"
        />
        <KpiItem
          label="Review Queue"
          value={(s?.review_queue_count ?? 0).toLocaleString('en-IN')}
          icon={<Eye size={15} />}
          valueClass={(s?.review_queue_count ?? 0) > 0 ? 'text-yellow-400 font-bold' : 'text-slate-200'}
          sub="Decision = REVIEW"
          loading={!s}
          accentColor="from-yellow-500/40"
        />
        <KpiItem
          label="Fraud Rate"
          value={fraudRateLabel}
          icon={<Percent size={15} />}
          valueClass={
            fraudRatePct !== null && fraudRatePct >= 10 ? 'text-red-400 font-bold' :
            fraudRatePct !== null && fraudRatePct >= 5  ? 'text-orange-400 font-bold' :
            'text-emerald-400 font-bold'
          }
          sub={fraudRateSub}
          loading={!s}
          accentColor="from-red-500/30"
        />
        <KpiItem
          label="Expected Loss"
          value={fmtMoney(s?.estimated_expected_loss ?? null, s?.expected_loss_currency ?? 'INR')}
          icon={<IndianRupee size={15} />}
          valueClass="text-white font-extrabold"
          sub="Modeled exposure"
          loading={!s}
          accentColor="from-cyan-500/40"
        />
      </div>

      {/* ── Two-column analytical area ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* LEFT — Risk Distribution */}
        <div className="lg:col-span-1 bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg">
          <div className="px-5 py-4 border-b border-[#162A45]/80 bg-[#081220]/60 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Risk Distribution</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Scored transaction volume breakdown</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
              Live Breakdown
            </span>
          </div>
          <div className="p-5">
            {s ? (
              <RiskDistributionBar counts={s.risk_level_counts} />
            ) : (
              <div className="flex items-center justify-center py-20">
                <Spinner size={24} />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — High-Risk Transactions table */}
        <div className="lg:col-span-2 bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg">
          <div className="px-5 py-4 border-b border-[#162A45]/80 bg-[#081220]/60 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                High-Risk Transactions
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/15 text-red-400 border border-red-500/30">
                  HIGH &amp; CRITICAL
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Priority items flagged by Random Forest model for immediate analyst review
              </p>
            </div>
            <Link
              to="/transactions?risk=HIGH,CRITICAL"
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {/* Table header */}
          {highRisk && highRisk.length > 0 && (
            <div className="hidden sm:grid grid-cols-[2fr_1.3fr_0.9fr_1.1fr_0.8fr_1fr_1.1fr] px-5 py-2.5 bg-[#06101F]/80 border-b border-[#162A45]/80 gap-3">
              {['Transaction ID', 'Customer', 'Method', 'Amount', 'Score', 'Risk Tier', 'Time'].map(h => (
                <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</span>
              ))}
            </div>
          )}

          {/* Rows */}
          <div>
            {!highRisk ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size={24} />
              </div>
            ) : highRisk.length === 0 ? (
              <div className="py-16 text-center">
                <ShieldCheck size={28} className="mx-auto text-emerald-400/60 mb-2" />
                <p className="text-slate-300 text-sm font-semibold">No high-risk transactions detected</p>
                <p className="text-slate-500 text-xs mt-0.5">All scored transactions are within acceptable risk parameters.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#162A45]/60">
                {highRisk.map((t) => {
                  const prob = t.fraud_probability ?? 0;
                  const probPct = (prob * 100).toFixed(1) + '%';
                  const probClass =
                    prob >= 0.85 ? 'text-red-400 font-extrabold drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]' :
                    prob >= 0.6  ? 'text-orange-400 font-bold' :
                                   'text-yellow-400 font-semibold';

                  return (
                    <Link
                      key={t.id}
                      to={`/transactions/${encodeURIComponent(t.transaction_id)}`}
                      className="block group hover:bg-[#0E203B]/80 transition-colors"
                    >
                      {/* Desktop row */}
                      <div className="hidden sm:grid grid-cols-[2fr_1.3fr_0.9fr_1.1fr_0.8fr_1fr_1.1fr] px-5 py-3.5 gap-3 items-center">
                        <span className="font-mono text-xs font-semibold text-blue-300 group-hover:text-blue-200 transition-colors truncate flex items-center gap-1.5">
                          <span className="w-1 h-3 rounded-full bg-blue-500/40 group-hover:bg-blue-400 transition-colors" />
                          {t.transaction_id}
                        </span>
                        <span className="font-mono text-xs text-slate-400 group-hover:text-slate-300 transition-colors truncate">
                          {t.customer_id}
                        </span>
                        <span className="text-xs text-slate-400 capitalize">
                          {t.payment_method ?? '—'}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-slate-100">
                          {new Intl.NumberFormat('en-IN', {
                            style: 'currency', currency: t.currency, maximumFractionDigits: 0,
                          }).format(t.amount)}
                        </span>
                        <span className={`text-sm tabular-nums ${probClass}`}>
                          {probPct}
                        </span>
                        <div>
                          <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-2 py-0.5 font-bold shadow-sm">
                            {t.risk_level}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-400 tabular-nums">
                          {fmtTimestampShort(t.scored_at ?? t.created_at)}
                        </span>
                      </div>

                      {/* Mobile card row */}
                      <div className="sm:hidden px-4 py-3.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-blue-300 truncate flex-1">{t.transaction_id}</span>
                          <Badge variant={riskLevelVariant(t.risk_level)} className="text-[10px] px-2 py-0.5 font-bold shrink-0">
                            {t.risk_level}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-400 font-mono">{t.customer_id}</span>
                          <span className={`tabular-nums ${probClass}`}>{probPct}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="capitalize">{t.payment_method ?? '—'} · {t.country ?? '—'}</span>
                          <span className="tabular-nums font-bold text-slate-200">
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
      <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            System Infrastructure Status
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">All core services monitored</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ServiceTile
            icon={<Activity size={18} />}
            name="FastAPI Services"
            status={health?.status ?? null}
          />
          <ServiceTile
            icon={<Database size={18} />}
            name="PostgreSQL Storage"
            status={health?.database ?? null}
          />
          <ServiceTile
            icon={<Server size={18} />}
            name="Redis Rate Limiter"
            status={health?.redis ?? null}
          />
          <ServiceTile
            icon={<Cpu size={18} />}
            name="ML Fraud Engine"
            status={health?.ml_model ?? null}
          />
        </div>
      </div>

      {/* ── Footer note ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 px-1 pt-1">
        <span className="flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-slate-500" />
          Fraud predictions are generated via Random Forest ML model and require analyst verification before action.
        </span>
        <span className="font-medium text-slate-400">
          Total Risk Exposure:{' '}
          <span className="text-white font-bold">
            {fmtMoney(s?.estimated_expected_loss ?? null, s?.expected_loss_currency ?? 'INR')}
          </span>
        </span>
      </div>
    </div>
  );
}
