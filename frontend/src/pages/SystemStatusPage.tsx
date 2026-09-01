import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  RefreshCw,
  Server,
  XCircle,
} from 'lucide-react';

import { healthApi, mlApi, type HealthStatus, type MLStatus } from '../services/api';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';

type ServiceStatus = 'healthy' | 'unhealthy' | 'unavailable' | 'degraded' | null;

interface ServiceRow {
  name: string;
  icon: React.ReactNode;
  status: ServiceStatus;
  detail?: string;
}

// ─── Status dot + label ───────────────────────────────────────────────────────
function StatusIndicator({ status }: { status: ServiceStatus }) {
  if (status === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        HEALTHY
      </span>
    );
  }
  if (status === null) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        UNKNOWN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
      {status.toUpperCase()}
    </span>
  );
}

// ─── Service row (one per service) ───────────────────────────────────────────
function ServiceRow({ row }: { row: ServiceRow }) {
  const healthy  = row.status === 'healthy';
  const degraded = row.status !== null && row.status !== 'healthy';

  return (
    <div className={`flex items-center gap-4 px-5 py-4 border-b border-[#162A45]/70 last:border-b-0 hover:bg-[#0D1D35]/80 transition-colors ${
      degraded ? 'bg-red-500/5' : ''
    }`}>
      {/* Icon */}
      <div className={`p-2.5 rounded-xl border ${healthy ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : degraded ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'} shrink-0`}>
        {row.icon}
      </div>

      {/* Name + detail */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-100">{row.name}</p>
        {row.detail && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate mono-id font-medium">{row.detail}</p>
        )}
      </div>

      {/* Status indicator */}
      <div className="shrink-0">
        <StatusIndicator status={row.status} />
      </div>

      {/* Status icon */}
      <div className="shrink-0 hidden sm:block">
        {healthy  ? <CheckCircle2 size={16} className="text-emerald-400" /> :
         degraded ? <XCircle      size={16} className="text-red-400" /> :
                    <span className="w-4 h-4 block" />}
      </div>
    </div>
  );
}

