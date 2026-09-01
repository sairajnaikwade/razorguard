import { useCallback, useEffect, useState } from 'react';
import { Info, Zap } from 'lucide-react';

import { mlApi, type MLMetrics, type MLStatus } from '../services/api';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import ConfusionMatrixGrid from '../components/charts/ConfusionMatrixGrid';

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
}

function fmtNum(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function metricColour(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'text-slate-400';
  if (value >= 0.85) return 'text-risk-low';
  if (value >= 0.70) return 'text-risk-medium';
  return 'text-risk-high';
}

// ─── Shared panel header ──────────────────────────────────────────────────────
function PanelHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5 py-4 border-b border-[#162A45]/80 bg-[#081220]/60 flex items-center justify-between">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</h2>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{sub}</p>}
      </div>
      <span className="w-2 h-2 rounded-full bg-blue-500/40" />
    </div>
  );
}

// ─── Metric stat cell (used in identity + quality grids) ─────────────────────
function StatCell({
  label, value, mono = false, colour = 'text-white', hint,
}: {
  label: string; value: string; mono?: boolean; colour?: string; hint?: string;
}) {
  return (
    <div className="p-4 bg-[#0A1628]/60 hover:bg-[#0D1D35]/90 border-r border-b border-[#162A45]/70 last:border-r-0 flex flex-col justify-between gap-1.5 transition-colors">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">
        {label}
      </span>
      <div>
        <span
          className={`text-xl font-black tabular-nums leading-tight truncate block ${colour} ${mono ? 'mono-id text-blue-300' : ''}`}
          title={value}
        >
          {value}
        </span>
        {hint && (
          <span className="text-[10px] text-slate-400 leading-tight block mt-1 font-medium">{hint}</span>
        )}
      </div>
    </div>
  );
}

