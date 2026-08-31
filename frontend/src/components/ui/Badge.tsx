import type { RiskLevel } from '../../services/api';

type BadgeVariant = RiskLevel | 'neutral' | 'info' | 'success';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  CRITICAL: 'bg-risk-critical/12 text-risk-critical border-risk-critical/40',
  HIGH:     'bg-risk-high/12 text-risk-high border-risk-high/40',
  MEDIUM:   'bg-risk-medium/12 text-risk-medium border-risk-medium/40',
  LOW:      'bg-risk-low/12 text-risk-low border-risk-low/40',
  info:     'bg-primary/10 text-primary border-primary/30',
  success:  'bg-risk-low/12 text-risk-low border-risk-low/40',
  neutral:  'bg-white/5 text-slate-400 border-[#142238]',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold tracking-wide whitespace-nowrap ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function riskLevelVariant(level: string | null | undefined): BadgeVariant {
  if (level === 'CRITICAL' || level === 'HIGH' || level === 'MEDIUM' || level === 'LOW') return level;
  return 'neutral';
}

export function decisionVariant(decision: string | null | undefined): BadgeVariant {
  switch (decision) {
    case 'REVIEW':  return 'HIGH';
    case 'MONITOR': return 'MEDIUM';
    case 'ALLOW':   return 'LOW';
    default:        return 'neutral';
  }
}
