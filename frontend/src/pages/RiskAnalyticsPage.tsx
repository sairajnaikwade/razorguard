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
    <div className="px-4 py-2.5 border-b border-[#142238]">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
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
    <div className="px-4 py-3 border-r border-b border-[#142238] last:border-r-0 flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">
        {label}
      </span>
      <span
        className={`text-xl font-bold tabular-nums leading-tight truncate ${colour} ${mono ? 'mono-id' : ''}`}
        title={value}
      >
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-slate-600 leading-tight">{hint}</span>
      )}
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
    <div className={`flex items-start justify-between gap-4 px-4 py-3 border-b border-[#142238] last:border-b-0 ${
      emphasized ? 'bg-white/[0.025]' : ''
    }`}>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${emphasized ? 'text-slate-100' : 'text-slate-300'}`}>
          {label}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">{sublabel}</p>
      </div>
      <p className={`text-sm font-bold tabular-nums shrink-0 ${emphasized ? 'text-white' : 'text-slate-200'}`}>
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
    <div className="flex flex-col items-center justify-center py-28 gap-3">
      <Spinner size={28} />
      <p className="text-slate-500 text-sm">Loading ML analytics…</p>
    </div>
  );

  if (error) return <ErrorState message={error} onRetry={load} />;

  if (mlDown) return (
    <div className="space-y-4 animate-fade-in">
      <header>
        <h1 className="text-xl font-bold text-white tracking-tight">Risk Analytics</h1>
        <p className="text-slate-400 text-sm mt-0.5">ML model performance and threshold metrics</p>
      </header>
      <div className="bg-[#0B1728] border border-[#142238] rounded p-10 text-center">
        <Zap size={24} className="mx-auto text-slate-600 mb-3" />
        <p className="text-slate-400 text-sm">ML model is currently unavailable.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header>
        <h1 className="text-xl font-bold text-white tracking-tight">Risk Analytics</h1>
        {status && (
          <p className="text-slate-400 text-sm mt-0.5">
            <span className="mono-id">{status.model_name}</span>
            {' · '}{status.model_type}
          </p>
        )}
      </header>

      {/* ── Disclaimer ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-[#0B1728] border border-[#142238] rounded px-4 py-3">
        <Info size={14} className="text-risk-medium shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-risk-medium">
            Synthetic held-out test metrics — not live production performance.
          </p>
          {metrics?.note && (
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">{metrics.note}</p>
          )}
        </div>
      </div>

      {/* ── Model Identity ─────────────────────────────────────────── */}
      <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">
        <PanelHeader title="Model Identity" />
        {/* 4-col flex row — wraps to 2-col on mobile */}
        <div className="grid grid-cols-2 md:grid-cols-4">
          <StatCell label="Model Name"         value={status?.model_name    ?? '—'} mono />
          <StatCell label="Version"            value={status?.model_version ?? '—'} mono />
          <StatCell label="Type"               value={status?.model_type    ?? '—'} />
          <StatCell
            label="Status"
            value={status?.status?.toUpperCase() ?? '—'}
            colour={status?.status === 'loaded' || status?.status === 'healthy' ? 'text-risk-low' : 'text-slate-400'}
          />
          <StatCell label="Feature Count"      value={String(status?.feature_count ?? '—')} />
          <StatCell
            label="Decision Threshold"
            value={status?.threshold != null ? status.threshold.toFixed(2) : '—'}
            hint="Scores above this are flagged"
          />
        </div>
      </div>

      {/* ── Quality Metrics ────────────────────────────────────────── */}
      <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">
        <PanelHeader title="Model Quality Metrics" sub="Held-out test split · synthetic data" />
        {/* 5-col on lg, 3-col on md, 2-col on mobile */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <StatCell
            label="Precision"
            value={fmtPct(metrics?.precision)}
            colour={metricColour(metrics?.precision)}
            hint="Of flagged, how many were fraud"
          />
          <StatCell
            label="Recall"
            value={fmtPct(metrics?.recall)}
            colour={metricColour(metrics?.recall)}
            hint="Of all fraud, how many caught"
          />
          <StatCell
            label="F1 Score"
            value={fmtPct(metrics?.f1)}
            colour={metricColour(metrics?.f1)}
            hint="Harmonic mean of P and R"
          />
          <StatCell
            label="PR-AUC"
            value={fmtPct(metrics?.pr_auc)}
            colour={metricColour(metrics?.pr_auc)}
            hint="Precision-recall area"
          />
          <StatCell
            label="ROC-AUC"
            value={fmtPct(metrics?.roc_auc)}
            colour={metricColour(metrics?.roc_auc)}
            hint="Discrimination ability"
          />
        </div>
      </div>

      {/* ── Confusion Matrix + Cost Breakdown ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Confusion Matrix */}
        <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">
          <PanelHeader title="Confusion Matrix" sub="Held-out test split · synthetic data" />
          <div className="p-5">
            <ConfusionMatrixGrid
              tp={metrics?.true_positive ?? null}
              tn={metrics?.true_negative ?? null}
              fp={metrics?.false_positive ?? null}
              fn={metrics?.false_negative ?? null}
            />
            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-[#142238] grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-[11px] text-slate-500">
                <span className="text-risk-low font-semibold">TP</span> — fraud caught correctly
              </span>
              <span className="text-[11px] text-slate-500">
                <span className="text-risk-high font-semibold">FP</span> — legit flagged as fraud
              </span>
              <span className="text-[11px] text-slate-500">
                <span className="text-risk-critical font-semibold">FN</span> — fraud missed
              </span>
              <span className="text-[11px] text-slate-500">
                <span className="text-primary font-semibold">TN</span> — legit allowed correctly
              </span>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">
          <PanelHeader title="Held-out Cost Breakdown" sub="Cost model for threshold selection · synthetic" />
          <div>
            <CostRow
              label="FP cost"
              sublabel="Review overhead per false alarm"
              value={`₹${fmtNum(metrics?.false_positive_cost)}`}
            />
            <CostRow
              label="FN cost"
              sublabel="Estimated loss per missed fraud"
              value={`₹${fmtNum(metrics?.false_negative_cost)}`}
            />
            <CostRow
              label="Total held-out cost"
              sublabel="Single evaluation on synthetic test split"
              value={`₹${fmtNum(metrics?.total_expected_loss)}`}
              emphasized
            />
          </div>
          <div className="px-4 py-2.5 border-t border-[#142238]">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Not a live or expected business loss — reflects one evaluation run on the synthetic
              held-out split used for threshold selection.
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer note ─────────────────────────────────────────────── */}
      <p className="text-xs text-slate-600 pb-2">
        ROC and precision-recall curves are intentionally not rendered — the API exposes only scalar
        summary metrics, and no chart points are fabricated for display.
      </p>
    </div>
  );
}