// ─── ML detail row ────────────────────────────────────────────────────────────
function DetailRow({ label, value, mono = false, colour = 'text-slate-200' }: {
  label: string; value: string; mono?: boolean; colour?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-3 border-b border-[#162A45]/70 last:border-b-0 min-h-[44px]">
      <span className="text-xs font-semibold text-slate-400 shrink-0 leading-snug">{label}</span>
      <span
        className={`text-xs sm:text-sm font-bold text-right min-w-0 break-words max-w-[65%] ${colour} ${mono ? 'mono-id text-blue-300' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SystemStatusPage() {
  const [health, setHealth]         = useState<HealthStatus | null>(null);
  const [mlStatus, setMlStatus]     = useState<MLStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await healthApi.check());
    } catch {
      setError('Backend API is unreachable.');
      setHealth(null);
    }
    try {
      setMlStatus(await mlApi.status());
    } catch {
      setMlStatus(null);
    }
    setLastChecked(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows: ServiceRow[] = [
    {
      name:   'FastAPI Gateway',
      icon:   <Activity size={18} />,
      status: health ? (health.status === 'healthy' ? 'healthy' : 'degraded') : null,
      detail: health?.status ? `Service Status: ${health.status}` : undefined,
    },
    {
      name:   'PostgreSQL Storage',
      icon:   <Database size={18} />,
      status: (health?.database as ServiceStatus) ?? null,
      detail: 'Primary relational database connection',
    },
    {
      name:   'Redis Cache & Limiter',
      icon:   <Server size={18} />,
      status: (health?.redis as ServiceStatus) ?? null,
      detail: 'JWT sessions & login rate-limit cache',
    },
    {
      name:   'Random Forest ML Engine',
      icon:   <Cpu size={18} />,
      status: (health?.ml_model as ServiceStatus) ?? null,
      detail: mlStatus
        ? `${mlStatus.model_name ?? '—'} · v${mlStatus.model_version ?? '—'}`
        : 'Artifacts state checking',
    },
  ];

  const allHealthy   = rows.every((r) => r.status === 'healthy');
  const healthyCount = rows.filter((r) => r.status === 'healthy').length;

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl pb-4">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 flex-wrap bg-[#0A1628]/60 border border-[#162A45]/60 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">System Infrastructure Status</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5 font-medium">
            Live health telemetry &amp; service readiness
            {lastChecked && (
              <span className="text-slate-400 ml-2 mono-id text-xs font-semibold">
                · Last check: {lastChecked.toLocaleTimeString('en-IN', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                })}
              </span>
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading} className="rounded-xl shadow-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Status
        </Button>
      </header>

      {/* ── Loading / error ─────────────────────────────────────────── */}
      {error && !health && (
        <ErrorState message={error} onRetry={load} />
      )}
      {loading && !health && !error && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Spinner size={28} />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Checking infrastructure status…</p>
        </div>
      )}

      {/* ── Overall status banner ──────────────────────────────────────── */}
      {!loading && health && (
        <div className={`flex items-center gap-4 p-4 sm:p-5 border rounded-2xl shadow-lg ${
          allHealthy
            ? 'bg-[#0A1628]/90 border-emerald-500/30'
            : 'bg-[#0A1628]/90 border-red-500/30'
        }`}>
          <div className={`p-3 rounded-xl shrink-0 ${allHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {allHealthy
              ? <CheckCircle2 size={24} />
              : <AlertTriangle size={24} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`text-sm sm:text-base font-bold ${allHealthy ? 'text-emerald-300' : 'text-red-400'}`}>
              {allHealthy ? 'All Systems Operational' : `${healthyCount} of ${rows.length} Services Operational`}
            </h2>
            <p className="text-slate-300 text-xs mt-0.5 font-medium">
              {allHealthy
                ? 'RazorGuard platform services are healthy and processing real-time fraud scores.'
                : 'One or more system components require attention.'}
            </p>
          </div>
          <span className={`text-base font-black tabular-nums mono-id shrink-0 px-3 py-1 rounded-xl bg-[#081220] border ${allHealthy ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'}`}>
            {healthyCount} / {rows.length}
          </span>
        </div>
      )}

      {/* ── Service rows ────────────────────────────────────────────── */}
      {health && (
        <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg">
          <div className="px-5 py-3.5 border-b border-[#162A45]/80 bg-[#081220]/60 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Core Services</h2>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Health Checks</span>
          </div>
          {rows.map((row) => (
            <ServiceRow key={row.name} row={row} />
          ))}
        </div>
      )}

      {/* ── ML Model details ─────────────────────────────────────────── */}
      {mlStatus && (
        <div className="bg-[#0A1628]/90 border border-[#162A45] rounded-2xl overflow-hidden shadow-lg">
          <div className="px-5 py-3.5 border-b border-[#162A45]/80 bg-[#081220]/60 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">ML Model Parameters</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
              Loaded Engine
            </span>
          </div>
          <DetailRow label="Model Identifier"  value={mlStatus.model_name     ?? '—'} mono />
          <DetailRow label="Artifact Version"  value={mlStatus.model_version  ?? '—'} mono />
          <DetailRow label="Algorithm Type"    value={mlStatus.model_type     ?? '—'} />
          <DetailRow
            label="Service Status"
            value={mlStatus.status?.toUpperCase() ?? '—'}
            colour={mlStatus.status === 'loaded' || mlStatus.status === 'healthy' ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}
          />
          <DetailRow label="Feature Count"      value={String(mlStatus.feature_count ?? '—')} mono />
          <DetailRow
            label="Decision Threshold"
            value={mlStatus.threshold != null ? mlStatus.threshold.toFixed(2) : '—'}
            mono
            colour="text-cyan-400 font-bold"
          />
        </div>
      )}

    </div>
  );
}
