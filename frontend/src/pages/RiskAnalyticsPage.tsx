import { useCallback, useEffect, useState } from 'react';
import { BarChart3, FlaskConical, Info } from 'lucide-react';

import { mlApi, type MLMetrics, type MLStatus } from '../services/api';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import ConfusionMatrixGrid from '../components/charts/ConfusionMatrixGrid';

function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
}

function fmtNum(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default function RiskAnalyticsPage() {
  const [status, setStatus] = useState<MLStatus | null>(null);
  const [metrics, setMetrics] = useState<MLMetrics | null>(null);
  const [mlDown, setMlDown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMlDown(false);
    try {
      const [s, m] = await Promise.all([mlApi.status(), mlApi.metrics()]);
      setStatus(s);
      setMetrics(m);
    } catch (err: unknown) {
      interface ApiErrorDetail {
        response?: { status?: number };
      }
      if ((err as ApiErrorDetail).response?.status === 503) {
        setMlDown(true);
      } else {
        setError('Unable to load ML analytics from the backend.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={36} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (mlDown) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-white tracking-tight">Risk Analytics</h1>
        </header>
        <Card className="p-10 text-center text-slate-400">ML model unavailable.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex items-center gap-3">
        <BarChart3 className="text-primary" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Risk Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Verified detector: {status?.model_name ?? '—'} ({status?.model_type ?? '—'})
          </p>
        </div>
      </header>

      {/* Mandatory honesty banner */}
      <div className="bg-risk-medium/10 border border-risk-medium/40 rounded-xl p-4 flex items-start gap-3">
        <Info size={18} className="text-risk-medium mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-risk-medium">
            Synthetic held-out test metrics — not live production performance.
          </p>
          <p className="text-slate-400 mt-1">{metrics?.note}</p>
        </div>
      </div>

      {/* Model identity */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricTile label="Model Version" value={status?.model_version ?? '—'} mono />
        <MetricTile label="Decision Threshold" value={fmtNum(status?.threshold)} />
        <MetricTile label="Feature Count" value={String(status?.feature_count ?? '—')} />
        <MetricTile label="Status" value={status?.status?.toUpperCase() ?? '—'} tone="text-risk-low" />
      </section>

      {/* Scalar quality metrics */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricTile label="Precision" value={fmtPct(metrics?.precision)} />
        <MetricTile label="Recall" value={fmtPct(metrics?.recall)} />
        <MetricTile label="F1" value={fmtPct(metrics?.f1)} />
        <MetricTile label="PR-AUC" value={fmtPct(metrics?.pr_auc)} />
        <MetricTile label="ROC-AUC" value={fmtPct(metrics?.roc_auc)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confusion matrix */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Confusion Matrix</h2>
          <p className="text-xs text-slate-500 mb-4">Held-out test split (synthetic data)</p>
          <ConfusionMatrixGrid
            tp={metrics?.true_positive ?? null}
            tn={metrics?.true_negative ?? null}
            fp={metrics?.false_positive ?? null}
            fn={metrics?.false_negative ?? null}
          />
        </Card>

        {/* Business costs */}
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-1">
            <FlaskConical size={15} className="text-primary" /> Held-out Cost Breakdown
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Cost model used for threshold selection (synthetic data)
          </p>
          <dl className="space-y-3">
            <CostRow label="FP cost (review overhead)" value={`₹${fmtNum(metrics?.false_positive_cost)}`} />
            <CostRow label="FN cost (missed fraud)" value={`₹${fmtNum(metrics?.false_negative_cost)}`} />
            <CostRow
              label="Total held-out cost"
              value={`₹${fmtNum(metrics?.total_expected_loss)}`}
              emphasized
            />
          </dl>
          <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
            The ₹150 total is the one-off evaluation result on the synthetic held-out test split —
            it is not a live or expected business loss figure.
          </p>
        </Card>
      </section>

      <p className="text-xs text-slate-600">
        ROC and precision-recall curves are intentionally not rendered: the API exposes only scalar
        summary metrics, and no chart points are fabricated for display.
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  mono,
  tone = 'text-white',
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={`mt-1.5 text-lg font-bold tabular-nums truncate ${tone} ${mono ? 'font-mono text-sm' : ''}`}
        title={value}
      >
        {value}
      </p>
    </Card>
  );
}

function CostRow({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-4 py-3 border ${
        emphasized
          ? 'border-risk-critical/40 bg-risk-critical/10'
          : 'border-slate-800 bg-slate-950/60'
      }`}
    >
      <dt className="text-sm text-slate-300">{label}</dt>
      <dd className={`${emphasized ? 'text-risk-critical' : 'text-white'} font-bold tabular-nums`}>
        {value}
      </dd>
    </div>
  );
}
