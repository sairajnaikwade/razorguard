import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ShieldAlert,
  Eye,
  Percent,
  IndianRupee,
  Activity,
  Database,
  Server,
  Cpu,
} from 'lucide-react';

import {
  transactionsApi,
  healthApi,
  type HealthStatus,
  type Transaction,
  type TransactionSummary,
} from '../services/api';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import Badge, { decisionVariant, riskLevelVariant } from '../components/ui/Badge';
import KpiCard from '../components/kpi/KpiCard';
import RiskDistributionBar from '../components/charts/RiskDistributionBar';

function fmtMoney(value: number | null, currency: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OverviewPage() {
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [highRisk, setHighRisk] = useState<Transaction[] | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // page_size=1 keeps the payload tiny; the summary is computed server-side
      // over the FULL result set regardless of page size.
      const feed = await transactionsApi.list({ page: 1, page_size: 1 });
      setSummary(feed.summary);
      try {
        const flagged = await transactionsApi.list({
          page: 1,
          page_size: 6,
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

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !summary && !error) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={36} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  const s = summary;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white tracking-tight">Overview</h1>
        <p className="text-slate-400 text-sm mt-1">
          Live fraud-risk posture from scored transactions. Model outputs are predictions, not
          confirmed fraud.
        </p>
      </header>

      {/* KPI cards */}
      <section aria-label="Key risk indicators" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Total Transactions"
          value={(s?.total_transactions ?? 0).toLocaleString('en-IN')}
          icon={ArrowLeftRight}
          loading={!s}
        />
        <KpiCard
          label="Predicted Fraud"
          value={(s?.predicted_fraud_count ?? 0).toLocaleString('en-IN')}
          icon={ShieldAlert}
          tone="critical"
          hint="Model output ≥ threshold (0.30) — not confirmed fraud"
          loading={!s}
        />
        <KpiCard
          label="High + Critical Risk"
          value={(s?.high_critical_count ?? 0).toLocaleString('en-IN')}
          icon={ShieldAlert}
          tone="high"
          loading={!s}
        />
        <KpiCard
          label="Review Queue"
          value={(s?.review_queue_count ?? 0).toLocaleString('en-IN')}
          icon={Eye}
          tone="medium"
          hint="Decision = REVIEW"
          loading={!s}
        />
        <KpiCard
          label="Predicted Fraud Rate"
          value={s ? `${(s.predicted_fraud_rate * 100).toFixed(2)}%` : '—'}
          icon={Percent}
          tone="primary"
          loading={!s}
        />
        <KpiCard
          label="Estimated Expected Loss"
          value={fmtMoney(s?.estimated_expected_loss ?? null, s?.expected_loss_currency ?? 'INR')}
          icon={IndianRupee}
          tone="default"
          hint="Modeled estimate — not confirmed financial loss"
          loading={!s}
        />
      </section>

      {/* Charts + high-risk feed */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Risk Distribution</h2>
          <p className="text-xs text-slate-500 mb-3">
            Server-computed counts across all scored transactions
          </p>
          {s ? (
            <RiskDistributionBar counts={s.risk_level_counts} />
          ) : (
            <Spinner />
          )}
        </Card>

        <Card className="xl:col-span-2 p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-white">Recent High-Risk Transactions</h2>
            <Link to="/transactions?risk=HIGH,CRITICAL" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          <p className="text-xs text-slate-500 mb-3">Latest HIGH and CRITICAL risk scores</p>
          {!highRisk ? (
            <Spinner />
          ) : highRisk.length === 0 ? (
            <EmptyState title="No high-risk transactions." description="Nothing currently rated HIGH or CRITICAL." />
          ) : (
            <ul className="divide-y divide-slate-800/70">
              {highRisk.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/transactions/${encodeURIComponent(t.transaction_id)}`}
                    className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-300 truncate">{t.transaction_id}</p>
                      <p className="text-[11px] text-slate-500">
                        {t.customer_id} · {t.country ?? '—'} ·{' '}
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: t.currency,
                          maximumFractionDigits: 0,
                        }).format(t.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm tabular-nums text-slate-200">
                        {(((t.fraud_probability ?? 0) * 100) as number).toFixed(1)}%
                      </span>
                      <Badge variant={riskLevelVariant(t.risk_level)}>{t.risk_level}</Badge>
                      <Badge variant={decisionVariant(t.decision)}>{t.decision}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* System health strip */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-white mb-3">System Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <HealthChip
            icon={<Activity size={16} />}
            label="API"
            status={health ? 'healthy' : null}
          />
          <HealthChip
            icon={<Database size={16} />}
            label="PostgreSQL"
            status={health?.database ?? null}
          />
          <HealthChip
            icon={<Server size={16} />}
            label="Redis"
            status={health?.redis ?? null}
          />
          <HealthChip
            icon={<Cpu size={16} />}
            label="ML Model"
            status={health?.ml_model ?? null}
          />
        </div>
      </Card>
    </div>
  );
}

function HealthChip({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: string | null;
}) {
  const healthy = status === 'healthy';
  return (
    <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-slate-300">
        <span className="text-slate-500">{icon}</span> {label}
      </span>
      <span className="flex items-center gap-2">
        {status === null ? (
          <span className="text-xs text-slate-500">—</span>
        ) : (
          <>
            <span
              className={`w-2 h-2 rounded-full ${healthy ? 'bg-risk-low' : 'bg-risk-critical animate-pulse'}`}
              aria-hidden
            />
            <span
              className={`text-xs capitalize ${healthy ? 'text-risk-low' : 'text-risk-critical'}`}
            >
              {status}
            </span>
          </>
        )}
      </span>
    </div>
  );
}
