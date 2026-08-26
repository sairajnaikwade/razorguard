import { History } from 'lucide-react';

import type { AuditEvent } from '../../services/api';
import EmptyState from '../ui/EmptyState';
import Spinner from '../ui/Spinner';

function fmtTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface AuditTimelineProps {
  events: AuditEvent[] | null;
  loading: boolean;
}

/** Newest-first audit trail for one transaction (server-sorted). */
export default function AuditTimeline({ events, loading }: AuditTimelineProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return <EmptyState icon={<History size={32} />} title="No audit events recorded." />;
  }

  return (
    <ol className="relative border-l border-slate-800 ml-3 space-y-5">
      {events.map((event) => (
        <li key={event.id} className="ml-5">
          <span
            className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-primary border-2 border-dark"
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-semibold text-white">{event.event}</p>
            {event.actor && (
              <span className="text-xs text-slate-400">by {event.actor}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{fmtTimestamp(event.timestamp)}</p>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="mt-1.5 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-400 space-y-0.5">
              {Object.entries(event.metadata).map(([key, value]) => (
                <div key={key}>
                  <span className="text-slate-500">{key}</span>:{' '}
                  <span className="text-slate-300">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