// ─── Cost row ─────────────────────────────────────────────────────────────────
function CostRow({
  label, sublabel, value, emphasized = false,
}: {
  label: string; sublabel: string; value: string; emphasized?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 px-5 py-3.5 border-b border-[#162A45]/70 last:border-b-0 ${
      emphasized ? 'bg-blue-500/5' : ''
    }`}>
      <div className="min-w-0">
        <p className={`text-xs sm:text-sm font-bold ${emphasized ? 'text-white' : 'text-slate-200'}`}>
          {label}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{sublabel}</p>
      </div>
      <p className={`text-sm sm:text-base font-black tabular-nums shrink-0 ${emphasized ? 'text-cyan-400' : 'text-slate-100'}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RiskAnalyticsPage() {
  const [status, setStatus]   = useState<MLStatus | null>(null);
  const [metrics, setMetrics] = useState<MLMetrics | null>(null);
  const [mlDown, setMlDown]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setMlDown(false);
    try {
      const [s, m] = await Promise.all([mlApi.status(), mlApi.metrics()]);
      setStatus(s); setMetrics(m);
    } catch (err: unknown) {
      interface ApiErr { response?: { status?: number } }
      if ((err as ApiErr).response?.status === 503) setMlDown(true);
      else setError('Unable to load ML analytics from the backend.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-36 gap-3">
      <Spinner size={32} />
      <p className="text-slate-400 text-sm font-medium animate-pulse">Loading ML model metrics…</p>
    </div>
  );

  if (error) return <ErrorState message={error} onRetry={load} />;

  if (mlDown) return (
    <div className="space-y-5 animate-fade-in">
      <header className="bg-[#0A1628]/60 border border-[#162A45]/60 rounded-2xl p-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Risk Analytics</h1>
        <p className="text-slate-400 text-sm mt-0.5">ML model performance and threshold metrics</p>
      </header>
      <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl p-12 text-center shadow-lg">
        <Zap size={28} className="mx-auto text-amber-400 mb-3 animate-pulse" />
        <p className="text-slate-200 text-sm font-bold">ML model service is currently unavailable.</p>
        <p className="text-slate-500 text-xs mt-1">Please ensure the backend service and model artifacts are initialized.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl pb-4">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 flex-wrap bg-[#0A1628]/60 border border-[#162A45]/60 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Risk Analytics</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Random Forest v1.0
            </span>
          </div>
          {status && (
            <p className="text-slate-400 text-xs sm:text-sm mt-1 font-medium flex items-center gap-2">
              <span className="mono-id text-blue-300 font-semibold">{status.model_name}</span>
              <span className="text-slate-600">·</span>
              <span>{status.model_type}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Model Active &amp; Serving
        </div>
      </header>

      {/* ── Disclaimer ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3.5 bg-[#0A1628]/90 border border-amber-500/30 rounded-2xl p-4 sm:p-4.5 shadow-md">
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
          <Info size={16} />
        </div>
        <div>
          <p className="text-xs sm:text-sm font-bold text-amber-300">
            Synthetic Held-Out Test Split Evaluation
          </p>
          {metrics?.note && (
            <p className="text-slate-300 text-xs mt-1 leading-relaxed font-medium">{metrics.note}</p>
          )}
        </div>
      </div>

      {/* ── Model Identity ─────────────────────────────────────────── */}
      <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg">
        <PanelHeader title="Model Identity &amp; Runtime Parameters" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 border-t border-[#162A45]/80">
          <StatCell label="Model Identifier"  value={status?.model_name    ?? '—'} mono />
          <StatCell label="Artifact Version"  value={status?.model_version ?? '—'} mono />
          <StatCell label="Classifier Type"   value={status?.model_type    ?? '—'} />
          <StatCell
            label="Service State"
            value={status?.status?.toUpperCase() ?? '—'}
            colour={status?.status === 'loaded' || status?.status === 'healthy' ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}
          />
          <StatCell label="Feature Features"   value={String(status?.feature_count ?? '—')} />
          <StatCell
            label="Decision Threshold"
            value={status?.threshold != null ? status.threshold.toFixed(2) : '—'}
            hint="Flagged if score ≥ 0.30"
            colour="text-cyan-400 font-black"
          />
        </div>
      </div>

      {/* ── Quality Metrics ────────────────────────────────────────── */}
      <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg">
        <PanelHeader title="Model Performance Metrics" sub="Evaluated on held-out synthetic test dataset" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 border-t border-[#162A45]/80">
          <StatCell
            label="Precision"
            value={fmtPct(metrics?.precision)}
            colour={metricColour(metrics?.precision)}
            hint="True fraud / Total flagged"
          />
          <StatCell
            label="Recall"
            value={fmtPct(metrics?.recall)}
            colour={metricColour(metrics?.recall)}
            hint="Fraud caught / Total actual fraud"
          />
          <StatCell
            label="F1 Score"
            value={fmtPct(metrics?.f1)}
            colour={metricColour(metrics?.f1)}
            hint="Harmonic mean of P &amp; R"
          />
          <StatCell
            label="PR-AUC"
            value={fmtPct(metrics?.pr_auc)}
            colour={metricColour(metrics?.pr_auc)}
            hint="Precision-Recall Area"
          />
          <StatCell
            label="ROC-AUC"
            value={fmtPct(metrics?.roc_auc)}
            colour={metricColour(metrics?.roc_auc)}
            hint="Discrimination index"
          />
        </div>
      </div>

      {/* ── Confusion Matrix + Cost Breakdown ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Confusion Matrix */}
        <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between">
          <PanelHeader title="Confusion Matrix" sub="Classification outcomes on test dataset" />
          <div className="p-5">
            <ConfusionMatrixGrid
              tp={metrics?.true_positive ?? null}
              tn={metrics?.true_negative ?? null}
              fp={metrics?.false_positive ?? null}
              fn={metrics?.false_negative ?? null}
            />
            {/* Legend */}
            <div className="mt-5 pt-3.5 border-t border-[#162A45]/80 grid grid-cols-2 gap-x-4 gap-y-2">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <strong className="text-emerald-400 font-bold">TP:</strong> True Fraud Caught
              </span>
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                <strong className="text-orange-400 font-bold">FP:</strong> False Alarm (Legit Flagged)
              </span>
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <strong className="text-red-400 font-bold">FN:</strong> Missed Fraud
              </span>
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <strong className="text-blue-400 font-bold">TN:</strong> True Allowed
              </span>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between">
          <PanelHeader title="Held-Out Cost Breakdown" sub="Business cost simulation for decision threshold selection" />
          <div>
            <CostRow
              label="False Positive Cost (FP)"
              sublabel="Analyst review cost per false alarm"
              value={`₹${fmtNum(metrics?.false_positive_cost)}`}
            />
            <CostRow
              label="False Negative Cost (FN)"
              sublabel="Estimated loss per un-caught fraudulent transaction"
              value={`₹${fmtNum(metrics?.false_negative_cost)}`}
            />
            <CostRow
              label="Total Evaluation Cost"
              sublabel="Combined risk exposure on test dataset"
              value={`₹${fmtNum(metrics?.total_expected_loss)}`}
              emphasized
            />
          </div>
          <div className="px-5 py-3.5 border-t border-[#162A45]/80 bg-[#081220]/60">
            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              Modeled metric for threshold optimization. Reflects synthetic evaluation run on the held-out split.
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer note ─────────────────────────────────────────────── */}
      <p className="text-xs text-slate-400 px-1 font-medium">
        All scalar metrics reflect authoritative metadata generated during model serialization.
      </p>
    </div>
  );
}
