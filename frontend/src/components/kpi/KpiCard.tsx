import type { LucideIcon } from 'lucide-react';

import Card from '../ui/Card';

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'default' | 'critical' | 'high' | 'medium' | 'low' | 'primary';
  hint?: string;
  loading?: boolean;
}

const TONES = {
  default: { text: 'text-white', ring: 'border-slate-800', glow: '' },
  critical: { text: 'text-risk-critical', ring: 'border-risk-critical/30', glow: '' },
  high: { text: 'text-risk-high', ring: 'border-risk-high/30', glow: '' },
  medium: { text: 'text-risk-medium', ring: 'border-risk-medium/30', glow: '' },
  low: { text: 'text-risk-low', ring: 'border-risk-low/30', glow: '' },
  primary: { text: 'text-primary', ring: 'border-primary/30', glow: '' },
};

export default function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  hint,
  loading,
}: KpiCardProps) {
  const t = TONES[tone];
  return (
    <Card className={`p-5 ${t.ring}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <Icon size={18} className={`${t.text} opacity-80`} aria-hidden />
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${t.text}`}>
        {loading ? '…' : value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </Card>
  );
}
