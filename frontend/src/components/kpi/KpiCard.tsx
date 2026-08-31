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
  default:  { text: 'text-white',         icon: 'text-slate-400',     ring: 'border-[#1A2A45]/90',     bg: '' },
  critical: { text: 'text-risk-critical', icon: 'text-risk-critical', ring: 'border-risk-critical/25', bg: 'bg-risk-critical/5' },
  high:     { text: 'text-risk-high',     icon: 'text-risk-high',     ring: 'border-risk-high/25',     bg: 'bg-risk-high/5' },
  medium:   { text: 'text-risk-medium',   icon: 'text-risk-medium',   ring: 'border-risk-medium/25',   bg: 'bg-risk-medium/5' },
  low:      { text: 'text-risk-low',      icon: 'text-risk-low',      ring: 'border-risk-low/25',      bg: 'bg-risk-low/5' },
  primary:  { text: 'text-primary',       icon: 'text-primary',       ring: 'border-primary/25',       bg: 'bg-primary/5' },
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
    /* kpi-card class applies staggered kpiCardIn animation defined in index.css.
       We do NOT set opacity-0 here — the animation itself starts from opacity:0,
       and prefers-reduced-motion overrides it to opacity:1 immediately. */
    <Card className={`kpi-card p-4 sm:p-5 ${t.ring} ${t.bg} hover:border-opacity-60 transition-all duration-200`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-tight">
          {label}
        </p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[#0F1F36]/70">
          <Icon size={14} className={t.icon} aria-hidden />
        </div>
      </div>
      <p
        className={`mt-2.5 text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${t.text} ${loading ? 'opacity-40' : ''}`}
      >
        {loading ? '—' : value}
      </p>
      {hint && (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500 border-t border-[#1A2A45]/70 pt-1.5">
          {hint}
        </p>
      )}
    </Card>
  );
}
