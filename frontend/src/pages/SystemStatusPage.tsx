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
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-risk-low">
        <span className="w-2 h-2 rounded-full bg-risk-low shrink-0" />
        HEALTHY
      </span>
    );
  }
  if (status === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
        <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
        UNKNOWN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-risk-critical">
      <span className="w-2 h-2 rounded-full bg-risk-critical shrink-0" />
      {status.toUpperCase()}
    </span>
  );
}

// ─── Service row (one per service) ───────────────────────────────────────────
function ServiceRow({ row }: { row: ServiceRow }) {
  const healthy  = row.status === 'healthy';
  const degraded = row.status !== null && row.status !== 'healthy';

  return (
    <div className={`flex items-center gap-4 px-4 py-3 border-b border-[#142238] last:border-b-0 ${
      degraded ? 'bg-risk-critical/[0.03]' : ''
    }`}>
      {/* Icon */}
      <span className={`shrink-0 ${healthy ? 'text-slate-400' : degraded ? 'text-risk-critical' : 'text-slate-600'}`}>
        {row.icon}
      </span>

      {/* Name + detail */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200">{row.name}</p>
        {row.detail && (
          <p className="text-[11px] text-slate-500 mt-0.5 truncate mono-id">{row.detail}</p>
        )}
      </div>

      {/* Status indicator */}
      <div className="shrink-0">
        <StatusIndicator status={row.status} />
      </div>

      {/* Status icon */}
      <div className="shrink-0 hidden sm:block">
        {healthy  ? <CheckCircle2 size={15} className="text-risk-low" /> :
         degraded ? <XCircle      size={15} className="text-risk-critical" /> :
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
    <div className="flex items-center justify-between gap-6 px-4 py-2.5 border-b border-[#142238] last:border-b-0 min-h-[44px]">
      <span className="text-xs text-slate-500 shrink-0 leading-snug">{label}</span>
      <span
        className={`text-sm font-semibold text-right min-w-0 break-words max-w-[65%] ${colour} ${mono ? 'mono-id' : ''}`}
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
      name:   'API Gateway',
      icon:   <Activity size={16} />,
      status: health ? (health.status === 'healthy' ? 'healthy' : 'degraded') : null,
      detail: health?.status ?? undefined,
    },
    {
      name:   'PostgreSQL',
      icon:   <Database size={16} />,
      status: (health?.database as ServiceStatus) ?? null,
      detail: 'Primary database',
    },
    {
      name:   'Redis Cache',
      icon:   <Server size={16} />,
      status: (health?.redis as ServiceStatus) ?? null,
      detail: 'Session & rate-limit cache',
    },
    {
      name:   'ML Model',
      icon:   <Cpu size={16} />,
      status: (health?.ml_model as ServiceStatus) ?? null,
      detail: mlStatus
        ? `${mlStatus.model_name ?? '—'} · v${mlStatus.model_version ?? '—'}`
        : 'Artifacts not loaded',
    },
  ];

  const allHealthy   = rows.every((r) => r.status === 'healthy');
  const healthyCount = rows.filter((r) => r.status === 'healthy').length;

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">System Status</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Live service health
            {lastChecked && (
              <span className="text-slate-600 ml-2 mono-id text-xs">
                · checked {lastChecked.toLocaleTimeString('en-IN', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                })}
              </span>
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </header>

      {/* ── Loading / error ─────────────────────────────────────────── */}
      {error && !health && (
        <ErrorState message={error} onRetry={load} />
      )}
      {loading && !health && !error && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner size={24} />
          <p className="text-slate-500 text-sm">Checking services…</p>
        </div>
      )}

      {/* ── Overall status bar ──────────────────────────────────────── */}
      {!loading && health && (
        <div className={`flex items-center gap-3 px-4 py-3 border rounded ${
          allHealthy
            ? 'bg-risk-low/5 border-risk-low/25'
            : 'bg-risk-critical/5 border-risk-critical/25'
        }`}>
          {allHealthy
            ? <CheckCircle2 size={16} className="text-risk-low shrink-0" />
            : <AlertTriangle size={16} className="text-risk-critical shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <span className={`text-sm font-semibold ${allHealthy ? 'text-risk-low' : 'text-risk-critical'}`}>
              {allHealthy ? 'All systems operational' : `${healthyCount} of ${rows.length} services healthy`}
            </span>
            <span className="text-slate-500 text-xs ml-3">
              {allHealthy
                ? 'RazorGuard is running normally.'
                : 'One or more services are degraded.'}
            </span>
          </div>
          <span className={`text-sm font-bold tabular-nums mono-id shrink-0 ${allHealthy ? 'text-risk-low' : 'text-risk-critical'}`}>
            {healthyCount}/{rows.length}
          </span>
        </div>
      )}

      {/* ── Service rows ────────────────────────────────────────────── */}
      {health && (
        <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#142238]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Services</h2>
          </div>
          {rows.map((row) => (
            <ServiceRow key={row.name} row={row} />
          ))}
        </div>
      )}

      {/* ── ML Model details ─────────────────────────────────────────── */}
      {mlStatus && (
        <div className="bg-[#0B1728] border border-[#142238] rounded overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#142238]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">ML Model</h2>
          </div>
          <DetailRow label="Model Name"  value={mlStatus.model_name     ?? '—'} mono />
          <DetailRow label="Version"     value={mlStatus.model_version  ?? '—'} mono />
          <DetailRow label="Type"        value={mlStatus.model_type     ?? '—'} />
          <DetailRow
            label="Status"
            value={mlStatus.status?.toUpperCase() ?? '—'}
            colour={mlStatus.status === 'loaded' || mlStatus.status === 'healthy' ? 'text-risk-low' : 'text-slate-400'}
          />
          <DetailRow label="Features"   value={String(mlStatus.feature_count ?? '—')} mono />
          <DetailRow
            label="Decision Threshold"
            value={mlStatus.threshold != null ? mlStatus.threshold.toFixed(2) : '—'}
            mono
          />
        </div>
      )}

    </div>
  );
}
