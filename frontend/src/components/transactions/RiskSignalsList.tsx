import { AlertOctagon, AlertTriangle, Minus } from 'lucide-react';

interface RiskSignalsListProps {
  signals: string[];
}

type Tier = 'critical' | 'high' | 'default';

function tier(signal: string): Tier {
  const u = signal.toUpperCase();
  if (u.includes('CRITICAL') || u.includes('FRAUD') || u.includes('HIGH_RISK') || u.includes('BLOCK'))
    return 'critical';
  if (
    u.includes('MULTIPLE') || u.includes('UNUSUAL') || u.includes('SUSPICIOUS') ||
    u.includes('FAIL') || u.includes('NEW DEVICE') || u.includes('COUNTRY') ||
    u.includes('LOCATION') || u.includes('ABNORMAL') || u.includes('VELOCITY') ||
    u.includes('CHANGE')
  ) return 'high';
  return 'default';
}

const TIER_STYLES: Record<Tier, { row: string; icon: React.ReactNode; dot: string }> = {
  critical: {
    row:  'border-risk-critical/20',
    icon: <AlertOctagon size={11} className="text-risk-critical shrink-0" />,
    dot:  'bg-risk-critical',
  },
  high: {
    row:  'border-risk-high/20',
    icon: <AlertTriangle size={11} className="text-risk-high shrink-0" />,
    dot:  'bg-risk-high',
  },
  default: {
    row:  'border-[#142238] bg-transparent',
    icon: <Minus size={11} className="text-slate-600 shrink-0" />,
    dot:  'bg-slate-600',
  },
};

export default function RiskSignalsList({ signals }: RiskSignalsListProps) {
  if (!signals.length) {
    return (
      <p className="text-slate-500 text-xs py-2 text-center">No risk signals recorded.</p>
    );
  }

  return (
    <ul className="space-y-1" aria-label="Risk signals">
      {signals.map((signal) => {
        const t = tier(signal);
        const s = TIER_STYLES[t];
        return (
          <li
            key={signal}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs ${s.row}`}
          >
            {s.icon}
            <span className="text-slate-300 leading-snug">{signal}</span>
          </li>
        );
      })}
    </ul>
  );
}
