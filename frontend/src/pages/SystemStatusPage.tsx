import { useCallback, useEffect, useState } from 'react';
import { Activity, Database, Server, Cpu, RefreshCw } from 'lucide-react';

import { healthApi, mlApi, type HealthStatus, type MLStatus } from '../services/api';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';

interface ServiceRow {
  name: string;
  icon: React.ReactNode;
  status: 'healthy' | 'unhealthy' | 'unavailable' | 'degraded' | null;
  detail?: string;
}

export default function SystemStatusPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: ServiceRow[] = [
    {
      name: 'API',
      icon: <Activity size={18} />,
      status: health ? (health.status === 'healthy' ? 'healthy' : 'degraded') : null,
      detail: health ? `Overall: ${health.status}` : undefined,
    },
    {
      name: 'PostgreSQL',
      icon: <Database size={18} />,
      status: health?.database as ServiceRow['status'] ?? null,
    },
    {
      name: 'Redis',
      icon: <Server size={18} />,
      status: health?.redis as ServiceRow['status'] ?? null,
    },
    {
      name: 'ML Model',
      icon: <Cpu size={18} />,
      status: health?.ml_model as ServiceRow['status'] ?? null,
      detail: mlStatus ? `${mlStatus.model_name} · v${mlStatus.model_version}` : 'Artifacts not loaded',
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Status</h1>
          <p className="text-slate-400 text-sm mt-1">Live service health from the backend.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </header>

      {error && !health ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && !health ? (
        <div className="flex justify-center py-24">
          <Spinner size={32} />
        </div>
      ) : (
        <Card className="divide-y divide-slate-800/70">
          {rows.map((row) => (
            <div key={row.name} className="flex items-center justify-between px-5 py-4 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`p-2 rounded-lg border ${
                    row.status === 'healthy'
                      ? 'border-risk-low/30 bg-risk-low/10 text-risk-low'
                      : 'border-slate-800 bg-slate-950 text-slate-500'
                  }`}
                >
                  {row.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{row.name}</p>
                  {row.detail && (
                    <p className="text-xs text-slate-500 truncate font-mono">{row.detail}</p>
                  )}
                </div>
              </div>
              <span className="flex items-center gap-2 shrink-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    row.status === 'healthy' ? 'bg-risk-low' : 'bg-risk-critical animate-pulse'
                  }`}
                  aria-hidden
                />
                <span
                  className={`text-xs capitalize ${
                    row.status === 'healthy' ? 'text-risk-low' : 'text-risk-critical'
                  }`}
                >
                  {row.status ?? 'unknown'}
                </span>
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
