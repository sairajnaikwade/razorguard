import { Clock, History } from 'lucide-react';

import type { AuditEvent } from '../../services/api';
import EmptyState from '../ui/EmptyState';
import Spinner from '../ui/Spinner';

function fmtTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function dotClass(event: string): string {
  const u = event.toUpperCase();
  if (u.includes('FRAUD') || u.includes('CRITICAL') || u.includes('ESCALAT')) return 'bg-risk-critical';
  if (u.includes('HIGH') || u.includes('REVIEW'))                              return 'bg-risk-high';
  if (u.includes('MEDIUM') || u.includes('MONITOR'))                           return 'bg-risk-medium';
  if (u.includes('LOW') || u.includes('ALLOW'))                                return 'bg-risk-low';
  if (u.includes('AI') || u.includes('GEMINI') || u.includes('INVEST'))        return 'bg-primary';
  return 'bg-slate-500';
}

interface AuditTimelineProps {
  events: AuditEvent[] | null;
  loading: boolean;
}

export default function AuditTimeline({ events, loading }: AuditTimelineProps) {
  if (loading) return (
    <div className="flex items-center justify-center py-6">
      <Spinner size={18} />
    </div>
  );

  if (!events || events.length === 0) return (
    <EmptyState icon={<History size={22} />} title="No audit events recorded." />
  );

  return (
    <ol className="relative space-y-0" aria-label="Audit timeline">
      {/* Vertical track line */}
      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[#142238]" aria-hidden />

      {events.map((event) => (
        <li key={event.id} className="relative pl-6 pb-4 last:pb-0">
          {/* Dot */}
          <span
            className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${dotClass(event.event)}`}
            aria-hidden
          />

          {/* Event name */}
          <p className="text-xs font-semibold text-slate-200 leading-snug">{event.event}</p>

          {/* Actor + timestamp */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
            {event.actor && (
              <span className="text-[10px] text-slate-500">{event.actor}</span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-slate-600 tabular-nums">
              <Clock size={9} />
              {fmtTimestamp(event.timestamp)}
            </span>
          </div>

          {/* Metadata */}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="mt-1.5 bg-[#06101F] border border-[#142238] rounded px-2.5 py-1.5 space-y-0.5">
              {Object.entries(event.metadata).map(([k, v]) => (
                <div key={k} className="flex gap-2 mono-id">
                  <span className="text-slate-600 shrink-0">{k}:</span>
                  <span className="text-slate-400 break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
